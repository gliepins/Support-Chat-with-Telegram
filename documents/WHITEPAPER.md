# Support Chat with Telegram — Technical Whitepaper

This whitepaper documents the design, security posture, operational model, and roadmap for a standalone, API-only customer support chat service that uses Telegram Topics as the agent console and a lightweight web widget for customers.

## 1. Objectives and Non‑Goals

- **Objectives**
  - Provide a self‑hosted, subscription‑free support chat.
  - Use Telegram Supergroup Topics as the agent UI (mobile‑first, always-on).
  - Expose only a small HTTP/WS API surface for any website/app to plug in.
  - Keep operational footprint minimal, with strong security and abuse controls.
- **Non‑Goals**
  - Not an all‑channel helpdesk (no email/WhatsApp/etc. initially).
  - No attachments for MVP (simplifies security and rate limits). Can be added later.
  - No complex admin web UI in v1 (Telegram + simple API suffice).

## 2. High‑Level Architecture

- **Customer Widget (any frontend)**
  - Anonymous chat widget establishes a conversation via REST and upgrades to WS.
  - Optional nickname; messages are plain text.
- **API Service (this repo)**
  - Node.js + TypeScript + Express for REST; ws for WebSocket; Prisma for DB access.
  - Telegram Bot webhook endpoint to bridge between Telegram and web.
  - Scheduler for reminders and auto‑closure.
- **Telegram Agent Console**
  - One Supergroup with Topics enabled; each conversation maps to a Topic.
  - Agents interact via native Telegram apps (mobile/desktop).
- **Database** (primary: PostgreSQL; pluggable to other SQL engines via Prisma)
  - Tables: conversations, messages, audit_logs.

## 3. Data Model (Prisma)

- **Conversation**
  - id (cuid), codename (e.g., "Blue Lion #84C2"), customerName?, aboutNote?
  - threadId (Telegram message_thread_id), status (OPEN_UNCLAIMED, OPEN_ASSIGNED, AWAITING_CUSTOMER, CLOSED, BLOCKED)
  - assignedAgentTgId?, timestamps, lastCustomerAt, lastAgentAt
- **Message**
  - id, conversationId, direction (INBOUND/OUTBOUND), text, timestamps
- **AuditLog**
  - id, conversationId, actor (telegram:<id> or system), action, meta (JSON), createdAt

The schema is tuned for Postgres; Prisma allows swapping `provider` to mysql/sqlserver/sqlite with minimal type adjustments later.

## 4. Conversation Lifecycle and Timers

- Creation: on first customer message → create Topic, status=open_unclaimed.
- Reminders if unclaimed:
  - T+5m: post Unclaimed reminder (with Claim button) in Topic
  - T+15m: reminder + pin
  - T+60m: stop reminding
- Auto‑close:
  - No agent reply for 24h → auto‑close, inform customer ("Reply here to reopen").
  - After agent reply: if customer silent 24h → auto‑close; any new message reopens.
- Reopen: customer message on closed thread → reopen + edit topic title (latest nickname + codename).
- States tracked: OPEN_UNCLAIMED, OPEN_ASSIGNED, AWAITING_CUSTOMER, CLOSED, BLOCKED.

## 5. Nickname and Agent‑Only Notes

- **Customer nickname**
  - PATCH /v1/conversations/:id/name (JWT for that conversation). Validated 2–32 chars, no links.
  - Persist as `customerName`; update Topic title via `editForumTopic` to `"<name> — <codename>"`.
  - Rate‑limit changes (e.g., 3/day per conversation).
- **Agent note (private)**
  - In Topic, `/note <text>` or "Note" inline button → sets `aboutNote` (never exposed to customer).
  - Optionally add a "📝" suffix to the topic title to indicate presence of a note.
  - All note changes are audit‑logged (who, when, new value length).

## 6. Security Model

- **Customer identity**
  - Anonymous by default; optional nickname; device continuity via localStorage.
  - Customer access token: short‑lived JWT bound to conversation_id + IP hash + exp. Used for REST/WS.
- **Service authorization**
  - Internal/admin endpoints protected by `X-Internal-Auth: SERVICE_TOKEN` stored outside repo.
- **Telegram webhook hardening**
  - Webhook path includes a secret segment; also verify `X-Telegram-Bot-Api-Secret-Token` when configured.
  - Reverse proxy IP allowlist for Telegram’s IP ranges (optional but recommended).
- **Input controls**
  - Strip HTML; allow basic Markdown optionally; hard limit message length.
  - Rate limit per IP and per conversation (token buckets); exponential backoff on abuse.
  - Blocklist switch sets status=BLOCKED, closes Topic, and ignores further input.
- **Secrets location**
  - `/etc/autoroad/support-chat.env` in production; not committed to repo.
