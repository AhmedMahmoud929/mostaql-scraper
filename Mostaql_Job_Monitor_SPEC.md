# Mostaql Job Monitor — Technical Specification

**Version:** 1.0  
**Target:** Node.js + Discord Bot + Mostaql monitoring  
**Deployment:** User's existing server/VPS

## 1. Objective

Build a background Node.js service that continuously monitors:

https://mostaql.com/projects?category=development&sort=latest

When a new project appears, the service should:

1. Detect the project.
2. Extract relevant information.
3. Determine whether it has already been processed.
4. Store it as processed.
5. Send a formatted Discord notification.
6. Continue monitoring automatically.

The system must survive restarts without sending duplicate notifications.

---

## 2. High-Level Architecture

```text
                     ┌─────────────────────┐
                     │       Mostaql       │
                     │  Latest Development │
                     │      Projects       │
                     └──────────┬──────────┘
                                │
                                │ HTTP request
                                ▼
                     ┌─────────────────────┐
                     │    Fetcher/Client   │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │      Parser         │
                     │ HTML / JSON / API   │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ Project Normalizer  │
                     └──────────┬──────────┘
                                │
                                ▼
                     ┌─────────────────────┐
                     │ Duplicate Detector  │
                     │      SQLite         │
                     └──────────┬──────────┘
                                │
                         New project?
                          /          \
                        YES           NO
                         │             │
                         ▼             ▼
                ┌──────────────┐    Ignore
                │   Discord    │
                │     Bot      │
                └──────┬───────┘
                       │
                       ▼
                 Discord Channel
```

---

## 3. Core Components

### 3.1 Monitor

Responsible for periodically checking Mostaql.

```text
Monitor
 ├── trigger fetch
 ├── receive projects
 ├── normalize projects
 ├── check database
 └── process new projects
```

Default interval:

```text
5 minutes
```

Configurable through:

```env
CHECK_INTERVAL_MINUTES=5
```

Do not make requests every few seconds.

---

## 4. Mostaql Data Acquisition

This is the first technical investigation during implementation.

We should **not assume that HTML scraping is the best approach**.

### Option A — Public/internal JSON endpoint

If the page loads projects through an accessible endpoint:

```text
Browser
   ↓
Mostaql API/request
   ↓
JSON projects
```

Prefer this.

### Option B — Server-rendered HTML

If projects are included directly in the HTML:

```text
HTTP GET
   ↓
HTML
   ↓
Cheerio
   ↓
Projects
```

Use a lightweight HTML parser.

### Option C — Browser automation

Only use Playwright/Puppeteer if necessary, for example if:

- JavaScript is required to render the projects.
- Important data is unavailable through HTTP.
- Anti-bot mechanisms prevent normal requests.

Browser automation should not be the first choice because it consumes considerably more CPU/RAM.

---

## 5. Project Data Model

Normalize every project into the same internal structure.

```ts
interface MostaqlProject {
  id: string;
  title: string;
  url: string;

  description?: string;

  budget?: {
    min?: number;
    max?: number;
    currency?: string;
  };

  skills: string[];

  client?: {
    name?: string;
    profileUrl?: string;
  };

  publishedAt?: Date;

  source: "mostaql";
  discoveredAt: Date;
}
```

The `id` is extremely important.

Prefer Mostaql's actual project ID if available.

Do not use the title as the unique identifier because titles can be duplicated or changed.

---

## 6. Database

Use SQLite initially.

There is no reason to introduce PostgreSQL for the first version.

Suggested schema:

```sql
CREATE TABLE projects (
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
```

Optional monitoring table:

```sql
CREATE TABLE monitor_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    projects_found INTEGER,
    new_projects INTEGER,
    error TEXT
);
```

---

## 7. Duplicate Detection

The most important rule:

```text
IF project.id exists in database
    → DO NOT send Discord message

IF project.id does not exist
    → insert project
    → send Discord notification
```

The database should enforce:

```sql
PRIMARY KEY (id)
```

The implementation should also safely handle duplicate insert attempts.

