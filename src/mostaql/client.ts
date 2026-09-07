import { config } from "../config/env.js";
import { withRetry } from "../utils/retry.js";
import { parseDetailPage, parseListingPage } from "./parser.js";
import type { MostaqlProject } from "./types.js";

export class MostaqlClient {
  async fetchListing(): Promise<MostaqlProject[]> {
    const html = await this.fetchHtml(config.mostaql.listingUrl);
    return parseListingPage(html, new Date());
  }

  async fetchLatestProject(): Promise<MostaqlProject> {
    const listing = await this.fetchListing();
    if (listing.length === 0) {
      throw new Error("No projects found on Mostaql listing");
    }

    return this.fetchProjectDetails(listing[0]!);
  }

  async fetchProjectDetails(project: MostaqlProject): Promise<MostaqlProject> {
    const html = await this.fetchHtml(project.url);
    return parseDetailPage(html, project);
  }

  private async fetchHtml(url: string): Promise<string> {
    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          config.monitor.requestTimeoutMs,
        );

        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent": config.mostaql.userAgent,
              Accept: "text/html,application/xhtml+xml",
              "Accept-Language": "ar,en;q=0.9",
            },
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status} fetching ${url}`);
          }

          return await response.text();
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        maxRetries: config.monitor.maxRetries,
        label: `Fetch ${url}`,
      },
    );
  }
}
