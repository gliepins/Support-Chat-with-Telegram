# Support Chat with Telegram — Technical Whitepaper

This whitepaper documents the design, security posture, operational model, and roadmap for a standalone, API-only customer support chat service that uses Telegram Topics as the agent console and a lightweight web widget for customers. The first production deployment is for the "autoroad" website.

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
  - Embeddable script served at `/widget.js` (deployed at `https://cms.autoroad.lv/widget.js`).
  - Recent features: theming from site CSS vars, left/right positioning, unread badge, timestamps, auto‑reconnect and history restore, reconnect/offline banner, draft persistence, multiline input with auto‑wrap (Enter=send; Shift+Enter=newline), persistent panel state, agent labels ("[name] said:"), joined bubble, closed status note, local echo + de‑dup, cookie fallback for session, automatic session refresh after repeated WS failures.
- **API Service (this repo)**
  - Node.js + TypeScript + Express for REST; ws for WebSocket; Prisma for DB access.
  - Telegram Bot webhook endpoint to bridge between Telegram and web.
  - Scheduler for reminders and auto‑closure.
- **Telegram Agent Console**
  - One Supergroup with Topics enabled; each conversation maps to a Topic.
  - Agents interact via native Telegram apps (mobile/desktop).
- **Database** (primary: PostgreSQL; pluggable to other SQL engines via Prisma)
  - Tables: conversations, messages, audit_logs, agents.
  - Settings: simple key/value (e.g., `welcome_message`).

## 3. Data Model (Prisma)

- **Conversation**
  - id (cuid), codename (e.g., "Blue Lion #84C2"), customerName?, aboutNote?
  - threadId (Telegram message_thread_id), status (OPEN_UNCLAIMED, OPEN_ASSIGNED, AWAITING_CUSTOMER, CLOSED, BLOCKED)
  - assignedAgentTgId?, timestamps, lastCustomerAt, lastAgentAt
- **Message**
  - id, conversationId, direction (INBOUND/OUTBOUND), text, timestamps
- **AuditLog**
  - id, conversationId, actor (telegram:<id> or system), action, meta (JSON), createdAt

- **Agent**
  - tgId (Telegram user id, bigint), displayName, isActive, timestamps

- **MessageTemplate** (system messages configuration)
  - key (id), enabled, text
  - toCustomerWs (WS banner), toCustomerPersist (persisted OUTBOUND bubble), toTelegram, pinInTopic, rateLimitPerConvSec?, locale, timestamps

The schema is tuned for Postgres; Prisma allows swapping `provider` to mysql/sqlserver/sqlite with minimal type adjustments later.

## 4. Conversation Lifecycle and Timers

- Creation: on first customer message → create Topic, status=open_unclaimed.
- Reminders if unclaimed:
  - T+5m: post Unclaimed reminder (with Claim action) in Topic
  - T+15m: post reminder and pin the message for visibility
  - T+60m: stop reminding (configurable; currently using T+5/T+15 in production)
- Auto‑close (configurable):
  - Default design: 24h thresholds as below. For the autoroad pilot, a 5‑minute window is used to expedite testing.
  - No agent reply for N hours → auto‑close, inform customer ("Reply here to reopen").
  - After agent reply: if customer silent N hours → auto‑close; any new message reopens.
- Reopen: customer message on closed thread → reopen + edit topic title (latest nickname + codename).
- States tracked: OPEN_UNCLAIMED, OPEN_ASSIGNED, AWAITING_CUSTOMER, CLOSED, BLOCKED.
  - Waiting note while unclaimed: after any customer message while the conversation is unclaimed, emit `waiting_for_agent` via the centralized system messaging service according to the template flags (WS banner and/or persisted OUTBOUND). Rate‑limited per template.
  - Reopen UX: if a customer writes into a closed chat, immediately reopen to OPEN_UNCLAIMED and send “Welcome back — we have reopened your chat and an agent will join shortly.”
  - Close UX: on close (via `/close` or inline Close), persist the agent’s configured closing message first to the customer transcript and broadcast a `conversation_closed` event to update the widget instantly; then post the same message into the Telegram topic and close it.

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
  - Webhook path includes a secret segment; verify `X-Telegram-Bot-Api-Secret-Token` (enforced in production).
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
  - GET `/v1/conversations/:id/messages` — fetch messages and status for widget history restore
