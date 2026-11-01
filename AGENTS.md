# AGENTS.md

Unified personal portfolio repository (`fiqtor.com` / Cloudflare Pages).

Frontend and Backend are unified in this single repo:
- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4 in `src/`, static assets in `public/`.
- **Backend / API:** Cloudflare Pages Functions powered by Hono in `functions/api/[[route]].ts`.
  Routes are mounted at `/api/*` on the same domain (e.g. `https://fiqtor.pages.dev/api/...` or `https://fiqtor.com/api/...`).
  No subdomains, no CORS friction.

---

## ⚡ ARCHITECTURE & DEPLOYMENT

- **Cloudflare Pages project name:** `fiqtor-com`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Pages Functions:** Automatically picked up from `functions/` by Cloudflare Pages.
- **Environment variables** (set in Cloudflare Dashboard > Settings > Environment Variables):
  - `GEMINI_API_KEY`: Google Gemini API key for AI assistant (`/api/v1/ai/generate`).
  - `AI_MODEL_PRIMARY`: Primary Gemini model (default `gemini-2.5-flash-lite`).
  - `GITHUB_TOKEN`: GitHub personal access token for `/api/v1/github/contributions`.
  - `GITHUB_USERNAME`: GitHub username (default `FIQTOR`).
  - `WAKATIME_APP_SECRET`: WakaTime API key for `/api/v1/wakatime`.
  - `COINGECKO_API_KEY`: Optional demo/pro key for `/api/v1/crypto`.

---

## ⛔ EXECUTION & TOKEN SAFETY (STRICT)

1. **No Auto Build/Lint:** NEVER run `npm run build`, `npx tsc`, or `eslint` unless explicitly instructed.
2. **Strict Exclusions:** NEVER read/scan `node_modules`, `dist`, `build`, `.git`, `.next`, `coverage`, lock files (`*.lock`, `*-lock.yaml`), `.env*`, `.log`, or binary/media assets.
3. **Headroom & Targeted Tooling:**
   - Active context max 2-3 files. Drop unneeded files.
   - Use `grep` / `glob` for searching; do NOT read whole directories.
   - Use `offset`/`limit` in `read` tool for files > 100 lines.
   - Prefer surgical `edit` tool calls over overwriting whole files (`write`).
   - Batch independent tool calls in a single response.
4. **Code Quality & Zero Noise:**
   - Strict TS typings. No `any` unless required.
   - Zero residual code: strip unused imports, dead vars, commented code, temporary `console.log`.
   - Mimic existing code conventions and folder patterns.

---

## ⚡ FRONTEND

- **Tech:** React 19 SPA, Vite, TypeScript (strict), Tailwind v4, `react-router-dom`.
- **API Base:** Relative `/api` by default (`src/config/Api.ts`).
- **Contact:** Form validates and formats brief, then opens direct WhatsApp chat (`wa.me`). Direct DM pattern replaces email SMTP.
