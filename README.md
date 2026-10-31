<p align="center">
  <img src="./docs/assets/wisemoney-logo.svg" alt="WiseMoney" width="260" />
</p>

<p align="center">
  Personal finance that stays on your phone, with help you can use without sharing your data.
</p>

<p align="center">
  <strong><a href="https://wisemoney.y7labs.studio/">Open WiseMoney</a></strong>
  · PWA on Vercel
  · Managed AI service not deployed yet
</p>

# WiseMoney

WiseMoney is a mobile-first personal finance PWA for people who count in cash, mobile money and
small bank accounts. Your data starts on the device, is kept in an encrypted local event log, and
stays usable offline without any WiseMoney server. French and English.

Live at [wisemoney.y7labs.studio](https://wisemoney.y7labs.studio/). Current version: see
[CHANGELOG.md](./CHANGELOG.md) and the in-app What's new page.

## What You Can Do

- **Track:** accounts, balances, transactions, transfers, budgets, savings goals, planned
  expenses, recurring items, debts and receivables, with reminders computed on the phone.
- **Capture fast:** one line ("taxi 2000", "Awa m'a remboursé 12 500") typed or dictated fills the
  amount, direction and note; several purchases in one line are saved one after the other.
- **Learn:** WiseLearn answers money questions from 77 sourced lessons; WiseHelp explains the app.
  Both work for everyone and never receive your financial data.
- **Back up:** encrypted export and import, and closing a period into an archive.
- **Optional AI guidance:** insights, recommendations, forecasts and pattern detection. These need
  your own provider key today; the built-in version waits on the managed service.

## How Intelligence Works

Four layers with different availability: capture (on the phone), guidance (needs a key today),
learning (server, no vault data) and reminders (on the phone). The full map, with what runs where
and what each layer can see, is [docs/INTELLIGENCE.md](./docs/INTELLIGENCE.md).

## Data And Privacy

- Financial data lives in encrypted IndexedDB; the key exists only in memory, so the passphrase (or
  device unlock) is needed each time the app is reopened.
- Bring-your-own-key AI calls the provider directly from the browser, and keys stay encrypted on the
  device. The managed path would send redacted aggregates only.
- The quick line and voice are understood on the device; the browser's cloud speech service is not
  used.

## Project Structure

```text
WiseMoney/
├── apps/web/             # React + TypeScript PWA
│   └── api/              # Vercel functions: WiseLearn, WiseHelp, reminder push
├── services/edge/        # Managed Go service (local only, not deployed)
├── tools/                # Lesson build, category dataset tools, push helper
├── scripts/              # Release consistency check
├── docs/                 # Product, architecture, security, decisions, runbooks
└── docker-compose.yml    # Local Postgres and managed-service stack
```

## Run Locally

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck && pnpm lint && pnpm test
pnpm release:check
```

Browser smoke tests live in `apps/web/scripts/` (`test:pwa`, `test:webauthn`) and run against
`pnpm --filter @wisemoney/web preview` on port 4173.

## Managed Service For Local Development

Only needed when working on the managed AI path.

```bash
cp .env.example .env
docker compose up -d postgres
migrate -path services/edge/migrations -database "$DATABASE_URL" up
docker compose build edge
docker compose up -d edge
```

The service runs at `http://localhost:8080`.

## Documentation

- [Documentation index](./docs/README.md)
- [How intelligence works](./docs/INTELLIGENCE.md)
- [WiseHelp knowledge architecture](./docs/WISEBOT_KNOWLEDGE_ARCHITECTURE.md)
- [Security policy](./SECURITY.md)
