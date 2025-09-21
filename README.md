# Support Chat with Telegram

Lightweight, self‑hosted customer support chat. Customers chat via a small web widget; agents reply from a Telegram Supergroup with Topics.

## Highlights

- Telegram Topics as the agent console (mobile/desktop)
- Minimal HTTP/WS API, no vendor lock‑in
- Centralized system messages with Admin control (text, delivery, rate)
- Secure: JWT per conversation, service token for admin, hardened Telegram webhook
- Operationally small: Node.js + Express + Prisma + Postgres

## Architecture (at a glance)

- Widget (browser): loads from `https://support.example.com/widget.js`, connects via WS, renders messages and configurable system banners.
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

Env loading order:
- `/etc/autoroad/support-chat.env` (production, preferred)
- `.env` (repo root, for local/dev)

## Configuration (env)

```
PORT=4010
DATABASE_URL=postgresql://user:pass@localhost:5432/support_chat?schema=public
SERVICE_TOKEN=<random-hex>
BOT_TOKEN=<telegram-bot-token>
SUPPORT_GROUP_ID=<telegram-supergroup-id>
PUBLIC_ORIGIN=https://support.example.com
WEBHOOK_SECRET=<random>
TELEGRAM_HEADER_SECRET=<optional-telegram-webhook-header>
UNBIND_JWT_FROM_IP=true            # if true, conversation JWTs are not IP-bound (recommended)
START_IP_POINTS=20                 # IP rate limit points for /v1/conversations/start
START_IP_DURATION_SEC=60           # duration window (seconds) for the above
```

See `documents/WHITEPAPER.md` for deployment (systemd, Nginx) and security notes.

## Widget integration

Add the script to your site and initialize (replace the domain with your deployment origin):

```html
<script src="https://support.example.com/widget.js?v=YYYYMMDD-HHMM-<sha>"></script>
<script>
  window.SupportChat && SupportChat.init({
    origin: 'https://support.example.com',
    position: 'right',          // or 'left'
    // Locale (i18n): either force a default or omit to auto-detect (i18next → html lang → navigator)
    // locale: 'lv',
    // or auto: locale: (localStorage.getItem('i18nextLng') || document.documentElement.lang || navigator.language || 'en'),
    stringsByLocale: {
      en: { chatButton: 'Message us', title: 'Support', supportLabel: 'Support', joinedSuffix: ' joined' },
      lv: { chatButton: 'Rakstiet mums', title: 'Palīdzība', saveLabel: 'Saglabāt', cancelLabel: 'Atcelt', editNamePlaceholder: 'Jūsu vārds' }
    },
    showSoundToggle: true,      // header bell icon
    showVibrationToggle: true,  // header vibration icon
    soundVolume: 0.6,           // 0..1 (initial volume)
    soundGain: 1.5,             // loudness multiplier (0.1..5)
    soundDefaultOn: true,       // seed sound ON if user has no prior preference
    vibrationDefaultOn: true,   // seed vibration ON if no prior preference
    openOnLoad: false           // open panel on load (default: closed button)
  });
</script>
```

Cache‑busting: bump `?v=` on every widget update. The server serves a minified build and sets long immutable cache for versioned URLs.

Build/minify the widget and print a versioned snippet:

```bash
npm run build           # builds TypeScript + widget.min.js
npm run release:widget  # prints a versioned <script> snippet (timestamp + git sha)
```

### Sound and vibration settings (simple)

- `soundVolume` controls the initial notification volume (range 0..1). Example: `soundVolume: 0.8`.
- Customers can toggle sound/vibration via the header icons; preferences persist in localStorage.
  - Sound on/off key: `scw:notify:sound` ('1' or '0')
  - Vibration on/off key: `scw:notify:vibrate` ('1' or '0')
  - Volume key: `scw:notify:volume` (stringified number 0..1)

### Defaults and init overrides

- Default behavior (no options, first visit):
  - Panel: closed (button visible)
  - Sound: off
  - Vibration: off
- User preferences persist in localStorage across visits.
- You can override the initial experience for new users (without prior prefs) via init options:
  - `soundDefaultOn: true` — seed sound ON only if the user has no prior preference
  - `vibrationDefaultOn: true` — seed vibration ON only if no prior preference
  - `openOnLoad: true` — open the panel immediately on load
  - `soundVolume` — write an initial volume (0..1)
  - `soundGain` — amplify perceived loudness (0.1..5)

### Page gating (include/exclude paths)

You can load the widget site‑wide and decide which pages show it using `includePaths` and `excludePaths` in `SupportChat.init`.

- `includePaths`: array of strings with `*` wildcards or JavaScript `RegExp`. If provided, only matching paths will show the widget
- `excludePaths`: array of strings/`RegExp`. Matching paths will suppress the widget (takes precedence over include)

Example:

```html
<script src="https://support.example.com/widget.js?v=YYYYMMDD-HHMM-<sha>" defer></script>
<script>
  window.SupportChat && SupportChat.init({
    origin: 'https://support.example.com',
    position: 'right',
    includePaths: ['/', '/contact*', '/cars/*'],
    excludePaths: ['/admin*', '/checkout*']
  });
  // For SPAs: re-run init on full reloads or keep English defaults; hot-swapping can be added on request.
</script>
```

### Dynamic controls (SPA and programmatic)

For single‑page apps (SPA) or when you need to toggle the widget at runtime:

- `observeRoute: true` — the widget listens for history changes (pushState/replaceState/popstate/hashchange) and re‑evaluates `includePaths`/`excludePaths` without a full reload
- `SupportChat.recheck()` — manually re‑run the path gating
- `SupportChat.show()` / `SupportChat.hide()` — programmatically toggle visibility
- `SupportChat.setLocale('lv')` — switch UI language at runtime and PATCH conversation locale (server uses it for system messages)
  - Note: the “joined” bubble is rendered client‑side from `supportLabel + joinedSuffix` and uses the widget’s current locale at the time of the event.

Example (site‑wide load, SPA friendly):

```html
<script src="https://support.example.com/widget.js?v=YYYYMMDD-HHMM-<sha>" defer></script>
<script>
  window.SupportChat && SupportChat.init({
    origin: 'https://support.example.com',
    position: 'right',
    includePaths: ['/', '/contact*', '/cars/*'],
    excludePaths: ['/admin*', '/checkout*'],
    observeRoute: true
  });
  // Optional controls you can call from your app code:
  // SupportChat.hide();
  // SupportChat.show();
  // SupportChat.recheck();
  // If your app changes language at runtime, re‑init or add a future updateStrings() call.
  // (By default, English strings are used unless you pass strings in init.)
  
</script>
```

### Quick deploy checklist (widget)

1) Build and generate a cache-busted snippet: `npm run build && npm run release:widget`
2) Update your frontend Contact page to use the new `<script src="...widget.js?v=...">` snippet
3) Optionally set `soundVolume` in `SupportChat.init({...})` (e.g., `0.8`)
4) Redeploy your frontend. The widget will auto-connect to the API at `origin`
5) For i18n: either pass `locale` explicitly or ensure your site sets i18nextLng or `<html lang>`

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

Localization model:
- Conversation stores `locale` (2‑letter). The server renders system messages using fallback: exact → 2‑letter → `default` → legacy.
- Admin can edit per‑locale templates in “System messages”.
- Closing messages are unified under key `closing_message` per locale (Persist ON, Telegram OFF recommended). Agent‑specific closing overrides are deprecated and UI removed.

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
