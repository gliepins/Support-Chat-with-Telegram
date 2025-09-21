# Support Chat with Telegram — Technical Assessment

Date: 2025-09-21
Reviewer: (your name)

## 1) Scope and intended use

- Single-tenant focus: serves one website/app with one cohesive support team.
- Telegram: one Supergroup with Topics; all agents in that group can see all conversations.
- For multi-brand/multi-tenant: run multiple isolated instances (separate DB, `BOT_TOKEN`, `SUPPORT_GROUP_ID`, `SERVICE_TOKEN`).

## 2) Fit and strengths

- Minimal ops: Node + Express + Prisma + Postgres; simple to deploy.
- Telegram Topics as agent UI: removes need for a custom agent console; mobile/desktop native UX.
- Clean APIs: concise REST + WS; OpenAPI available; simple widget embed + cache-busting.
- System messages: centrally managed templates with delivery flags (WS/Persist/Telegram/Pin) and per-conversation rate limits.
- Security posture: service token for admin, short-lived JWT per conversation, hardened Telegram webhook path + optional header secret.
- Operational touches: `/health`, `/metrics`, deep health check, retention job, pretty logging.

## 3) Caveats and risks

- Single group tenancy: no per-topic isolation or RBAC inside Telegram; all agents see all topics.
- Text-only messages: no attachments; would require careful design (upload, scanning, size limits).
- JWT bound to IP: can disrupt users on mobile networks/VPN changes; consider optional IP binding.
- In-memory WS hub: no cross-instance broadcasting; horizontal scale would need a broker (e.g., Redis pub/sub).
- Rate limiting: strong on conversation start; WS inbound lacks explicit per-connection rate limits.
- Error handling: many best-effort try/catch blocks can hide transient systemic issues; consider selective surfacing/metrics.
- Admin UI minimal: basic static UI; no pagination/filters beyond search; no RBAC.
- Privacy/compliance: retention exists; ensure DSAR (export/delete) process is clear; verify frontend HTML escaping.

## 4) Security review (quick)

- Webhook: secret path + optional `X-Telegram-Bot-Api-Secret-Token`; recommend enforcing header in production and proxy IP allowlist.
- Tokens: `CONVERSATION_JWT_SECRET` recommended; fallback to `SERVICE_TOKEN` is logged—document rotation procedures.
- CORS: public endpoints are simple; widget delivery sets `Access-Control-Allow-Origin: *` appropriately; verify no sensitive data exposed.
- Input validation: message length checks exist; recommend HTML/Markdown sanitization at render time (widget/admin).
- Rate limits: keep `/start` IP bucket; add WS message rate limiting and backpressure (per token/IP).

## 5) Observability & operations

- Metrics: add counters/gauges for WS connections, WS inbound/outbound, Telegram API errors, webhook auth failures, rate-limit hits, auto-close counts.
- Structured logging: include request ids/correlation ids; emit error-level logs for repeated Telegram API failures.
- Readiness/liveness: `/health` exists; consider `/ready` that checks DB and webhook configuration.

## 6) Integration experience

- Clear quick start: install, `prisma db push`, run.
- Config variables are straightforward; suggest providing a `.env.example` and a sample `setWebhook` curl.
- Widget embed is clear; versioning and caching explained.

## 7) Suggestions (actionable)

1. Provide `.env.example` with all required/optional variables.
2. Document Telegram webhook setup with a ready-to-run `setWebhook` example (with secret token header).
3. Add per-connection WS message rate limiting and max burst (e.g., token bucket) with 429/close semantics.
4. Introduce Redis pub/sub (optional) to support multi-instance WS broadcasting.
5. Confirm and document frontend escaping of all user-generated content; consider server-side normalization.
6. Admin API/UI: add pagination and filters; minimal RBAC (read-only vs moderator) if needed.
7. Expand `/metrics` with message and error counters; surface Telegram API error rates.
8. Productionize scheduler timings (24h defaults) and make them configurable via env.
9. Attachments (next milestone): define size limits, content scanning, and storage strategy (S3/minio) with signed URLs.
10. Provide Postman/Insomnia collection and example client generation via OpenAPI generator.

## 8) Open questions for maintainers

1. Should JWTs be optionally unbound from IP to improve reliability on mobile networks?
2. What is the target plan and timeline for attachments (images/files)?
3. Multi-tenant future: is per-tenant isolation a goal, or will multiple instances remain the recommended approach?
4. How should Telegram API retries/backoff be handled (e.g., transient 429/5xx)? Centralized retry policy?
5. DSAR/GDPR: is there a documented process for export/delete beyond existing admin endpoints? Any PII in messages to be minimized?
6. Topic lifecycle: on conversation deletion, should the corresponding topic be archived or deleted by policy?

## 9) Adoption checklist (single-tenant)

- [ ] Provision Postgres and set `DATABASE_URL`.
- [ ] Create Telegram bot and Supergroup with Topics; record `BOT_TOKEN`, `SUPPORT_GROUP_ID`.
- [ ] Set `WEBHOOK_SECRET` and optional `TELEGRAM_HEADER_SECRET`; configure Telegram webhook.
- [ ] Set `SERVICE_TOKEN` and `CONVERSATION_JWT_SECRET`.
- [ ] `npm install` → `npx prisma db push` → run the service.
- [ ] Upsert agents (display names) via admin API.
- [ ] Configure system messages (`welcome_message`, reminders, closed note) as needed.
- [ ] Embed widget and verify start/WS/bridge flows; confirm claim/close works.
- [ ] Validate retention and export; test deletion policies as required.

