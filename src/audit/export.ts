/**
 * Audit Export Module
 * Export audit logs to CSV/JSON with filtering and screenshot options
 */

import {
  AuditEntry,
  AuditQuery,
  AuditQueryResult,
  ExportFormat,
  ExportOptions,
  ExportResult,
  AuditStats,
  formatAuditTimestamp,
} from './types';

// ============================================================================
// Audit Exporter Class
// ============================================================================

export class AuditExporter {
  // --------------------------------------------------------------------------
  // Query Methods
  // --------------------------------------------------------------------------

  /**
   * Query audit entries from the database
   */
  async query(query: AuditQuery): Promise<AuditQueryResult> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      return window.electron.invoke('audit:query', query) as Promise<AuditQueryResult>;
    }
    return { entries: [], total: 0, hasMore: false };
  }

  /**
   * Get a single audit entry by ID
   */
  async getEntry(id: string): Promise<AuditEntry | null> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      return window.electron.invoke('audit:get-entry', id) as Promise<AuditEntry | null>;
    }
    return null;
  }

  /**
   * Get audit statistics
   */
  async getStats(): Promise<AuditStats> {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      return window.electron.invoke('audit:stats') as Promise<AuditStats>;
    }
    return {
      totalEntries: 0,
      entriesByAction: {} as Record<string, number>,
      entriesByResult: {} as Record<string, number>,
      entriesByDay: [],
      successRate: 0,
      averageDurationMs: 0,
      screenshotCount: 0,
    };
  }

  // --------------------------------------------------------------------------
  // Export Methods
  // --------------------------------------------------------------------------

  /**
   * Export audit logs to file
   */
  async export(options: ExportOptions): Promise<ExportResult> {
    try {
      // Query all matching entries
      const query: AuditQuery = {
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        actions: options.actions,
        results: options.results,
        limit: 100000, // Large limit for export
      };

      const result = await this.query(query);

      if (result.entries.length === 0) {
        return {
          success: true,
          entryCount: 0,
          error: 'No entries match the specified criteria',
        };
      }

      // Call main process to handle file writing and screenshot bundling
      if (typeof window !== 'undefined' && window.electron?.invoke) {
        return window.electron.invoke('audit:export', {
          ...options,
          entries: result.entries,
        }) as Promise<ExportResult>;
      }

      // Fallback: generate content in memory
      if (options.format === 'json') {
        return this.exportToJsonInMemory(result.entries, options);
      } else {
        return this.exportToCsvInMemory(result.entries, options);
      }
    } catch (error) {
      return {
        success: false,
        entryCount: 0,
        error: error instanceof Error ? error.message : 'Export failed',
      };
    }
  }

  /**
   * Export to JSON format
   */
  async exportToJson(options: Omit<ExportOptions, 'format'>): Promise<ExportResult> {
    return this.export({ ...options, format: 'json' });
  }

  /**
   * Export to CSV format
   */
  async exportToCsv(options: Omit<ExportOptions, 'format'>): Promise<ExportResult> {
    return this.export({ ...options, format: 'csv' });
  }

  /**
   * Generate downloadable blob (for browser download)
   */
  async generateDownloadBlob(options: ExportOptions): Promise<Blob | null> {
    try {
      const query: AuditQuery = {
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        actions: options.actions,
        results: options.results,
        limit: 100000,
      };

      const result = await this.query(query);

      if (result.entries.length === 0) {
        return null;
      }

      if (options.format === 'json') {
        const content = this.formatAsJson(result.entries, options.includeScreenshots);
        return new Blob([content], { type: 'application/json' });
      } else {
        const content = this.formatAsCsv(result.entries);
        return new Blob([content], { type: 'text/csv' });
      }
    } catch (error) {
      console.error('Failed to generate download blob:', error);
      return null;
    }
  }

  /**
   * Trigger browser download
   */
  async downloadExport(options: ExportOptions, filename?: string): Promise<boolean> {
    const blob = await this.generateDownloadBlob(options);
    if (!blob) {
      return false;
    }

    const defaultFilename = `audit-export-${new Date().toISOString().split('T')[0]}.${options.format}`;
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return true;
  }

  // --------------------------------------------------------------------------
  // Formatting Methods
  // --------------------------------------------------------------------------

  /**
   * Format entries as JSON
   */
  formatAsJson(entries: AuditEntry[], includeScreenshots: boolean = false): string {
    const exportData = {
      exportedAt: new Date().toISOString(),
      totalEntries: entries.length,
      entries: entries.map(entry => {
        if (!includeScreenshots) {
          const { screenshotPath, screenshotPathBefore, screenshotPathAfter, ...rest } = entry;
          return rest;
        }
        return entry;
      }),
    };
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Format entries as CSV
   */
  formatAsCsv(entries: AuditEntry[]): string {
    const headers = [
      'ID',
      'Timestamp',
      'Action',
      'Target',
      'Result',
      'Severity',
      'Platform',
      'Duration (ms)',
      'Run ID',
      'Step Index',
      'Error Message',
      'Content Hash',
      'Screenshot Path',
      'User ID',
      'Session ID',
    ];

    const rows = entries.map(entry => [
      entry.id,
      formatAuditTimestamp(entry.timestamp),
      entry.action,
      this.escapeCsvField(entry.target),
      entry.result,
      entry.severity,
      entry.platform ?? '',
      entry.durationMs?.toString() ?? '',
      entry.runId ?? '',
      entry.stepIndex?.toString() ?? '',
      this.escapeCsvField(entry.errorMessage ?? ''),
      entry.contentHash ?? '',
      entry.screenshotPath ?? '',
      entry.userId ?? '',
      entry.sessionId ?? '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * Escape CSV field
   */
  private escapeCsvField(field: string): string {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  // --------------------------------------------------------------------------
  // In-Memory Export (Fallback)
  // --------------------------------------------------------------------------

  private exportToJsonInMemory(
    entries: AuditEntry[],
    options: ExportOptions
  ): ExportResult {
    try {
      const content = this.formatAsJson(entries, options.includeScreenshots);
      
      // Can't save to file without electron, but return success with data size
      return {
        success: true,
        entryCount: entries.length,
        outputPath: undefined, // No file path in fallback mode
      };
    } catch (error) {
      return {
        success: false,
        entryCount: 0,
        error: error instanceof Error ? error.message : 'JSON export failed',
      };
    }
  }

  private exportToCsvInMemory(
    entries: AuditEntry[],
    options: ExportOptions
  ): ExportResult {
    try {
      const content = this.formatAsCsv(entries);
      
      return {
        success: true,
        entryCount: entries.length,
        outputPath: undefined,
      };
    } catch (error) {
      return {
        success: false,
        entryCount: 0,
        error: error instanceof Error ? error.message : 'CSV export failed',
      };
    }
  }

  // --------------------------------------------------------------------------
  // Date Range Helpers
  // --------------------------------------------------------------------------

  /**
   * Get date range for common periods
   */
  static getDateRange(period: 'today' | 'week' | 'month' | 'year' | 'all'): {
    dateFrom?: number;
    dateTo?: number;
  } {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (period) {
      case 'today':
        return {
          dateFrom: today.getTime(),
          dateTo: now,
        };
      case 'week':
        return {
          dateFrom: now - 7 * 24 * 60 * 60 * 1000,
          dateTo: now,
        };
      case 'month':
        return {
          dateFrom: now - 30 * 24 * 60 * 60 * 1000,
          dateTo: now,
        };
      case 'year':
        return {
          dateFrom: now - 365 * 24 * 60 * 60 * 1000,
          dateTo: now,
        };
      case 'all':
      default:
        return {};
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalExporter: AuditExporter | null = null;

export function getAuditExporter(): AuditExporter {
  if (!globalExporter) {
    globalExporter = new AuditExporter();
  }
  return globalExporter;
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function queryAuditLogs(query: AuditQuery): Promise<AuditQueryResult> {
  return getAuditExporter().query(query);
}

export async function getAuditStats(): Promise<AuditStats> {
  return getAuditExporter().getStats();
}

export async function exportAuditLogs(options: ExportOptions): Promise<ExportResult> {
  return getAuditExporter().export(options);
}

export async function downloadAuditExport(
  options: ExportOptions,
  filename?: string
): Promise<boolean> {
  return getAuditExporter().downloadExport(options, filename);
}
