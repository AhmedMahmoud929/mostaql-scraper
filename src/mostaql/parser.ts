import * as cheerio from "cheerio";
import type { MostaqlProject } from "./types.js";

const PROJECT_URL_PATTERN = /\/project\/(\d+)/;

export function extractProjectId(url: string): string | null {
  const match = url.match(PROJECT_URL_PATTERN);
  return match?.[1] ?? null;
}

export function parseListingPage(html: string, discoveredAt: Date): MostaqlProject[] {
  const $ = cheerio.load(html);
  const projects: MostaqlProject[] = [];
  const seen = new Set<string>();

  $("tr.project-row").each((_, row) => {
    const titleLink = $(row).find(".card--title h2 a").first();
    const href = titleLink.attr("href");
    if (!href) return;

    const id = extractProjectId(href);
    if (!id || seen.has(id)) return;
    seen.add(id);

    const url = href.startsWith("http") ? href : `https://mostaql.com${href}`;
    const title = titleLink.text().trim();

    const clientEl = $(row).find(".project__meta li .fa-user").parent();
    const clientName = clientEl.find("bdi").text().trim() || clientEl.text().trim();

    const timeEl = $(row).find("time[datetime]").first();
    const publishedAt = timeEl.attr("datetime")
      ? new Date(timeEl.attr("datetime")!)
      : undefined;
    const publishedRelative = parsePublishedRelative($, timeEl);

    const description = $(row)
      .find(".project__brief .details-url")
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const bidsText = $(row)
      .find(".project__meta li")
      .filter((_, el) => $(el).find(".hsoub-file-signature-icon, .fa-file-text-o").length > 0)
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const bidsCount = parseBidsCount(bidsText);

    projects.push({
      id,
      title,
      url,
      description: description || undefined,
      skills: [],
      client: clientName ? { name: clientName } : undefined,
      publishedAt,
      publishedRelative,
      bidsCount,
      source: "mostaql",
      discoveredAt,
    });
  });

  return projects;
}

export function parseDetailPage(html: string, base: MostaqlProject): MostaqlProject {
  const $ = cheerio.load(html);

  const fullDescription = $("[data-type='project-description'], .project-details, .project__description")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const briefFromPage = $(".project__brief, .text-wrapper-div")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const description = fullDescription || briefFromPage || base.description;

  const meta = parseMetaRows($);
  const budgetText =
    meta.budget ??
    $('[data-type="project-budget_range"] span, [data-type*="budget"] span').first().text().trim();
  const budget = parseBudget(budgetText);

  const skills: string[] = [];
  $(".skills .tag bdi, .skills__item .tag bdi, ul.skills .tag").each((_, el) => {
    const skill = $(el).text().trim();
    if (skill && !skills.includes(skill)) {
      skills.push(skill);
    }
  });

  const clientLink = $('a[href*="/u/"], a[href*="/user/"]').first();
  const clientName =
    base.client?.name ||
    $('[data-type="employer_widget"] .media-heading, .employer-name').first().text().trim() ||
    undefined;

  const timeEl = $("time[datetime]").first();
  const publishedAt = timeEl.attr("datetime")
    ? new Date(timeEl.attr("datetime")!)
    : base.publishedAt;
  const publishedRelative =
    parsePublishedRelative($, timeEl) ?? base.publishedRelative ?? formatArabicRelative(publishedAt);

  const bidsCount = base.bidsCount ?? parseDetailBidsCount($);

  return {
    ...base,
    description,
    budget,
    skills,
    status: meta.status ?? base.status,
    deliveryPeriod: meta.period ?? base.deliveryPeriod,
    client: {
      name: clientName,
      profileUrl: clientLink.attr("href") ?? base.client?.profileUrl,
    },
    publishedAt,
    publishedRelative,
    bidsCount,
  };
}

function parseMetaRows($: cheerio.CheerioAPI): {
  status?: string;
  budget?: string;
  period?: string;
} {
  const result: { status?: string; budget?: string; period?: string } = {};

  $(".meta-container .meta-row").each((_, row) => {
    const label = $(row).find(".meta-label").first().text().replace(/\s+/g, " ").trim();
    const value = $(row)
      .find(".meta-value")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    if (!label || !value) return;

    if (label.includes("حالة") || label.toLowerCase().includes("status")) {
      result.status = value;
    } else if (label.includes("ميزانية") || label.toLowerCase().includes("budget")) {
      result.budget = value;
    } else if (label.includes("مدة") || label.toLowerCase().includes("period")) {
      result.period = value;
    }
  });

  return result;
}

function parseBidsCount(text: string): number | undefined {
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function parsePublishedRelative(
  $: cheerio.CheerioAPI,
  timeEl: cheerio.Cheerio<any>,
): string | undefined {
  if (!timeEl.length) return undefined;

  const text = timeEl
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const match = text.match(/منذ\s+(.+)/);
  if (match?.[1]) {
    return `منذ ${match[1].trim()}`;
  }

  return text || undefined;
}

function parseDetailBidsCount($: cheerio.CheerioAPI): number | undefined {
  const heading = $("#project-bids .heada__title, [data-target='#bidsCollection-panel']").first().text();
  const match = heading.match(/(\d+)/);
  if (match) return Number(match[1]);

  const items = $("[data-filter='bidsCollection'] > .list-group-item, #bidsCollection-panel > .list-group-item").length;
  return items > 0 ? items : undefined;
}

export function formatArabicRelative(date: Date | undefined): string | undefined {
  if (!date) return undefined;

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return "منذ لحظات";
  if (minutes < 60) return `منذ ${minutes} ${minutes === 1 ? "دقيقة" : "دقيقة"}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ${hours === 1 ? "ساعة" : "ساعات"}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} ${days === 1 ? "يوم" : "أيام"}`;

  const months = Math.floor(days / 30);
  return `منذ ${months} ${months === 1 ? "شهر" : "أشهر"}`;
}

function parseBudget(text: string): MostaqlProject["budget"] | undefined {
  if (!text) return undefined;

  const numbers = text.match(/[\d,]+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0) return undefined;

  const values = numbers.map((n) => parseFloat(n.replace(/,/g, "")));
  const currency = text.includes("$")
    ? "USD"
    : text.includes("ر.س") || text.includes("SAR")
      ? "SAR"
      : undefined;

  if (values.length === 1) {
    return { min: values[0], max: values[0], currency };
  }

  return {
    min: values[0],
    max: values[1],
    currency,
  };
}