---

## 8. Startup Behavior

The bot should **not automatically send every existing project when it starts for the first time**.

Otherwise:

```text
Install bot
     ↓
Find 30 existing projects
     ↓
Discord receives 30 messages
```

Instead:

### First startup

Fetch current projects and mark them as known.

```text
Existing projects
       ↓
Save to database
       ↓
No notifications
```

### Subsequent checks

```text
New project
    ↓
Discord notification
```

Environment variable:

```env
INITIAL_SYNC=true
```

---

## 9. Discord Integration

Use:

```text
discord.js
```

The bot should send messages to a configured channel.

Environment variables:

```env
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=
```

**Never commit these values to Git.**

---

## 10. Discord Message

Use a Discord Embed rather than plain text.

Example:

```text
🚀 New Mostaql Project

Build a React Dashboard

━━━━━━━━━━━━━━━━━━━━

💰 Budget
$300 - $600

🛠 Skills
React • JavaScript • Node.js • TailwindCSS

📝 Description
I need a developer to build...

━━━━━━━━━━━━━━━━━━━━

[ View Project ]
```

Suggested embed fields:

```ts
{
  title: project.title,
  url: project.url,

  fields: [
    {
      name: "💰 Budget",
      value: "...",
      inline: true
    },
    {
      name: "🛠 Skills",
      value: "...",
      inline: true
    }
  ]
}
```

---

## 11. Discord Commands

Version 1 does not need a complicated command system.

### `/status`

Returns:

```text
Mostaql Monitor

Status: 🟢 Online
Last check: 2 minutes ago
Projects found: 20
New projects: 1
```

### `/test`

Sends a test notification to verify Discord configuration.

### Optional `/stats`

Returns:

```text
Projects monitored: 1,284
Projects matched: 173
Notifications sent: 173
```

---

## 12. Filtering

Version 1 should support basic keyword filtering.

Example:

```env
KEYWORDS=React,Next.js,Node.js,TypeScript,TailwindCSS,JavaScript
```

Logic:

```text
New project
     ↓
Extract title
Extract description
Extract skills
     ↓
Keyword matching
     ↓
Match?
 ┌───┴───┐
YES      NO
 ↓        ↓
Notify   Ignore
```

Filtering should be optional:

```env
FILTER_ENABLED=false
```

This allows the first production version to collect information about the kinds of jobs appearing before aggressive filtering is enabled.

---

## 13. Keyword Matching

Initial matching should be case-insensitive.

Example:

```js
const keywords = [
  "react",
  "next.js",
  "node.js",
  "typescript",
  "javascript",
  "tailwind",
  "frontend",
  "backend",
  "full stack"
];
```

Search across:

```text
title
+
description
+
skills
```

Normalize common variations where appropriate:

```text
React
react
REACT
ReactJS
```

---

## 14. Match Score

A later version can assign a score.

Example:

```text
React              +30
Next.js             +25
Node.js             +20
TypeScript          +15
TailwindCSS         +10
```

Example project:

```text
"Build a Next.js dashboard with Node.js API"
```

Score:

```text
React      0
Next.js   +25
Node.js   +20
TypeScript 0
Tailwind   0

Score = 45
```

Configuration:

```env
MIN_MATCH_SCORE=40
```

Only notify when:

```text
score >= MIN_MATCH_SCORE
```

---

## 15. AI Matching — Version 2

AI should **not** be required for the first version.

Later:

```text
Mostaql
   ↓
Project
   ↓
Rule-based filter
   ↓
Potential match
   ↓
LLM
   ↓
Match score + reasoning
   ↓
Discord
```

Discord could show:

```text
🔥 91% Match

Why?

• React is required
• Node.js is required
• TypeScript is preferred
• Project matches your full-stack profile

Recommendation:
HIGH PRIORITY
```

AI should remain an optional module so the basic scraper continues working if the AI API is unavailable.

---

## 16. Error Handling

The monitor must never permanently crash because Mostaql temporarily fails.

Example:

