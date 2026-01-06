# STRICT Standups

A Vercel-hosted, table-based daily standup system that enforces written updates.

## Architecture (high level)
- **Frontend**: Vue 3 (Composition API) + Vue Router + Tailwind CSS
- **Backend**: Vercel Serverless Functions under `api/`
- **Storage**: Vercel Blob (JSON documents)
- **Auth**: Email magic link

### Storage layout (Blob keys)
All blobs are stored under a versioned prefix:
- `standup/v1/users/{userId}.json`
- `standup/v1/email/{email}.json` (email -> userId mapping)
- `standup/v1/teams/{teamId}.json`
- `standup/v1/standups/{teamId}/{YYYY-MM-DD}.json`

### Concurrency & versioning
- Standups are stored as a single **daily doc per team**.
- Updates use **optimistic concurrency** via `If-Match` (ETag) on `PUT /api/standup/update`.
- If the ETag is stale, the API returns `409 Conflict` and the UI prompts reload.

## Environment variables
Copy `.env.example` into Vercel project env vars.

Required:
- `AUTH_SECRET`
- `BLOB_READ_WRITE_TOKEN`

Bootstrap (creates initial team + manager on first API call):
- `BOOTSTRAP_MANAGER_EMAIL`
- `BOOTSTRAP_MANAGER_NAME`
- `BOOTSTRAP_TEAM_NAME`
- `DEFAULT_STANDUP_CUTOFF`

Email (Resend) optional:
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `DEV_EMAIL_MODE=log` prints magic links in function logs.

## Local development

### Frontend-only mode (zero setup)
The Vite dev server includes a tiny **mock /api** implementation so you can work on UI without running serverless functions.

```zsh
npm install
npm run dev
```

### Full-stack mode (real Vercel Functions)
Terminal A (backend):
```zsh
npm i -g vercel
vercel dev --listen 3000
```

Terminal B (frontend, enable proxy):
```zsh
VITE_USE_PROXY=1 VITE_API_TARGET=http://127.0.0.1:3000 npm run dev
```

## Deploy to Vercel
1. Push this repo to GitHub.
2. Import into Vercel.
3. Add env vars from `.env.example`.
4. Deploy.

## Tailwind design system
- Dark, enterprise palette: `slate` as base, `white/5..15` surfaces, subtle borders.
- Layout is card-based: `rounded-2xl`, `shadow-sm`, thin borders for hierarchy.
- Buttons are high-contrast, minimal, and consistent.
- Status is communicated with the required emoji labels: 🟢 / 🟠 / 🔴.