- **Internal/admin (SERVICE_TOKEN)**
  - GET `/v1/conversations?status=open|closed|blocked|all&q=<term>` — list (search by codename/name)
  - GET `/v1/conversations/:id` — detail with messages
  - POST `/v1/moderation/close` — close
  - POST `/v1/moderation/block` — block
  - GET `/v1/conversations/:id/export.json` — export transcript as JSON
  - GET `/v1/conversations/:id/export.csv` — export transcript as CSV
  - GET `/v1/admin/agents` — list agents
  - POST `/v1/admin/agents/upsert` — create/update agent display name by Telegram user id
  - POST `/v1/admin/agents/disable` — disable agent
  - POST `/v1/admin/agents/enable` — enable agent
  - POST `/v1/admin/agents/closing-message` — set agent closing message
  - GET `/v1/admin/message-templates` — list system message templates
  - POST `/v1/admin/message-templates/upsert` — upsert a template (text + delivery flags + rate)
  - POST `/v1/admin/conversations/bulk-delete` — delete by ids or by status filter
  - GET `/v1/admin/settings` / POST `/v1/admin/settings` — e.g., `welcome_message`
- **Telegram webhook**
  - POST `/v1/telegram/webhook/<secret>` — receives Updates; only handles messages in SUPPORT_GROUP_ID; routes by `message_thread_id`.
  - Inline buttons in Topics provide Claim/Close actions; `/note` supported for private notes.
  - Commands for agents: `/help`, `/claim`, `/close`, `/note`, `/myname`|`/whoami` (show assigned display name), `/myid`.
  - Requires claim before outbound messages are bridged to customer.

Notes:
- Public Messages endpoint `GET /v1/conversations/:id/messages` now also returns `closed_note` (string | undefined) for rendering a banner on history restore when status=CLOSED (driven by the `closed_history_note` template).

OpenAPI 3.1 spec will live in `docs/openapi.yaml` (roadmap).

## 8. Telegram Integration Details

- Group: create a Supergroup, enable Topics; invite bot as admin with minimal rights.
- Topic creation: `createForumTopic` with codename; store returned `message_thread_id`.
- Posting: bridge uses `sendMessage(chat_id, text, { message_thread_id })`.
- Editing title: `editForumTopic` when nickname or badges change.
- Closing: `closeForumTopic` when conversation closes.
- Commands/buttons: `/help`, `/note`, Claim/Close via inline keyboards + `answerCallbackQuery`. (Rename via API.)
  - Agent identity: Admin sets display names tied to Telegram ids; widget shows "[agent] said:" and “joined” bubbles.
  - Topic lifecycle: topics are created on conversation start; on admin bulk delete by ids, corresponding topics are deleted.
  - Notifications: all Telegram posts are sent with `disable_notification=true` (silent); audible notifications are only on the customer widget side per widget settings.

## 9. Nginx and Systemd Integration (example)

- systemd service (`/etc/systemd/system/support-chat.service`)
  - `WorkingDirectory=/root/support_telegram`
  - `EnvironmentFile=/etc/autoroad/support-chat.env`
  - `ExecStart=/usr/bin/node -r ts-node/register src/index.ts`
- Nginx subdomain vhost (`cms.autoroad.lv`) proxies all paths to the service; widget script is served from this domain to simplify CSP and CORS.

## 10. Environment Variables

```
PORT=4010
DATABASE_URL=postgresql://support_chat:<password>@localhost:5432/support_chat?schema=public
SERVICE_TOKEN=<hex>
BOT_TOKEN=<telegram-bot-token>
SUPPORT_GROUP_ID=<telegram-supergroup-id>
PUBLIC_ORIGIN=https://cms.autoroad.lv
WEBHOOK_SECRET=<random>
TELEGRAM_HEADER_SECRET=<optional>
```

## 11. Abuse & Incident Playbook

- Spammer floods: rate‑limit triggers; auto‑block conversation; audit entry created.
- Rogue agent: limits via Telegram group membership; audit notes on claim/close.
- Webhook storms: 429 backoff to Telegram; queue with retry (future enhancement).
- DB outage: respond 503 to web; buffer last N messages in memory (small) (future).

## 12. Observability & Backups

- Logs: pino + journald; tag request ids; redact tokens.
- Metrics: `/metrics` endpoint provides basic counters; extend as needed.
- Backups: rely on host DB backups (e.g., `autoroad-db-backup.timer`). Include support_chat DB in retention policy.

Additional runtime counters to consider: bridge failures, webhook auth failures, rate limit hits, auto‑close counts, topic create/edit errors.

## 13. Development & Local Run

- See `documents/DEVELOPMENT.md` for Node/Prisma setup.
- No Docker required for local; PostgreSQL recommended.

## 14. Roadmap

