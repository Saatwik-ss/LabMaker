/**
 * Logger provides consistent logging across the application
 */
export class Logger {
  private name: string;
  private isDevelopment: boolean;

  constructor(name: string) {
    this.name = name;
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.log('INFO', message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.log('WARN', message, data);
  }

  /**
   * Log error message
   */
  error(message: string, data?: any): void {
    this.log('ERROR', message, data);
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any): void {
    if (this.isDevelopment) {
      this.log('DEBUG', message, data);
    }
  }

  /**
   * Log trace (verbose debug)
   */
  trace(message: string, data?: any): void {
    if (this.isDevelopment && process.env.DEBUG === '*') {
      this.log('TRACE', message, data);
    }
  }

  /**
   * Internal logging method
   */
  private log(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${this.name}]`;

    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  /**
   * Create a child logger with a different name
   */
  child(name: string): Logger {
    return new Logger(`${this.name}:${name}`);
  }
}

/**
 * Global logger instance
 */
export const globalLogger = new Logger('Codex');