## 10) Multi-tenant strategy (if needed)

- Run multiple isolated deployments (infra-as-code friendly): per-tenant DB, `BOT_TOKEN`, `SUPPORT_GROUP_ID`, `SERVICE_TOKEN`, domain.
- Optionally add a tenant id to DB and routing if future consolidation is desired, but Telegram visibility still mandates separate groups for isolation.

## 11) SaaS readiness plan (technical)

- Multi-tenancy model
  - Phase 1: Managed single-tenant per customer (one instance per site). Lowest complexity; automate provisioning.
  - Phase 2: Logical multi-tenant (add `Tenant` model + `tenantId` FKs). Each tenant maps to its own Telegram Supergroup and bot token.
  - Enforcement: plan-based limits (conversations/day, retention, attachments, sites per tenant).

- Data model changes (Phase 2)
  - Add `Tenant` (id, name, status, plan, limits, secrets bundle ref).
  - Add `tenantId` to `Conversation`, `Message`, `AuditLog`, `Agent`, `Setting`, `MessageTemplate`.
  - Composite uniques per tenant (e.g., `Agent(tgId, tenantId)`), scoped queries by tenant.

- Secrets and config per tenant
  - Store `BOT_TOKEN`, `SUPPORT_GROUP_ID`, `CONVERSATION_JWT_SECRET`, `SERVICE_TOKEN` per tenant.
  - Encrypt at rest (KMS/HashiCorp Vault) or envelope encryption; cache with TTL; hot reload.

- Webhook routing
  - Path: `/v1/telegram/webhook/{tenantSecret}/{hook}` or header `X-Tenant-Key`.
  - Resolve tenant → verify Telegram header → route by `message_thread_id`.

- Authentication & authorization
  - JWT claims: include `tenantId` and `conversationId`; sign with per-tenant secret.
  - Admin APIs require `SERVICE_TOKEN` per tenant (later: OAuth/SSO for owner/agent roles).

- Rate limits and quotas
  - Buckets per tenant and per conversation for REST and WS.
  - Plan-enforced quotas: message volume, concurrent WS, attachment size/count, retention days.

- Realtime scalability
  - Replace in-memory WS hub with Redis pub/sub for fanout across instances.
  - Optionally queue Telegram sends (BullMQ) with retry/backoff and DLQ.

- Attachments (optional, Pro tier)
  - S3/MinIO with presigned PUT/GET; enforce size/type; virus scan (ClamAV/Lambda) before making visible.
  - Store metadata in DB with `tenantId` and `conversationId`.

- Observability
  - Metrics labeled by `tenantId` (WS connections, inbound/outbound, Telegram errors, rate-limit hits, queue depth).
  - Structured logs with `tenantId`, request id; error budgets and alerts.

- Security & compliance
  - Enforce Telegram header secret; recommend proxy IP allowlist.
  - Key rotation flows for per-tenant secrets.
  - Retention policy per plan; DSAR export/delete endpoints; audit exports.

- Admin/tenant portal
  - Onboarding wizard: bot creation instructions, group verification, setWebhook automation, widget snippet.
  - Plan selection, billing (Stripe), limits visualization, secrets rotation, agent directory, templates editor.

- Widget enhancements for SaaS
  - `SupportChat.init({ origin, position, strings, theme })` with i18n strings and tokenized theme.
  - CSP-friendly option (nonce) for injected styles.

## 12) Phased rollout and immediate next steps

- Phase 0 — Hardening (1–2 weeks)
  - Enforce Telegram header secret; add `.env.example` and `setWebhook` script.
  - Add WS per-connection rate limiting; expand `/metrics`; adjust scheduler to 24h defaults with env overrides.
  - Basic incident metrics: Telegram API error rate, webhook failures, WS drops.

- Phase 1 — Hosted single-tenant (2–4 weeks)
  - Provisioning scripts (Fly/Render/Docker) that template env per customer.
  - Customer dashboard (minimal): site setup steps, health checks, widget snippet, agents/templates editor.
  - Stripe billing integration; per-instance secrets management; backups and uptime monitoring.

- Phase 2 — Logical multi-tenant (4–8 weeks)
  - Add `Tenant` model and `tenantId` FKs; per-tenant JWT; webhook routing.
  - Redis pub/sub for WS; worker for Telegram with retry.
  - Plan enforcement (quotas), per-tenant metrics/logs; optional attachments.

- Immediate actionable checklist
  - [ ] Add `.env.example` and `scripts/setWebhook.ts` (with header secret).
  - [ ] Implement WS throttling (token bucket per connection) and close on abuse.
  - [ ] Add Redis adapter behind WS hub (feature-flagged; no-op if not configured).
  - [ ] Expand metrics: counters for messages, WS, Telegram errors; expose `/ready`.
  - [ ] Parameterize widget strings; add `strings` option and doc.
  - [ ] Create minimal SaaS admin (Next.js/Express) or extend `/admin` to manage agents/templates/billing.

---
Notes:
- This document is an external assessment; original project documents remain unmodified.

