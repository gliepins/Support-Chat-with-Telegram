# Support Chat with Telegram - Development Guide

This guide explains local setup without Docker and project conventions.

## Prerequisites
- Node.js 18+
- PostgreSQL 14+

## Database
Create role and database (already executed on this host):
```sql
CREATE ROLE support_chat LOGIN PASSWORD 'UoaCmebMnMqAtNtWghSBcVN2DpT0yyf0H9H';
CREATE DATABASE support_chat OWNER support_chat;
```

Set DATABASE_URL in `.env`:
```
DATABASE_URL=postgresql://support_chat:UoaCmebMnMqAtNtWghSBcVN2DpT0yyf0H9H@localhost:5432/support_chat?schema=public
```

Apply schema:
```bash
npx prisma generate
npx prisma db push
```

## Running
```bash
npm run dev
```

## Scripts
- `dev`: ts-node + nodemon
- `build`: tsc to dist
- `start`: node dist/index.js

## Security
- Keep secrets in /etc/autoroad/support-chat.env in production
- Use reverse-proxy IP allowlist for Telegram webhook