```text
Request
   ↓
Failed
   ↓
Retry
   ↓
Failed
   ↓
Log error
   ↓
Wait until next scheduled run
```

Recommended:

```env
MAX_RETRIES=3
REQUEST_TIMEOUT_MS=15000
```

Example logs:

```text
[2026-09-06 22:45:00] Checking Mostaql...
[2026-09-06 22:45:02] Found 20 projects
[2026-09-06 22:45:02] New projects: 2
[2026-09-06 22:45:03] Discord notifications: 2
```

---

## 17. Logging

Use structured logging eventually.

For V1:

```text
INFO
WARN
ERROR
```

Example:

```text
INFO  Monitor started
INFO  Fetching projects
INFO  20 projects found
INFO  Project 12345 is new
INFO  Discord notification sent
ERROR Failed to fetch Mostaql
```

---

## 18. Security

Never commit:

```text
DISCORD_BOT_TOKEN
API keys
AI API keys
server credentials
```

Use:

```text
.env
```

and:

```gitignore
.env
data/
node_modules/
```

Example:

```env
DISCORD_BOT_TOKEN=xxxxxxxx
DISCORD_CHANNEL_ID=xxxxxxxx
CHECK_INTERVAL_MINUTES=5
FILTER_ENABLED=false
DATABASE_PATH=./data/mostaql.db
```

---

## 19. Project Structure

Use TypeScript:

```text
mostaql-monitor/
│
├── src/
│   ├── index.ts
│   │
│   ├── config/
│   │   └── env.ts
│   │
│   ├── monitor/
│   │   ├── monitor.ts
│   │   └── scheduler.ts
│   │
│   ├── mostaql/
│   │   ├── client.ts
│   │   ├── parser.ts
│   │   └── types.ts
│   │
│   ├── database/
│   │   ├── database.ts
│   │   └── projects.repository.ts
│   │
│   ├── discord/
│   │   ├── client.ts
│   │   ├── notifier.ts
│   │   └── embeds.ts
│   │
│   ├── filters/
│   │   ├── keyword-filter.ts
│   │   └── scoring.ts
│   │
│   └── utils/
│       ├── logger.ts
│       └── retry.ts
│
├── data/
│   └── mostaql.db
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 20. Dependencies

Initial dependencies:

```text
discord.js
cheerio
dotenv
better-sqlite3
```

Potential additions:

```text
zod
pino
node-cron
```

If browser automation becomes necessary:

```text
playwright
```

Do not add Playwright until the simpler HTTP approach has been tested.

---

## 21. Scheduling

The Discord bot needs to remain connected, so use a long-running Node.js process.

```text
Node.js
  │
  ├── check
  ├── wait
  ├── check
  ├── wait
  └── ...
```

Default:

```env
CHECK_INTERVAL_MINUTES=5
```

---

## 22. Deployment

### Preferred: Docker

If the server already uses Docker:

```text
Docker
 └── Mostaql Monitor
       ├── Node.js
       ├── SQLite
       └── Discord Bot
```

Persist SQLite data with a volume:

```text
./data:/app/data
```

### Alternative: PM2

If Docker is not used:

```text
Ubuntu
  ↓
Node.js
  ↓
PM2
  ↓
Mostaql Monitor
```

PM2 provides:

- automatic restart
- logs
- process monitoring
- startup persistence

---

## 23. Health Monitoring

Provide basic status information.

Discord:

```text
/status
```

Example:

```text
🟢 Monitor: Online

Last check:
22:43:12

Next check:
22:48:12

Projects:
20

New today:
7

Notifications:
7

