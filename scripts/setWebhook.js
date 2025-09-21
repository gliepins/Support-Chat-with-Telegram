const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Prefer system env file if present, else fallback to .env
const SYSTEM_ENV = '/etc/autoroad/support-chat.env';
if (fs.existsSync(SYSTEM_ENV)) {
  dotenv.config({ path: SYSTEM_ENV });
} else {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
}

async function main() {
  const token = process.env.BOT_TOKEN;
  const base = process.env.PUBLIC_ORIGIN;
  const secret = process.env.WEBHOOK_SECRET;
  const headerSecret = process.env.TELEGRAM_HEADER_SECRET;

  if (!token) throw new Error('BOT_TOKEN is required');
  if (!base) throw new Error('PUBLIC_ORIGIN is required');
  if (!secret) throw new Error('WEBHOOK_SECRET is required');

  const url = `${base}/v1/telegram/webhook/${secret}`;
  const body = { url };
  if (headerSecret && headerSecret.trim().length > 0) {
    body.secret_token = headerSecret.trim();
  }

  const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json();
  console.log(JSON.stringify(json, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
async function main() {
    const token = process.env.BOT_TOKEN;
    const base = process.env.PUBLIC_ORIGIN;
    const secret = process.env.WEBHOOK_SECRET;
    const headerSecret = process.env.TELEGRAM_HEADER_SECRET;
    if (!token)
        throw new Error('BOT_TOKEN is required');
    if (!base)
        throw new Error('PUBLIC_ORIGIN is required');
    if (!secret)
        throw new Error('WEBHOOK_SECRET is required');
    const url = `${base}/v1/telegram/webhook/${secret}`;
    const body = { url };
    if (headerSecret && headerSecret.trim().length > 0) {
        body.secret_token = headerSecret.trim();
    }
    const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await resp.json();
    console.log(JSON.stringify(json, null, 2));
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=setWebhook.js.map