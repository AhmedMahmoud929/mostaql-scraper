# Mostaql Job Monitor

Monitors [Mostaql development projects](https://mostaql.com/projects?category=development&sort=latest) and sends Discord notifications when new matching projects appear.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables and fill in your Discord credentials:

```bash
cp .env.example .env
```

3. Run in development:

```bash
npm run dev
```

Or build and run:

```bash
npm run build
npm start
```

## Run with Docker Compose

Docker Compose runs the monitor as a background worker and persists its SQLite
database in a named Docker volume. It does not expose a network port because
the monitor only makes outbound connections to Mostaql and Discord.

1. Create and fill in the runtime environment file:

```bash
cp .env.example .env
```

2. Build and start the monitor:

```bash
docker compose up --build -d
```

3. Follow its logs:

```bash
docker compose logs --follow
```

The service restarts automatically unless it is explicitly stopped. To stop it
without deleting the saved project history, run:

```bash
docker compose down
```

To start it again after an image or configuration change:

```bash
docker compose up --build -d
```

The database volume is intentionally retained by `docker compose down`. To
discard all stored projects and make the next start an initial sync again, run
`docker compose down --volumes`.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Discord bot token | required |
| `DISCORD_CHANNEL_ID` | Target Discord channel ID | required |
| `CHECK_INTERVAL_MINUTES` | Polling interval | `5` |
| `INITIAL_SYNC` | Mark existing projects as known on first run | `true` |
| `FILTER_ENABLED` | Enable keyword filtering | `false` |
| `KEYWORDS` | Comma-separated keywords | — |
| `DATABASE_PATH` | SQLite database path | `./data/mostaql.db` (`/app/data/mostaql.db` in Compose) |

## Discord Commands

- `/status` — monitor status
- `/test` — send a test notification
- `/stats` — monitoring statistics

## First Run Behavior

On first startup with `INITIAL_SYNC=true`, all currently listed projects are saved to the database without sending notifications. Only projects that appear after that will trigger Discord alerts.

## Security

Never commit `.env` or the `data/` directory. If your bot token is exposed, regenerate it in the [Discord Developer Portal](https://discord.com/developers/applications).
