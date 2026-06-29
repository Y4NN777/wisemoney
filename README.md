<p align="center">
  <img src="./apps/web/public/logo.svg" alt="WiseMoney" width="260" />
</p>

<p align="center">
  Personal finance that stays local first, with AI only when you choose it.
</p>

<p align="center">
  <strong><a href="https://wisemoney.y7labs.studio/">Open WiseMoney</a></strong>
  · PWA on Vercel
  · Managed service not deployed yet
</p>

# WiseMoney

WiseMoney is a mobile-first personal finance PWA built around local ownership of
financial data. Your day-to-day money data starts on the device, is stored in an
encrypted local event log, and stays usable without a WiseMoney server.

The hosted app is live at
[wisemoney.y7labs.studio](https://wisemoney.y7labs.studio/). Managed AI features
that depend on the WiseMoney server are still local/dev only; bring-your-own-key
AI mode can run without that server.

## What You Can Track

- Accounts, balances, transactions, budgets, savings goals, and recurring money
  movements.
- Debts and receivables with motive, amount, date, status, and reminders for
  receivables that are not settled.
- Optional AI guidance for insights, recommendations, forecasts, pattern
  detection, and financial literacy.
- PWA installation and service-worker update prompts for the hosted web app.

## Data And AI Posture

- Financial data is stored locally in encrypted IndexedDB.
- AI is optional and separated from the core finance tracker.
- BYO-key mode sends requests directly from the browser to the selected provider.
- Managed AI mode is present for local development, but the WiseMoney server is
  not deployed yet.

## Project Structure

```text
WiseMoney/
├── apps/
│   └── web/              # React + TypeScript PWA
├── services/
│   └── edge/             # Local managed Go service
├── docs/                 # Product, architecture, security, and runbooks
├── docker-compose.yml    # Local Postgres + managed-service stack
└── pnpm-workspace.yaml
```

## Run Locally

```bash
pnpm install
pnpm dev
```

The web app runs at `http://localhost:5173`.

## Managed Service For Local Development

Only needed when developing the managed AI path.

```bash
cp .env.example .env
docker compose up -d postgres
migrate -path services/edge/migrations -database "$DATABASE_URL" up
docker compose build edge
docker compose up -d edge
```

The local managed service runs at `http://localhost:8080`.
