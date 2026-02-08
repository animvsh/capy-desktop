/**
 * Centralized logging for Electron main process
 * Uses electron-log for better log management, rotation, and file persistence
 */

import log from 'electron-log';
import { app } from 'electron';

// Configure electron-log
log.transports.file.level = 'info';
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

// Set log file location
log.transports.file.resolvePathFn = () => {
  const logsPath = app.getPath('logs');
  return `${logsPath}/capy-desktop.log`;
};

// Format logs with timestamp and context
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}';

// Sanitize sensitive data from logs
function sanitize(data: unknown): unknown {
  if (typeof data === 'string') {
    // Remove potential tokens, API keys, passwords
    return data
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/api[_-]?key["\s:=]+[A-Za-z0-9\-._~+/]+=*/gi, 'api_key=[REDACTED]')
      .replace(/password["\s:=]+[^\s&,"}]*/gi, 'password=[REDACTED]')
      .replace(/token["\s:=]+[A-Za-z0-9\-._~+/]+=*/gi, 'token=[REDACTED]');
  }
  
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('password') || lowerKey.includes('token') || lowerKey.includes('secret') || lowerKey.includes('key')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitize(value);
      }
    }
    
    return sanitized;
  }
  
  return data;
}

// Export logger with context-aware methods
export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    log.debug(message, ...args.map(sanitize));
  },
  
  info: (message: string, ...args: unknown[]) => {
    log.info(message, ...args.map(sanitize));
  },
  
  warn: (message: string, ...args: unknown[]) => {
    log.warn(message, ...args.map(sanitize));
  },
  
  error: (message: string, error?: Error | unknown, ...args: unknown[]) => {
    if (error instanceof Error) {
      log.error(message, {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...args.map(sanitize)
      });
    } else {
      log.error(message, sanitize(error), ...args.map(sanitize));
    }
  },
  
  // Context-specific loggers
  playwright: {
    debug: (message: string, ...args: unknown[]) => log.debug(`[Playwright] ${message}`, ...args.map(sanitize)),
    info: (message: string, ...args: unknown[]) => log.info(`[Playwright] ${message}`, ...args.map(sanitize)),
    warn: (message: string, ...args: unknown[]) => log.warn(`[Playwright] ${message}`, ...args.map(sanitize)),
    error: (message: string, error?: Error | unknown) => {
      if (error instanceof Error) {
        log.error(`[Playwright] ${message}`, { name: error.name, message: error.message, stack: error.stack });
      } else {
        log.error(`[Playwright] ${message}`, sanitize(error));
      }
    },
  },
  
  ipc: {
    debug: (channel: string, ...args: unknown[]) => log.debug(`[IPC] ${channel}`, ...args.map(sanitize)),
    info: (channel: string, ...args: unknown[]) => log.info(`[IPC] ${channel}`, ...args.map(sanitize)),
    warn: (channel: string, ...args: unknown[]) => log.warn(`[IPC] ${channel}`, ...args.map(sanitize)),
    error: (channel: string, error?: Error | unknown) => {
      if (error instanceof Error) {
        log.error(`[IPC] ${channel}`, { name: error.name, message: error.message });
      } else {
        log.error(`[IPC] ${channel}`, sanitize(error));
      }
    },
  },
  
  main: {
    debug: (message: string, ...args: unknown[]) => log.debug(`[Main] ${message}`, ...args.map(sanitize)),
    info: (message: string, ...args: unknown[]) => log.info(`[Main] ${message}`, ...args.map(sanitize)),
    warn: (message: string, ...args: unknown[]) => log.warn(`[Main] ${message}`, ...args.map(sanitize)),
    error: (message: string, error?: Error | unknown) => {
      if (error instanceof Error) {
        log.error(`[Main] ${message}`, { name: error.name, message: error.message, stack: error.stack });
      } else {
        log.error(`[Main] ${message}`, sanitize(error));
      }
    },
  },
};

export default logger;
