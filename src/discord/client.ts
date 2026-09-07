import {
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { config } from "../config/env.js";
import { buildLatestTestEmbed, buildProjectEmbed } from "./embeds.js";
import type { MonitorStatus, MostaqlProject } from "../mostaql/types.js";
import { logger } from "../utils/logger.js";

export type StatusProvider = () => MonitorStatus;
export type TestFetchHandler = () => Promise<{
  project: MostaqlProject;
  matchedKeywords: string[];
}>;

export class DiscordBot {
  private client: Client;
  private ready = false;
  private statusProvider: StatusProvider = () => ({
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
  });
  private testFetchHandler: TestFetchHandler | null = null;

  constructor() {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });
  }

  setStatusProvider(provider: StatusProvider): void {
    this.statusProvider = provider;
  }

  setTestFetchHandler(handler: TestFetchHandler): void {
    this.testFetchHandler = handler;
  }

  async start(): Promise<void> {
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      void this.handleCommand(interaction);
    });

    await this.client.login(config.discord.token);
    await this.waitUntilReady();
    await this.registerCommands();
  }

  private waitUntilReady(): Promise<void> {
    if (this.client.isReady()) {
      this.ready = true;
      logger.info(`Discord bot logged in as ${this.client.user!.tag}`);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.client.once(Events.ClientReady, (readyClient) => {
        this.ready = true;
        logger.info(`Discord bot logged in as ${readyClient.user.tag}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.client.isReady()) {
      await this.client.destroy();
    }
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready;
  }

  async sendProjectNotification(embed: EmbedBuilder): Promise<void> {
    const channel = await this.getTargetChannel();
    await channel.send({ embeds: [embed] });
  }

  private async getTargetChannel(): Promise<TextChannel> {
    const channel = await this.client.channels.fetch(config.discord.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`Discord channel ${config.discord.channelId} is not a text channel`);
    }
    return channel;
  }

  private async registerCommands(): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName("status")
        .setDescription("Show Mostaql monitor status"),
      new SlashCommandBuilder()
        .setName("test")
        .setDescription("Fetch the latest Mostaql project and post it now"),
      new SlashCommandBuilder()
        .setName("stats")
        .setDescription("Show monitoring statistics"),
    ].map((cmd) => cmd.toJSON());

    const rest = new REST({ version: "10" }).setToken(config.discord.token);
    const applicationId = this.client.application!.id;

    const channel = await this.getTargetChannel();
    const guildId = channel.guildId;
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(applicationId, guildId), {
        body: commands,
      });
      logger.info(`Discord slash commands registered for guild ${guildId}`);
      return;
    }

    await rest.put(Routes.applicationCommands(applicationId), { body: commands });
    logger.info("Discord slash commands registered globally");
  }

  private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      switch (interaction.commandName) {
        case "status":
          await interaction.reply({ content: this.formatStatusMessage() });
          break;
        case "test":
          await this.handleTestCommand(interaction);
          break;
        case "stats":
          await interaction.reply({ content: this.formatStatsMessage() });
          break;
        default:
          await interaction.reply({ content: "Unknown command.", ephemeral: true });
      }
    } catch (error) {
      logger.error("Discord command failed", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Command failed. Check bot logs for details.",
          ephemeral: true,
        });
      }
    }
  }

  private async handleTestCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!this.testFetchHandler) {
      await interaction.reply({
        content: "Test fetch is not configured.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const { project, matchedKeywords } = await this.testFetchHandler();
      const embed = buildLatestTestEmbed(project, matchedKeywords);
      await this.sendProjectNotification(embed);

      const filterNote =
        config.filter.enabled && matchedKeywords.length === 0
          ? " (does not match your keywords)"
          : matchedKeywords.length > 0
            ? ` (matched: ${matchedKeywords.join(", ")})`
            : "";

      await interaction.editReply({
        content: `Fetched and posted the latest project: **${project.title}**${filterNote}`,
      });
    } catch (error) {
      logger.error("Test fetch failed", error);
      await interaction.editReply({
        content: "Failed to fetch the latest Mostaql project. Check bot logs for details.",
      });
    }
  }

  private formatStatusMessage(): string {
    const status = this.statusProvider();
    const lastCheck = status.lastCheckAt
      ? formatRelativeTime(status.lastCheckAt)
      : "Never";
    const nextCheck = status.nextCheckAt
      ? status.nextCheckAt.toLocaleTimeString()
      : "Unknown";

    return [
      "**Mostaql Monitor**",
      "",
      `Status: ${status.online ? "🟢 Online" : "🔴 Offline"}`,
      `Last check: ${lastCheck}`,
      `Next check: ${nextCheck}`,
      `Projects found (last run): ${status.lastProjectsFound}`,
      `New projects (last run): ${status.lastNewProjects}`,
      `Notifications (last run): ${status.lastNotificationsSent}`,
      `Initial sync: ${status.initialSyncComplete ? "Complete" : "Pending"}`,
      `Errors: ${status.errors}`,
    ].join("\n");
  }

  private formatStatsMessage(): string {
    const status = this.statusProvider();
    return [
      "**Mostaql Monitor Stats**",
      "",
      `Projects monitored: ${status.totalProjectsStored.toLocaleString()}`,
      `Notifications sent: ${status.totalNotificationsSent.toLocaleString()}`,
      `New today: ${status.notificationsToday}`,
    ].join("\n");
  }
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}
