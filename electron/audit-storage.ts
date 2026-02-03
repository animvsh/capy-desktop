/**
 * Audit Storage Module (Electron Main Process)
 * SQLite database for audit entries with indexing and automatic cleanup
 */

import { app, ipcMain, BrowserWindow, desktopCapturer } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync, statSync } from 'fs';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import Database from 'better-sqlite3';

// ============================================================================
// Types (duplicated here for main process - avoid importing from renderer)
// ============================================================================

interface AuditEntry {
  id: string;
  timestamp: number;
  action: string;
  target: string;
  contentHash?: string;
  result: string;
  severity: string;
  screenshotPath?: string;
  screenshotPathBefore?: string;
  screenshotPathAfter?: string;
  runId?: string;
  stepIndex?: number;
  platform?: string;
  errorMessage?: string;
  durationMs?: number;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

interface AuditQuery {
  dateFrom?: number;
  dateTo?: number;
  actions?: string[];
  results?: string[];
  severities?: string[];
  targets?: string[];
  searchTerm?: string;
  runId?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: string;
}

interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
  hasMore: boolean;
}

interface AuditStats {
  totalEntries: number;
  entriesByAction: Record<string, number>;
  entriesByResult: Record<string, number>;
  entriesByDay: Array<{ date: string; count: number }>;
  successRate: number;
  averageDurationMs: number;
  screenshotCount: number;
  oldestEntry?: number;
  newestEntry?: number;
}

interface ExportOptions {
  format: 'json' | 'csv';
  dateFrom?: number;
  dateTo?: number;
  actions?: string[];
  results?: string[];
  includeScreenshots: boolean;
  screenshotFormat?: 'paths' | 'base64' | 'zip';
  outputPath?: string;
  entries?: AuditEntry[];
}

interface ExportResult {
  success: boolean;
  outputPath?: string;
  entryCount: number;
  screenshotCount?: number;
  error?: string;
}

interface CapturedScreenshot {
  id: string;
  path: string;
  timestamp: number;
  type: 'before' | 'after' | 'manual';
  auditEntryId?: string;
  width: number;
  height: number;
  sizeBytes: number;
}

interface ScreenshotCaptureOptions {
  type: 'before' | 'after' | 'manual';
  auditEntryId?: string;
  quality: number;
  maxWidth: number;
}

// ============================================================================
// Configuration
// ============================================================================

interface AuditStorageConfig {
  dbPath: string;
  screenshotsDir: string;
  logsDir: string;
  encryptionEnabled: boolean;
  encryptionKey?: string;
  maxRetentionDays: number;
  autoCleanupEnabled: boolean;
  cleanupIntervalHours: number;
}

const DEFAULT_CONFIG: AuditStorageConfig = {
  dbPath: join(app.getPath('userData'), 'audit.db'),
  screenshotsDir: join(app.getPath('userData'), 'audit-screenshots'),
  logsDir: join(app.getPath('userData'), 'audit-logs'),
  encryptionEnabled: false,
  maxRetentionDays: 90,
  autoCleanupEnabled: true,
  cleanupIntervalHours: 24,
};

// ============================================================================
// Audit Storage Class
// ============================================================================

export class AuditStorage {
  private db: Database.Database | null = null;
  private config: AuditStorageConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;

