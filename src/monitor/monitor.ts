import { config } from "../config/env.js";
import { ProjectsRepository } from "../database/projects.repository.js";
import type { DiscordBot } from "../discord/client.js";
import { buildProjectEmbed } from "../discord/embeds.js";
import { matchesKeywords } from "../filters/keyword-filter.js";
import { MostaqlClient } from "../mostaql/client.js";
import type { MonitorStatus, MostaqlProject } from "../mostaql/types.js";
import { logger } from "../utils/logger.js";

export class Monitor {
  private client = new MostaqlClient();
  private repository: ProjectsRepository;
  private discord: DiscordBot;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private initialSyncComplete = false;
  private errorCount = 0;

  private status: MonitorStatus = {
    online: false,
    lastCheckAt: null,
    nextCheckAt: null,
    lastProjectsFound: 0,
    lastNewProjects: 0,
    lastNotificationsSent: 0,
    totalProjectsStored: 0,
    totalNotificationsSent: 0,
    notificationsToday: 0,
    errors: 0,
    initialSyncComplete: false,
  };

  constructor(repository: ProjectsRepository, discord: DiscordBot) {
    this.repository = repository;
    this.discord = discord;
  }

  getStatus(): MonitorStatus {
    return {
      ...this.status,
      totalProjectsStored: this.repository.countAll(),
      totalNotificationsSent: this.repository.countNotified(),
      notificationsToday: this.repository.countNotifiedToday(),
      errors: this.errorCount,
      initialSyncComplete: this.initialSyncComplete,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.status.online = true;
    logger.info("Monitor started");

    await this.runCheck();

    const intervalMs = config.monitor.checkIntervalMinutes * 60 * 1000;
    this.intervalHandle = setInterval(() => {
      void this.runCheck();
    }, intervalMs);

    this.scheduleNextCheck(intervalMs);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.running = false;
    this.status.online = false;
    this.status.nextCheckAt = null;
    logger.info("Monitor stopped");
  }

  private scheduleNextCheck(intervalMs: number): void {
    this.status.nextCheckAt = new Date(Date.now() + intervalMs);
  }

  private async runCheck(): Promise<void> {
    const startedAt = new Date();
    logger.info("Checking Mostaql...");

    let projectsFound = 0;
    let newProjects = 0;
    let notificationsSent = 0;

    try {
      const listing = await this.client.fetchListing();
      projectsFound = listing.length;
      logger.info(`${projectsFound} projects found`);

      const isFirstRun = config.monitor.initialSync && !this.initialSyncComplete;

      for (const listingProject of listing) {
        if (this.repository.exists(listingProject.id)) {
          continue;
        }

        newProjects++;

        let project: MostaqlProject;
        if (isFirstRun) {
          project = listingProject;
        } else {
          try {
            project = await this.client.fetchProjectDetails(listingProject);
          } catch (error) {
            logger.warn(
              `Failed to fetch details for project ${listingProject.id}, using listing data`,
              error,
            );
            project = listingProject;
          }
        }

        const inserted = this.repository.insert(project, null);
        if (!inserted) continue;

        if (isFirstRun) {
          logger.info(`Project ${project.id} marked as known (initial sync)`);
          continue;
        }

        if (config.filter.enabled) {
          const filterResult = matchesKeywords(project, config.filter.keywords);
          if (!filterResult.matched) {
            logger.info(`Project ${project.id} skipped — no keyword match`);
            continue;
          }

          await this.notify(project, filterResult.matchedKeywords);
          notificationsSent++;
          continue;
        }

        await this.notify(project, []);
        notificationsSent++;
      }

      if (isFirstRun) {
        this.initialSyncComplete = true;
        logger.info(`Initial sync complete — ${newProjects} existing projects marked as known`);
      }

      this.status.lastCheckAt = new Date();
      this.status.lastProjectsFound = projectsFound;
      this.status.lastNewProjects = newProjects;
      this.status.lastNotificationsSent = notificationsSent;
      this.status.initialSyncComplete = this.initialSyncComplete;

      logger.info(`New projects: ${newProjects}`);
      logger.info(`Discord notifications: ${notificationsSent}`);

      this.repository.recordRun(startedAt, new Date(), projectsFound, newProjects);
    } catch (error) {
      this.errorCount++;
      this.status.errors = this.errorCount;
      logger.error("Failed to fetch Mostaql", error);
      this.repository.recordRun(
        startedAt,
        new Date(),
        projectsFound,
        newProjects,
        error instanceof Error ? error.message : String(error),
      );
    }

    if (this.intervalHandle) {
      this.scheduleNextCheck(config.monitor.checkIntervalMinutes * 60 * 1000);
    }
  }

  async runTestFetch(): Promise<{ project: MostaqlProject; matchedKeywords: string[] }> {
    logger.info("Test fetch — loading latest Mostaql project");
    const project = await this.client.fetchLatestProject();
    const matchedKeywords = config.filter.enabled
      ? matchesKeywords(project, config.filter.keywords).matchedKeywords
      : [];

    return { project, matchedKeywords };
  }

  private async notify(project: MostaqlProject, matchedKeywords: string[]): Promise<void> {
    if (!this.discord.isReady()) {
      logger.warn(`Discord not ready — skipping notification for project ${project.id}`);
      return;
    }

    const embed = buildProjectEmbed(project, matchedKeywords);
    await this.discord.sendProjectNotification(embed);
    this.repository.markNotified(project.id);
    logger.info(`Discord notification sent for project ${project.id}`);
  }
}
