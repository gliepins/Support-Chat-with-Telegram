# Support Chat with Telegram

Lightweight, self‑hosted customer support chat. Customers chat via a small web widget; agents reply from a Telegram Supergroup with Topics.

## Highlights

- Telegram Topics as the agent console (mobile/desktop)
- Minimal HTTP/WS API, no vendor lock‑in
- Centralized system messages with Admin control (text, delivery, rate)
- Secure: JWT per conversation, service token for admin, hardened Telegram webhook
- Operationally small: Node.js + Express + Prisma + Postgres

## Architecture (at a glance)

- Widget (browser): loads from `https://cms.autoroad.lv/widget.js`, connects via WS, renders messages and configurable system banners.
- API service (this repo): REST + WS, Telegram webhook, scheduler.
- Telegram: one Supergroup with Topics; each conversation maps to one Topic.
- Database: Postgres via Prisma (`Conversation`, `Message`, `AuditLog`, `Agent`, `MessageTemplate`).

## Quick start (local)

Prereqs: Node 18+, Postgres, `DATABASE_URL` in `.env` (or export env vars).

```bash
# Install deps
npm install

# Push schema (no shadow DB needed)
npx prisma db push

# Run dev (ts-node)
npm run dev

# Or build & run
npm run build
npm start
```

The service listens on `PORT` (default 4010). Health: `GET /health`.

## Configuration (env)

```
PORT=4010
DATABASE_URL=postgresql://user:pass@localhost:5432/support_chat?schema=public
SERVICE_TOKEN=<random-hex>
BOT_TOKEN=<telegram-bot-token>
SUPPORT_GROUP_ID=<telegram-supergroup-id>
PUBLIC_ORIGIN=https://cms.autoroad.lv
WEBHOOK_SECRET=<random>
TELEGRAM_HEADER_SECRET=<optional-telegram-webhook-header>
```

See `documents/WHITEPAPER.md` for deployment (systemd, Nginx) and security notes.

## Widget integration

Add the script to your site and initialize:

```html
<script src="https://cms.autoroad.lv/widget.js?v=YYYYMMDD-HHMM-<sha>"></script>
<script>
  window.SupportChat && SupportChat.init({
    origin: 'https://cms.autoroad.lv',
    position: 'right',          // or 'left'
    showSoundToggle: true,      // header bell icon
    showVibrationToggle: true,  // header vibration icon
    soundVolume: 0.6            // 0..1
  });
</script>
```

Cache‑busting: bump `?v=` on every widget update. The server serves a minified build and sets long immutable cache for versioned URLs.

Build/minify the widget and print a versioned snippet:

```bash
npm run build           # builds TypeScript + widget.min.js
npm run release:widget  # prints a versioned <script> snippet (timestamp + git sha)
```

## API overview

- Customer (public)
  - `POST /v1/conversations/start` → `{ conversation_id, token, codename }`
  - `PATCH /v1/conversations/:id/name` (Authorization: Bearer <token>)
  - `GET /v1/conversations/:id/messages` → `{ status, messages[], closed_note? }`
  - `WS /v1/ws?token=...` — real‑time chat

- Admin (header `x-internal-auth: SERVICE_TOKEN`)
  - Conversations list/search/export; close/block
  - Agents directory + per‑agent closing message
  - System messages: `GET/POST /v1/admin/message-templates` (text + WS/Persist/Telegram/Pin + rate)
  - Settings: `GET/POST /v1/admin/settings` (e.g., `welcome_message`)

OpenAPI: `src/docs/openapi.yaml`.

## System messages (Admin‑configurable)

All non‑chat “system” texts (welcome, waiting, reopen, unclaimed reminders, closed history note, etc.) are defined in `MessageTemplate` and emitted via `emitServiceMessage()`.

Per template flags:
- WS banner (transient)
- Persist (OUTBOUND bubble, stored in history)
- Telegram (post to Topic, optional Pin)
- Rate(s) per conversation (seconds)

Edit under `/admin` → “System messages” (inline switches + Save). Changes apply immediately.

## Telegram integration

- Topics are created automatically per conversation
- Closing is mirrored to Telegram; posts are sent with `disable_notification=true` (silent)
- Webhook protected by secret path and optional header secret

## Security

- No secrets in repo; use environment files (e.g., `/etc/autoroad/support-chat.env`)
- JWT bound to conversation + IP hash for customers
- Admin endpoints require a service token header
- Input length limits, HTML stripping, rate limiting

## Development tips

```bash
# Generate Prisma client
npx prisma generate

# Update DB schema without migrations
npx prisma db push
```

## API clients (optional)

Generate from OpenAPI (`src/docs/openapi.yaml`).

TypeScript (fetch):

```bash
npx @openapitools/openapi-generator-cli@latest generate \
  -i src/docs/openapi.yaml \
  -g typescript-fetch \
  -o clients/ts \
  --additional-properties=supportsES6=true,typescriptThreePlus=true
```

Python:

```bash
npx @openapitools/openapi-generator-cli@latest generate \
  -i src/docs/openapi.yaml \
  -g python \
  -o clients/python
```

## License

MIT (see `LICENSE` if present). If not included, treat as MIT for evaluation purposes.

## Acknowledgements

- Telegram Bot API
- Prisma, Express, ws, esbuild
