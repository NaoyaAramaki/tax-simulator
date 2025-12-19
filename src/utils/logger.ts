/**
 * ログユーティリティ
 * ブラウザ環境では直接ファイルに書き込めないため、メモリに保持し、ダウンロード機能を提供
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  stack?: string;
}

class Logger {
  private errorLogs: LogEntry[] = [];
  private executionLogs: LogEntry[] = [];
  private maxLogs = 1000; // メモリに保持する最大ログ数

  /**
   * エラーログを記録
   */
  error(message: string, data?: any, error?: Error): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      data,
      stack: error?.stack,
    };

    this.errorLogs.push(entry);
    if (this.errorLogs.length > this.maxLogs) {
      this.errorLogs.shift();
    }

    // コンソールにも出力
    console.error(`[ERROR] ${message}`, data, error);
  }

  /**
   * 実行ログを記録
   */
  log(message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      data,
    };

    this.executionLogs.push(entry);
    if (this.executionLogs.length > this.maxLogs) {
      this.executionLogs.shift();
    }

    // コンソールにも出力
    console.log(`[LOG] ${message}`, data);
  }

  /**
   * 警告ログを記録
   */
  warn(message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      data,
    };

    this.executionLogs.push(entry);
    if (this.executionLogs.length > this.maxLogs) {
      this.executionLogs.shift();
    }

    // コンソールにも出力
    console.warn(`[WARN] ${message}`, data);
  }

  /**
   * ログファイル名を生成
   */
  private generateLogFileName(prefix: string, identifier?: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const id = identifier || String(Math.floor(Math.random() * 100)).padStart(2, '0');
    
    return `${prefix}_${year}${month}${day}_${hours}${minutes}${seconds}_${id}.log`;
  }

  /**
   * ログエントリを文字列に変換
   */
  private formatLogEntry(entry: LogEntry): string {
    const time = new Date(entry.timestamp).toLocaleString('ja-JP');
    let line = `[${time}] [${entry.level.toUpperCase()}] ${entry.message}`;
    
    if (entry.data) {
      line += `\n  Data: ${JSON.stringify(entry.data, null, 2)}`;
    }
    
    if (entry.stack) {
      line += `\n  Stack: ${entry.stack}`;
    }
    
    return line;
  }

  /**
   * エラーログをダウンロード
   */
  downloadErrorLog(identifier?: string): void {
    if (this.errorLogs.length === 0) {
      alert('エラーログがありません。');
      return;
    }

    const fileName = this.generateLogFileName('errorLog', identifier);
    const content = this.errorLogs.map(e => this.formatLogEntry(e)).join('\n\n');
    
    this.downloadFile(fileName, content);
  }

  /**
   * 実行ログをダウンロード
   */
  downloadExecutionLog(identifier?: string): void {
    if (this.executionLogs.length === 0) {
      alert('実行ログがありません。');
      return;
    }

    const fileName = this.generateLogFileName('log', identifier);
    const content = this.executionLogs.map(e => this.formatLogEntry(e)).join('\n\n');
    
    this.downloadFile(fileName, content);
  }

  /**
   * すべてのログをダウンロード
   */
  downloadAllLogs(identifier?: string): void {
    const errorFileName = this.generateLogFileName('errorLog', identifier);
    const executionFileName = this.generateLogFileName('log', identifier);
    
    if (this.errorLogs.length > 0) {
      const errorContent = this.errorLogs.map(e => this.formatLogEntry(e)).join('\n\n');
      this.downloadFile(errorFileName, errorContent);
    }
    
    if (this.executionLogs.length > 0) {
      const executionContent = this.executionLogs.map(e => this.formatLogEntry(e)).join('\n\n');
      this.downloadFile(executionFileName, executionContent);
    }
  }

  /**
   * ファイルをダウンロード
   */
  private downloadFile(fileName: string, content: string): void {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * ログをクリア
   */
  clearErrorLogs(): void {
    this.errorLogs = [];
  }

  clearExecutionLogs(): void {
    this.executionLogs = [];
  }

  clearAllLogs(): void {
    this.errorLogs = [];
    this.executionLogs = [];
  }

  /**
   * ログ数を取得
   */
  getErrorLogCount(): number {
    return this.errorLogs.length;
  }

  getExecutionLogCount(): number {
    return this.executionLogs.length;
  }
}

// シングルトンインスタンス
export const logger = new Logger();