Errors:
0
```

---

## 24. Graceful Shutdown

Handle:

```text
SIGTERM
SIGINT
```

Before exiting:

```text
Stop scheduler
Disconnect Discord
Close database
Exit
```

This is important when deploying with Docker or PM2.

---

## 25. Testing

Tests should cover:

### Parser

```text
HTML → Project[]
```

### Duplicate detection

```text
existing project → false
new project → true
```

### Filtering

```text
React project → match
unrelated project → no match
```

### Discord

```text
project → valid embed
```

### Failure handling

```text
Mostaql unavailable → retry
Discord unavailable → error logged
database unavailable → service reports error
```

---

## 26. Development Phases

### Phase 1 — Discovery

Before writing the scraper:

1. Inspect the Mostaql page.
2. Determine whether projects are server-rendered.
3. Inspect network requests.
4. Identify the project ID.
5. Determine the minimum information available.
6. Check whether there is a usable endpoint.
7. Choose HTTP/HTML/API/browser approach.

**Do not blindly start with Puppeteer.**

### Phase 2 — Basic Monitor

Implement:

```text
Mostaql → fetch → parse → console.log
```

No Discord yet.

Goal:

```text
Found 20 projects

1. Build React website
2. Develop mobile application
3. Create Node.js API
...
```

### Phase 3 — Persistence

Add SQLite:

```text
Mostaql
   ↓
Parser
   ↓
SQLite
```

Verify that restarting the application does not cause duplicates.

### Phase 4 — Discord

Add:

```text
Discord Bot
```

Then:

```text
New project
    ↓
Discord Embed
```

### Phase 5 — Filtering

Add:

```text
keywords
score
minimum score
```

### Phase 6 — Production Deployment

Deploy to the server:

```text
Git
 ↓
Server
 ↓
Install
 ↓
Environment variables
 ↓
Database
 ↓
PM2/Docker
 ↓
Discord Bot
```

### Phase 7 — AI

Only after the basic system is stable:

```text
Project
 ↓
AI
 ↓
Match score
 ↓
Reason
 ↓
Discord
```

---

## 27. Important Design Decision

Do **not** make the Discord bot and scraper two separate applications initially.

Use one service:

```text
Mostaql Monitor
│
├── Discord connection
├── Monitor
├── Parser
├── Database
└── Filters
```

If the project grows later:

```text
                    ┌── Scraper
                    │
Mostaql → Queue ────┼── AI Worker
                    │
                    └── Discord Worker
```

That is unnecessary for V1.

---

## 28. V1 Success Criteria

The first production version is complete when:

- [ ] Bot connects to Discord.
- [ ] Mostaql projects can be retrieved reliably.
- [ ] Project IDs are extracted.
- [ ] New projects are detected.
- [ ] Existing projects aren't notified twice.
- [ ] Discord embeds are sent.
- [ ] Service survives restart.
- [ ] Errors don't permanently stop monitoring.
- [ ] Configuration is environment-based.
- [ ] Logs are available.
- [ ] Service automatically starts after server reboot.
- [ ] No secrets are stored in Git.

---

## 29. Implementation Requirements

Before implementation, determine:

1. The exact Mostaql data source used by the current project listing.
2. Whether an internal/public endpoint is available.
3. Whether authentication is required.
4. Whether rate limiting or anti-bot behavior affects requests.
5. The exact HTML selectors if HTML parsing is required.
6. The exact project ID and URL format.
7. Which project fields are reliably available.
8. The user's server deployment method.

Do not hard-code assumptions about Mostaql's frontend structure before this discovery step.

---

## 30. Required User Configuration

The user should only need to provide configuration such as:

```env
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=

CHECK_INTERVAL_MINUTES=5

FILTER_ENABLED=false
KEYWORDS=React,Next.js,Node.js,TypeScript,TailwindCSS

MIN_MATCH_SCORE=40

DATABASE_PATH=./data/mostaql.db
```

Secrets must remain outside source control.

---

## 31. Future Features

Possible future additions:

- AI project matching.
- Multiple Discord channels.
- Multiple Mostaql categories.
- Budget filtering.
- Minimum/maximum project budget.
- Required skills filtering.
- Excluded keywords.
- Priority levels.
- Daily statistics.
- Weekly reports.
- Web dashboard.
- Project history.
- Automatic proposal generation.
- Job ranking.
- Notification throttling.
- Monitoring multiple freelance platforms.

The architecture should leave room for these without requiring a complete rewrite.
