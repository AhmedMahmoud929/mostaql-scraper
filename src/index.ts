import { config } from "./config/env.js";
import { ProjectsRepository } from "./database/projects.repository.js";
import { DiscordBot } from "./discord/client.js";
import { Monitor } from "./monitor/monitor.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  logger.info("Starting Mostaql Job Monitor");

  const repository = new ProjectsRepository();
  const discord = new DiscordBot();
  const monitor = new Monitor(repository, discord);

  discord.setStatusProvider(() => monitor.getStatus());
  discord.setTestFetchHandler(() => monitor.runTestFetch());

  await discord.start();
  await monitor.start();

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    monitor.stop();
    await discord.stop();
    repository.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  logger.info(
    `Monitor running — checking every ${config.monitor.checkIntervalMinutes} minute(s)`,
  );
}

main().catch((error) => {
  logger.error("Fatal error", error);
  process.exit(1);
});