- **Transport**
  - HTTPS via existing Nginx/TLS; WebSocket upgrade permitted on the same prefix.

## 7. API Surface (v1)

- **Public (customer)**
  - POST `/v1/conversations/start` → { conversation_id, token, codename }
  - WS `/v1/ws?token=...` — bi‑directional text messages
  - PATCH `/v1/conversations/:id/name` — set nickname (rate‑limited)
- **Internal/admin (SERVICE_TOKEN)**
  - GET `/v1/conversations?status=open|closed` — list
  - GET `/v1/conversations/:id` — detail with messages
  - POST `/v1/moderation/close` — close
  - POST `/v1/moderation/block` — block
- **Telegram webhook**
  - POST `/v1/telegram/webhook/<secret>` — receives Updates; only handles messages in SUPPORT_GROUP_ID; routes by `message_thread_id`.

OpenAPI 3.1 spec will live in `docs/openapi.yaml` (roadmap).

## 8. Telegram Integration Details

- Group: create a Supergroup, enable Topics; invite bot as admin with minimal rights.
- Topic creation: `createForumTopic` with codename; store returned `message_thread_id`.
- Posting: bridge uses `sendMessage(chat_id, text, { message_thread_id })`.
- Editing title: `editForumTopic` when nickname or badges change.
- Closing: `closeForumTopic` when conversation closes.
- Commands/buttons: `/note`, Claim/Close/Rename via inline keyboards + `answerCallbackQuery`.

## 9. Nginx and Systemd Integration (example)

- systemd service (`/etc/systemd/system/support-chat.service`)
  - `WorkingDirectory=/root/support_telegram`
  - `EnvironmentFile=/etc/autoroad/support-chat.env`
  - `ExecStart=/usr/bin/node -r ts-node/register src/index.ts`
- Nginx location under existing TLS vhost (example `autoroad.lv`):
  - `location /support-chat/ { proxy_pass http://127.0.0.1:4010/; ... }`
  - `location = /support-chat/health { proxy_pass http://127.0.0.1:4010/health; }`
  - Ensure this location isn’t blocked by IP ACLs if public access is required.

## 10. Environment Variables

```
PORT=4010
DATABASE_URL=postgresql://support_chat:<password>@localhost:5432/support_chat?schema=public
SERVICE_TOKEN=<hex>
BOT_TOKEN=<telegram-bot-token>
SUPPORT_GROUP_ID=<telegram-supergroup-id>
PUBLIC_ORIGIN=https://your.domain
WEBHOOK_SECRET=<random>
```

## 11. Abuse & Incident Playbook

- Spammer floods: rate‑limit triggers; auto‑block conversation; audit entry created.
- Rogue agent: limits via Telegram group membership; audit notes on claim/close.
- Webhook storms: 429 backoff to Telegram; queue with retry (future enhancement).
- DB outage: respond 503 to web; buffer last N messages in memory (small) (future).

## 12. Observability & Backups

- Logs: pino + journald; tag request ids; redact tokens.
- Metrics: add /metrics (Prometheus) later; for now, use journal scans.
- Backups: rely on host DB backups (e.g., `autoroad-db-backup.timer`). Include support_chat DB in retention policy.

## 13. Development & Local Run

- See `documents/DEVELOPMENT.md` for Node/Prisma setup.
- No Docker required for local; PostgreSQL recommended.

## 14. Roadmap

- **Short term (MVP)**
  - Implement REST/WS + Telegram bridge; nickname + note; reminders + auto‑close; rate limits; OpenAPI spec.
- **Medium term**
  - Attachments (optional), canned replies, basic analytics, export transcripts (CSV/JSON).
  - MySQL/SQLite CI builds via Prisma matrix; adapter abstraction if needed.
- **Long term**
  - Lightweight admin UI, RBAC, multi‑channel adapters; multi‑tenant.

## 15. Security Summary

- No secrets in repo; runtime env at `/etc/autoroad`.
- SERVICE_TOKEN for internal endpoints; JWT per conversation for customers.
- Webhook secret + optional IP allowlist; strict input validation; short TTLs.
- Minimal PII; optional purge policy for closed conversations (e.g., 90 days).

## 16. Integration Checklist

- Create Telegram bot and Supergroup with Topics; record `BOT_TOKEN`, `SUPPORT_GROUP_ID`.
- Configure systemd and Nginx; validate `/support-chat/health` over HTTPS.
- Provision DB and set `DATABASE_URL`.
- Test flows:
  - Start conversation, topic creation, bi‑directional messaging.
  - Nickname rename → Topic title changes.
  - `/note` sets private note; audit entry created.
  - Reminder and auto‑close comply with timings.
  - Rate limits and blocklist work.

---
Last updated: 2025-09-18
