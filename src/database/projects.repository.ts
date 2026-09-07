import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config/env.js";
import type { MostaqlProject, StoredProject } from "../mostaql/types.js";

export class ProjectsRepository {
  private db: DatabaseSync;

  constructor(dbPath: string = config.database.path) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT,
        budget_min REAL,
        budget_max REAL,
        currency TEXT,
        published_at TEXT,
        discovered_at TEXT NOT NULL,
        notified_at TEXT
      );

      CREATE TABLE IF NOT EXISTS monitor_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        projects_found INTEGER,
        new_projects INTEGER,
        error TEXT
      );
    `);
  }

  exists(id: string): boolean {
    const row = this.db.prepare("SELECT 1 AS found FROM projects WHERE id = ?").get(id) as
      | { found: number }
      | undefined;
    return row !== undefined;
  }

  insert(project: MostaqlProject, notifiedAt: Date | null = null): boolean {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO projects (
        id, title, url, description, budget_min, budget_max, currency,
        published_at, discovered_at, notified_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    const result = stmt.run(
      project.id,
      project.title,
      project.url,
      project.description ?? null,
      project.budget?.min ?? null,
      project.budget?.max ?? null,
      project.budget?.currency ?? null,
      project.publishedAt?.toISOString() ?? null,
      project.discoveredAt.toISOString(),
      notifiedAt?.toISOString() ?? null,
    );

    return result.changes > 0;
  }

  markNotified(id: string, notifiedAt: Date = new Date()): void {
    this.db
      .prepare("UPDATE projects SET notified_at = ? WHERE id = ?")
      .run(notifiedAt.toISOString(), id);
  }

  countAll(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM projects").get() as {
      count: number;
    };
    return row.count;
  }

  countNotified(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM projects WHERE notified_at IS NOT NULL")
      .get() as { count: number };
    return row.count;
  }

  countNotifiedToday(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM projects WHERE notified_at >= ?")
      .get(today.toISOString()) as { count: number };
    return row.count;
  }

  recordRun(
    startedAt: Date,
    completedAt: Date,
    projectsFound: number,
    newProjects: number,
    error: string | null = null,
  ): void {
    this.db
      .prepare(`
        INSERT INTO monitor_runs (started_at, completed_at, projects_found, new_projects, error)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        startedAt.toISOString(),
        completedAt.toISOString(),
        projectsFound,
        newProjects,
        error,
      );
  }

  close(): void {
    this.db.close();
  }
}

export function toStoredProject(project: MostaqlProject): StoredProject {
  return {
    id: project.id,
    title: project.title,
    url: project.url,
    description: project.description ?? null,
    budget_min: project.budget?.min ?? null,
    budget_max: project.budget?.max ?? null,
    currency: project.budget?.currency ?? "USD",
    published_at: project.publishedAt?.toISOString() ?? null,
    discovered_at: project.discoveredAt.toISOString(),
    notified_at: null,
  };
}
