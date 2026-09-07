type LogLevel = "INFO" | "WARN" | "ERROR";

function formatTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function log(level: LogLevel, message: string, meta?: unknown): void {
  const prefix = `[${formatTimestamp(new Date())}] ${level}`;
  if (meta !== undefined) {
    console.log(`${prefix} ${message}`, meta);
    return;
  }
  console.log(`${prefix} ${message}`);
}

export const logger = {
  info: (message: string, meta?: unknown) => log("INFO", message, meta),
  warn: (message: string, meta?: unknown) => log("WARN", message, meta),
  error: (message: string, meta?: unknown) => log("ERROR", message, meta),
};