  constructor(config: Partial<AuditStorageConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  initialize(mainWindow?: BrowserWindow): void {
    this.mainWindow = mainWindow ?? null;
    
    // Ensure directories exist
    this.ensureDirectories();
    
    // Initialize database
    this.initDatabase();
    
    // Setup IPC handlers
    this.setupIpcHandlers();
    
    // Start auto-cleanup
    if (this.config.autoCleanupEnabled) {
      this.startAutoCleanup();
    }
  }

  private ensureDirectories(): void {
    [this.config.screenshotsDir, this.config.logsDir].forEach((dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  private initDatabase(): void {
    this.db = new Database(this.config.dbPath);
    
    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');
    
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_entries (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        content_hash TEXT,
        result TEXT NOT NULL,
        severity TEXT NOT NULL,
        screenshot_path TEXT,
        screenshot_path_before TEXT,
        screenshot_path_after TEXT,
        run_id TEXT,
        step_index INTEGER,
        platform TEXT,
        error_message TEXT,
        duration_ms INTEGER,
        user_id TEXT,
        session_id TEXT,
        metadata TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      
      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_entries(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_entries(action);
      CREATE INDEX IF NOT EXISTS idx_audit_result ON audit_entries(result);
      CREATE INDEX IF NOT EXISTS idx_audit_run_id ON audit_entries(run_id);
      CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_entries(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_entries(target);
      
      -- Full-text search virtual table
      CREATE VIRTUAL TABLE IF NOT EXISTS audit_fts USING fts5(
        id,
        target,
        error_message,
        content='audit_entries',
        content_rowid='rowid'
      );
      
      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS audit_ai AFTER INSERT ON audit_entries BEGIN
        INSERT INTO audit_fts(rowid, id, target, error_message)
        VALUES (new.rowid, new.id, new.target, new.error_message);
      END;
      
      CREATE TRIGGER IF NOT EXISTS audit_ad AFTER DELETE ON audit_entries BEGIN
        INSERT INTO audit_fts(audit_fts, rowid, id, target, error_message)
        VALUES ('delete', old.rowid, old.id, old.target, old.error_message);
      END;
      
      CREATE TRIGGER IF NOT EXISTS audit_au AFTER UPDATE ON audit_entries BEGIN
        INSERT INTO audit_fts(audit_fts, rowid, id, target, error_message)
        VALUES ('delete', old.rowid, old.id, old.target, old.error_message);
        INSERT INTO audit_fts(rowid, id, target, error_message)
        VALUES (new.rowid, new.id, new.target, new.error_message);
      END;
    `);

    // Prepare statements
    this.prepareStatements();
  }

  private statements: {
    insert?: Database.Statement;
    getById?: Database.Statement;
    deleteOld?: Database.Statement;
  } = {};

  private prepareStatements(): void {
    if (!this.db) return;

    this.statements.insert = this.db.prepare(`
      INSERT INTO audit_entries (
        id, timestamp, action, target, content_hash, result, severity,
        screenshot_path, screenshot_path_before, screenshot_path_after,
        run_id, step_index, platform, error_message, duration_ms,
        user_id, session_id, metadata
      ) VALUES (
        @id, @timestamp, @action, @target, @contentHash, @result, @severity,
        @screenshotPath, @screenshotPathBefore, @screenshotPathAfter,
        @runId, @stepIndex, @platform, @errorMessage, @durationMs,
        @userId, @sessionId, @metadata
      )
    `);

    this.statements.getById = this.db.prepare(`
      SELECT * FROM audit_entries WHERE id = ?
    `);

    this.statements.deleteOld = this.db.prepare(`
      DELETE FROM audit_entries WHERE timestamp < ?
    `);
  }

  // --------------------------------------------------------------------------
  // CRUD Operations
  // --------------------------------------------------------------------------

  logEntry(entry: AuditEntry): AuditEntry {
    if (!this.db || !this.statements.insert) {
      throw new Error('Database not initialized');
    }

    const dbEntry = {
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.action,
      target: entry.target,
      contentHash: entry.contentHash ?? null,
      result: entry.result,
      severity: entry.severity,
      screenshotPath: entry.screenshotPath ?? null,
      screenshotPathBefore: entry.screenshotPathBefore ?? null,
      screenshotPathAfter: entry.screenshotPathAfter ?? null,
      runId: entry.runId ?? null,
      stepIndex: entry.stepIndex ?? null,
      platform: entry.platform ?? null,
      errorMessage: entry.errorMessage ?? null,
      durationMs: entry.durationMs ?? null,
      userId: entry.userId ?? null,
      sessionId: entry.sessionId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    };

    this.statements.insert.run(dbEntry);

    // Notify renderer of new entry
    if (this.mainWindow) {
      this.mainWindow.webContents.send('audit:new-entry', entry);
    }

    // Also write to daily log file (append-only)
    this.appendToLogFile(entry);

    return entry;
  }

  logBatch(entries: AuditEntry[]): void {
    if (!this.db) return;

    const insertMany = this.db.transaction((entries: AuditEntry[]) => {
      for (const entry of entries) {
        this.logEntry(entry);
      }
    });

    insertMany(entries);
  }

  getEntry(id: string): AuditEntry | null {
    if (!this.db || !this.statements.getById) return null;

    const row = this.statements.getById.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return this.rowToEntry(row);
  }

  query(query: AuditQuery): AuditQueryResult {
    if (!this.db) {
      return { entries: [], total: 0, hasMore: false };
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.dateFrom) {
      conditions.push('timestamp >= ?');
      params.push(query.dateFrom);
    }

    if (query.dateTo) {
      conditions.push('timestamp <= ?');
      params.push(query.dateTo);
    }

    if (query.actions && query.actions.length > 0) {
      conditions.push(`action IN (${query.actions.map(() => '?').join(', ')})`);
      params.push(...query.actions);
    }

    if (query.results && query.results.length > 0) {
      conditions.push(`result IN (${query.results.map(() => '?').join(', ')})`);
      params.push(...query.results);
    }

    if (query.severities && query.severities.length > 0) {
      conditions.push(`severity IN (${query.severities.map(() => '?').join(', ')})`);
      params.push(...query.severities);
    }

    if (query.runId) {
      conditions.push('run_id = ?');
      params.push(query.runId);
    }

    if (query.searchTerm) {
      conditions.push('id IN (SELECT id FROM audit_fts WHERE audit_fts MATCH ?)');
      params.push(query.searchTerm + '*');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = query.orderBy ?? 'timestamp';
    const orderDirection = query.orderDirection ?? 'DESC';
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    // Get total count
    const countSql = `SELECT COUNT(*) as count FROM audit_entries ${whereClause}`;
    const countResult = this.db.prepare(countSql).get(...params) as { count: number };
    const total = countResult.count;

    // Get entries
    const selectSql = `
      SELECT * FROM audit_entries
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT ? OFFSET ?
    `;
    const rows = this.db.prepare(selectSql).all(...params, limit, offset) as Record<string, unknown>[];
    const entries = rows.map((row) => this.rowToEntry(row));

    return {
      entries,
      total,
      hasMore: offset + entries.length < total,
    };
  }

  getStats(): AuditStats {
    if (!this.db) {
      return {
        totalEntries: 0,
        entriesByAction: {},
        entriesByResult: {},
        entriesByDay: [],
        successRate: 0,
        averageDurationMs: 0,
        screenshotCount: 0,
      };
    }

    const totalResult = this.db.prepare('SELECT COUNT(*) as count FROM audit_entries').get() as { count: number };
    const total = totalResult.count;

    const actionStats = this.db.prepare(`
      SELECT action, COUNT(*) as count FROM audit_entries GROUP BY action
    `).all() as Array<{ action: string; count: number }>;

    const resultStats = this.db.prepare(`
      SELECT result, COUNT(*) as count FROM audit_entries GROUP BY result
    `).all() as Array<{ result: string; count: number }>;

    const dayStats = this.db.prepare(`
      SELECT DATE(timestamp / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM audit_entries
      WHERE timestamp > ?
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `).all(Date.now() - 30 * 24 * 60 * 60 * 1000) as Array<{ date: string; count: number }>;

    const successCount = resultStats.find((r) => r.result === 'success')?.count ?? 0;
    const successRate = total > 0 ? (successCount / total) * 100 : 0;

    const avgDuration = this.db.prepare(`
      SELECT AVG(duration_ms) as avg FROM audit_entries WHERE duration_ms IS NOT NULL
    `).get() as { avg: number | null };

    const screenshotCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM audit_entries
      WHERE screenshot_path IS NOT NULL
         OR screenshot_path_before IS NOT NULL
         OR screenshot_path_after IS NOT NULL
    `).get() as { count: number };

    const timeRange = this.db.prepare(`
      SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM audit_entries
    `).get() as { oldest: number | null; newest: number | null };

    return {
      totalEntries: total,
      entriesByAction: Object.fromEntries(actionStats.map((r) => [r.action, r.count])),
      entriesByResult: Object.fromEntries(resultStats.map((r) => [r.result, r.count])),
      entriesByDay: dayStats,
      successRate,
      averageDurationMs: avgDuration.avg ?? 0,
      screenshotCount: screenshotCount.count,
      oldestEntry: timeRange.oldest ?? undefined,
      newestEntry: timeRange.newest ?? undefined,
    };
  }

  deleteOldEntries(olderThanDays: number): number {
    if (!this.db || !this.statements.deleteOld) return 0;

    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    
    // First, get screenshot paths to delete
    const toDelete = this.db.prepare(`
      SELECT screenshot_path, screenshot_path_before, screenshot_path_after
      FROM audit_entries WHERE timestamp < ?
    `).all(cutoff) as Array<{
      screenshot_path: string | null;
      screenshot_path_before: string | null;
      screenshot_path_after: string | null;
    }>;

    // Delete screenshot files
    for (const row of toDelete) {
      [row.screenshot_path, row.screenshot_path_before, row.screenshot_path_after]
        .filter((p): p is string => p !== null)
        .forEach((path) => {
          try {
            if (existsSync(path)) {
              unlinkSync(path);
            }
          } catch (error) {
            console.error('Failed to delete screenshot:', path, error);
          }
        });
    }

    // Delete entries
    const result = this.statements.deleteOld.run(cutoff);
    return result.changes;
  }

  // --------------------------------------------------------------------------
  // Screenshot Capture
  // --------------------------------------------------------------------------

  async captureScreenshot(options: ScreenshotCaptureOptions): Promise<CapturedScreenshot | null> {
    try {
      // Get the sources (screens and windows)
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: options.maxWidth, height: Math.floor(options.maxWidth * 0.75) },
      });

      // Find the main window
      const mainWindowSource = sources.find((s) => 
        s.name.includes('Capy') || s.name.includes('capydesktopapp')
      ) ?? sources[0];

      if (!mainWindowSource) {
        return null;
      }

      const thumbnail = mainWindowSource.thumbnail;
      const pngBuffer = thumbnail.toPNG();

      // Generate path
      const timestamp = Date.now();
      const id = `ss_${timestamp.toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const dateDir = new Date(timestamp).toISOString().split('T')[0];
      const dirPath = join(this.config.screenshotsDir, dateDir);
      
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }

      const filename = `${options.type}_${new Date(timestamp).toTimeString().split(' ')[0].replace(/:/g, '-')}_${id.substring(3, 9)}.png`;
      const filepath = join(dirPath, filename);

      // Encrypt if enabled
      let dataToWrite = pngBuffer;
      if (this.config.encryptionEnabled && this.config.encryptionKey) {
        dataToWrite = this.encrypt(pngBuffer);
      }

      writeFileSync(filepath, dataToWrite);

      const size = thumbnail.getSize();

      return {
        id,
        path: filepath,
        timestamp,
        type: options.type,
        auditEntryId: options.auditEntryId,
        width: size.width,
        height: size.height,
        sizeBytes: dataToWrite.length,
      };
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      return null;
    }
  }

  getScreenshot(path: string): string | null {
    try {
      if (!existsSync(path)) return null;

      let data = readFileSync(path);
      
      if (this.config.encryptionEnabled && this.config.encryptionKey) {
        data = this.decrypt(data);
      }

      return `data:image/png;base64,${data.toString('base64')}`;
    } catch (error) {
      console.error('Failed to read screenshot:', error);
      return null;
    }
  }

  cleanupOldScreenshots(retentionDays: number): number {
    let deletedCount = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    try {
      const dateDirs = readdirSync(this.config.screenshotsDir);
      
      for (const dateDir of dateDirs) {
        const dirPath = join(this.config.screenshotsDir, dateDir);
        const dirStat = statSync(dirPath);
        
        if (dirStat.isDirectory()) {
          // Parse date from directory name (YYYY-MM-DD)
          const dirDate = new Date(dateDir);
          
          if (dirDate < cutoffDate) {
            // Delete all files in the directory
            const files = readdirSync(dirPath);
            for (const file of files) {
              unlinkSync(join(dirPath, file));
              deletedCount++;
            }
            // Remove the directory
            try {
              readdirSync(dirPath).length === 0 && unlinkSync(dirPath);
            } catch {
              // Directory not empty, skip
            }
          }
        }
      }
    } catch (error) {
      console.error('Screenshot cleanup failed:', error);
    }

    return deletedCount;
  }

  // --------------------------------------------------------------------------
  // Export
  // --------------------------------------------------------------------------

  async exportToFile(options: ExportOptions): Promise<ExportResult> {
    try {
      const entries = options.entries ?? this.query({
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        actions: options.actions,
        results: options.results,
        limit: 100000,
      }).entries;

      if (entries.length === 0) {
        return {
          success: true,
          entryCount: 0,
          error: 'No entries to export',
        };
      }

      const outputPath = options.outputPath ?? join(
        app.getPath('downloads'),
        `audit-export-${new Date().toISOString().split('T')[0]}.${options.format}`
      );

      let content: string;
      if (options.format === 'json') {
        content = JSON.stringify({
          exportedAt: new Date().toISOString(),
          totalEntries: entries.length,
          entries: options.includeScreenshots ? entries : entries.map(({ screenshotPath, screenshotPathBefore, screenshotPathAfter, ...rest }) => rest),
        }, null, 2);
      } else {
        content = this.formatCsv(entries);
      }

      writeFileSync(outputPath, content, 'utf8');

      return {
        success: true,
        outputPath,
        entryCount: entries.length,
      };
    } catch (error) {
      return {
        success: false,
        entryCount: 0,
        error: error instanceof Error ? error.message : 'Export failed',
      };
    }
  }

  private formatCsv(entries: AuditEntry[]): string {
    const headers = [
      'ID', 'Timestamp', 'Action', 'Target', 'Result', 'Severity',
      'Platform', 'Duration (ms)', 'Run ID', 'Step Index', 'Error Message',
      'Content Hash', 'Screenshot Path', 'User ID', 'Session ID',
    ];

    const rows = entries.map((entry) => [
      entry.id,
      new Date(entry.timestamp).toISOString(),
      entry.action,
      this.escapeCsv(entry.target),
      entry.result,
      entry.severity,
      entry.platform ?? '',
      entry.durationMs?.toString() ?? '',
      entry.runId ?? '',
      entry.stepIndex?.toString() ?? '',
      this.escapeCsv(entry.errorMessage ?? ''),
      entry.contentHash ?? '',
      entry.screenshotPath ?? '',
      entry.userId ?? '',
      entry.sessionId ?? '',
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  private escapeCsv(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  // --------------------------------------------------------------------------
  // Log File Management
  // --------------------------------------------------------------------------

  private appendToLogFile(entry: AuditEntry): void {
    const dateStr = new Date(entry.timestamp).toISOString().split('T')[0];
    const logPath = join(this.config.logsDir, `audit-${dateStr}.jsonl`);
    
    let line = JSON.stringify(entry);
    
    if (this.config.encryptionEnabled && this.config.encryptionKey) {
      line = this.encrypt(Buffer.from(line)).toString('base64');
    }

    try {
      writeFileSync(logPath, line + '\n', { flag: 'a' });
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  // --------------------------------------------------------------------------
  // Encryption
  // --------------------------------------------------------------------------

  private encrypt(data: Buffer): Buffer {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not set');
    }

    const key = Buffer.from(this.config.encryptionKey, 'base64');
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]);
  }

  private decrypt(data: Buffer): Buffer {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not set');
    }

    const key = Buffer.from(this.config.encryptionKey, 'base64');
    const iv = data.slice(0, 16);
    const authTag = data.slice(16, 32);
    const encrypted = data.slice(32);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  // --------------------------------------------------------------------------
  // Auto Cleanup
  // --------------------------------------------------------------------------

  private startAutoCleanup(): void {
    const intervalMs = this.config.cleanupIntervalHours * 60 * 60 * 1000;
    
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, intervalMs);

    // Run initial cleanup
    setTimeout(() => this.runCleanup(), 60000); // After 1 minute
  }

  private runCleanup(): void {
    console.log('Running audit cleanup...');
    const deletedEntries = this.deleteOldEntries(this.config.maxRetentionDays);
    const deletedScreenshots = this.cleanupOldScreenshots(this.config.maxRetentionDays);
    console.log(`Cleanup complete: ${deletedEntries} entries, ${deletedScreenshots} screenshots deleted`);
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private rowToEntry(row: Record<string, unknown>): AuditEntry {
    return {
      id: row.id as string,
      timestamp: row.timestamp as number,
      action: row.action as string,
      target: row.target as string,
      contentHash: row.content_hash as string | undefined,
      result: row.result as string,
      severity: row.severity as string,
      screenshotPath: row.screenshot_path as string | undefined,
      screenshotPathBefore: row.screenshot_path_before as string | undefined,
      screenshotPathAfter: row.screenshot_path_after as string | undefined,
      runId: row.run_id as string | undefined,
      stepIndex: row.step_index as number | undefined,
      platform: row.platform as string | undefined,
      errorMessage: row.error_message as string | undefined,
      durationMs: row.duration_ms as number | undefined,
      userId: row.user_id as string | undefined,
      sessionId: row.session_id as string | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }

  // --------------------------------------------------------------------------
  // IPC Handlers
  // --------------------------------------------------------------------------

  private setupIpcHandlers(): void {
    ipcMain.handle('audit:log-entry', (_event, entry: AuditEntry) => {
      return this.logEntry(entry);
    });

    ipcMain.handle('audit:log-batch', (_event, entries: AuditEntry[]) => {
      this.logBatch(entries);
      return { success: true };
    });

    ipcMain.handle('audit:get-entry', (_event, id: string) => {
      return this.getEntry(id);
    });

    ipcMain.handle('audit:query', (_event, query: AuditQuery) => {
      return this.query(query);
    });

    ipcMain.handle('audit:stats', () => {
      return this.getStats();
    });

    ipcMain.handle('audit:delete-old', (_event, olderThanDays: number) => {
      return this.deleteOldEntries(olderThanDays);
    });

    ipcMain.handle('audit:export', (_event, options: ExportOptions) => {
      return this.exportToFile(options);
    });

    ipcMain.handle('audit:capture-screenshot', (_event, options: ScreenshotCaptureOptions) => {
      return this.captureScreenshot(options);
    });

    ipcMain.handle('audit:get-screenshot', (_event, path: string) => {
      return this.getScreenshot(path);
    });

    ipcMain.handle('audit:cleanup-screenshots', (_event, retentionDays: number) => {
      return this.cleanupOldScreenshots(retentionDays);
    });

    ipcMain.handle('audit:get-screenshot-paths', (_event, auditEntryId: string) => {
      const entry = this.getEntry(auditEntryId);
      if (!entry) return {};
      return {
        before: entry.screenshotPathBefore,
        after: entry.screenshotPathAfter,
      };
    });
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.db) {
      this.db.close();
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let auditStorageInstance: AuditStorage | null = null;

export function initializeAuditStorage(
  config?: Partial<AuditStorageConfig>,
  mainWindow?: BrowserWindow
): AuditStorage {
  if (!auditStorageInstance) {
    auditStorageInstance = new AuditStorage(config);
    auditStorageInstance.initialize(mainWindow);
  }
  return auditStorageInstance;
}

export function getAuditStorage(): AuditStorage | null {
  return auditStorageInstance;
}

export function closeAuditStorage(): void {
  if (auditStorageInstance) {
    auditStorageInstance.close();
    auditStorageInstance = null;
  }
}
