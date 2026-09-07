import { logger } from "./logger.js";

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; label: string; delayMs?: number },
): Promise<T> {
  const { maxRetries, label, delayMs = 1000 } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        logger.warn(`${label} failed (attempt ${attempt}/${maxRetries}), retrying...`, error);
        await sleep(delayMs * attempt);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
