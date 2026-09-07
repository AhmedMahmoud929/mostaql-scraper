import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable: ${value}`);
  }
  return parsed;
}

export const config = {
  discord: {
    token: requireEnv("DISCORD_BOT_TOKEN"),
    channelId: requireEnv("DISCORD_CHANNEL_ID"),
  },
  monitor: {
    checkIntervalMinutes: parseNumber(process.env.CHECK_INTERVAL_MINUTES, 5),
    initialSync: parseBoolean(process.env.INITIAL_SYNC, true),
    maxRetries: parseNumber(process.env.MAX_RETRIES, 3),
    requestTimeoutMs: parseNumber(process.env.REQUEST_TIMEOUT_MS, 15000),
  },
  filter: {
    enabled: parseBoolean(process.env.FILTER_ENABLED, false),
    keywords: (process.env.KEYWORDS ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  },
  database: {
    path: process.env.DATABASE_PATH ?? "./data/mostaql.db",
  },
  mostaql: {
    listingUrl:
      process.env.MOSTAQL_LISTING_URL ??
      "https://mostaql.com/projects?category=development&sort=latest",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
} as const;

export type Config = typeof config;