- **Completed (Pilot)**
  - REST/WS bridge; widget with reconnect/history; nickname; agent notes; reminders + 5m auto‑close; rate limits; admin UI with search/export and bulk delete; agents directory with display names; strict webhook header; claim‑before‑reply.
  - Centralized System Messages: Prisma `MessageTemplate`; `emitServiceMessage()` with delivery flags (WS banner, persist bubble, Telegram, optional pin) and per‑conversation rate limit.
  - Templates wired: `welcome_message`, `waiting_for_agent`, `conversation_reopened`, `unclaimed_reminder_5m`, `unclaimed_reminder_15m_pin`, `closed_history_note`.
  - Admin: new “System messages” table with inline edit of text and flags (WS/Persist/Telegram/Pin/Rate).
  - Widget: offline banner + retry; sound/vibration toggles with persistent prefs and configurable volume; info_note banner rendering; removed fake typing indicator; removed hardcoded “conversation closed” banner (only the persisted closing message remains); versioned/minified build and cache‑busting via `?v=`.
  - Server: always silent Telegram notifications; versioned widget serving (minified if present) with long cache and immutable caching when `?v=` is used.
- **Next (Short term)**
  - Admin: pagination, unread indicators, per‑conversation reopen/close metrics; stricter SERVICE_TOKEN rotation helper.
  - Widget: offline mode copy and CTA, theme polish, sound/vibration toggle, “typing…” indicator.
  - OpenAPI: publish `docs/openapi.yaml`; generate client stubs.
  - Observability: expand `/metrics`; structured audit export.
- **Medium term**
  - Attachments (images, small files) with scanning and size limits.
  - Canned replies and shortcuts in Telegram via command menu.
  - Admin auth (basic RBAC) for multi‑operator environments.
- **Long term**
  - Multi‑tenancy (per‑site isolation and branding); per‑tenant SERVICE_TOKEN/JWT signing keys.
  - Pluggable channels (email webhook, WhatsApp/Signal bridges).

## 15. Security Summary

- No secrets in repo; runtime env at `/etc/autoroad`.
- SERVICE_TOKEN for internal endpoints; JWT per conversation for customers.
- Webhook secret + optional IP allowlist; strict input validation; short TTLs.
- Minimal PII; optional purge policy for closed conversations (e.g., 90 days).
 - Minimal PII; optional purge policy for closed conversations (e.g., 90 days) via daily retention job.

## 16. Integration Checklist

- Create Telegram bot and Supergroup with Topics; record `BOT_TOKEN`, `SUPPORT_GROUP_ID`.
- Configure systemd and Nginx; validate `/support-chat/health` over HTTPS.
- Provision DB and set `DATABASE_URL`.
- Test flows:
  - Start conversation, topic creation, bi‑directional messaging.
  - Nickname rename → Topic title changes.
  - `/note` sets private note; audit entry created.
  - Inline Claim/Close buttons and `/claim` `/close` commands work.
  - Reminders (T+5/T+15 pin) and auto‑close (configurable; 5m in pilot) work.
  - System messages: `welcome_message`, `waiting_for_agent`, `conversation_reopened`, unclaimed reminders, and `closed_history_note` behave per Admin template flags (WS vs Persist vs Telegram) and respect Rate(s).
  - Rate limits and blocklist work.

## 17. Release & Versioning

- Widget build & cache busting
  - `npm run build` produces `dist/public/widget.min.js` (esbuild, minified)
  - `npm run release:widget` prints a snippet with `?v=<timestamp>-<git-sha>` for cache busting
  - Update the frontend `<script src="https://cms.autoroad.lv/widget.js?v=...">` and redeploy
  - Server serves minified when present and uses immutable caching for versioned URLs
- Service restarts
  - Server code/config changes require `sudo systemctl restart support-chat`
  - Admin/template changes are hot; DB schema changes require a migration push

---
Last updated: 2025-09-20

Today’s highlights:
- Admin: Agent column by display name; strong row selection styling; new “Messages and auto responses” card to set agent closing messages (edit, inline delete confirm, bulk delete with inline confirm); Admin Close now persists the closing message to the customer first, then closes the Telegram topic; conversations bulk delete now uses inline confirmation.
- Widget: immediate closed-state via live `conversation_closed` event; after first customer message when unclaimed, show “waiting for an agent”; on writing into a closed chat, show “reopened, agent will join shortly”.
- Bot/Service: `/help` implemented; inline Close action parity with `/close` (customer closing message persisted first); deep health check endpoint for start→topic→welcome→WS; settings upsert via Prisma; robustness fixes and better lifecycle logging.
