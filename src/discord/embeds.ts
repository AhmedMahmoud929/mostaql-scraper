import { EmbedBuilder } from "discord.js";
import { formatArabicRelative } from "../mostaql/parser.js";
import type { MostaqlProject } from "../mostaql/types.js";

export function buildProjectEmbed(
  project: MostaqlProject,
  matchedKeywords: string[] = [],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x2386c8)
    .setTitle(project.title)
    .setURL(project.url)
    .setDescription(truncate(project.description ?? "No description available.", 400))
    .setTimestamp(project.publishedAt ?? project.discoveredAt)
    .setFooter({ text: "Mostaql Job Monitor" });

  embed.addFields({
    name: "📋 Project Details",
    value: buildDetailsTable(project),
    inline: false,
  });

  embed.addFields({
    name: "🛠 Skills",
    value: formatSkills(project.skills),
    inline: false,
  });

  if (matchedKeywords.length > 0) {
    embed.addFields({
      name: "🎯 Matched Keywords",
      value: matchedKeywords.join(" • "),
      inline: false,
    });
  }

  return embed;
}

export function buildLatestTestEmbed(
  project: MostaqlProject,
  matchedKeywords: string[] = [],
): EmbedBuilder {
  const embed = buildProjectEmbed(project, matchedKeywords);
  embed
    .setColor(0x57f287)
    .setAuthor({ name: "Test — Latest Mostaql Project (live fetch)" });

  return embed;
}

function buildDetailsTable(project: MostaqlProject): string {
  const rows: Array<[string, string]> = [
    ["الميزانية", formatBudget(project.budget)],
    ["مدة التنفيذ", project.deliveryPeriod ?? "غير محددة"],
    ["الحالة", project.status ?? "غير محددة"],
    ["العميل", project.client?.name ?? "غير محدد"],
    ["منذ", project.publishedRelative ?? formatArabicRelative(project.publishedAt) ?? "غير محدد"],
    ["المتقدمين", formatApplicants(project.bidsCount)],
    ["رقم المشروع", project.id],
  ];

  const labelWidth = Math.max(...rows.map(([label]) => label.length));

  const table = rows
    .map(([label, value]) => `${label.padEnd(labelWidth)} │ ${value}`)
    .join("\n");

  return `\`\`\`\n${table}\n\`\`\``;
}

function formatApplicants(count: number | undefined): string {
  if (count == null) return "غير محدد";
  if (count === 0) return "0 متقدم";
  if (count === 1) return "1 متقدم";
  if (count === 2) return "2 متقدمين";
  if (count >= 3 && count <= 10) return `${count} متقدمين`;
  return `${count} متقدم`;
}

function formatBudget(budget: MostaqlProject["budget"]): string {
  if (!budget?.min && !budget?.max) return "غير محددة";

  const symbol = budget.currency === "SAR" ? "ر.س " : "$";

  if (budget.min != null && budget.max != null && budget.min !== budget.max) {
    return `${symbol}${formatAmount(budget.min)} - ${symbol}${formatAmount(budget.max)}`;
  }

  const amount = budget.max ?? budget.min;
  return amount != null ? `${symbol}${formatAmount(amount)}` : "غير محددة";
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatSkills(skills: string[]): string {
  if (skills.length === 0) return "غير محددة";
  const display = skills.slice(0, 8).join(" • ");
  return skills.length > 8 ? `${display} • …` : display;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}
