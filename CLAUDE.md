# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AgencyUplifted Backend — a Next.js (App Router) admin app for managing AgencyUplifted's seminar business (organizations, participants, seminar dates/bookings, trainers, venues), plus a public knowledge-base/blog ("Wissen") and outbound email funnels/campaigns. Database is Supabase/Postgres (Frankfurt, eu-central-1). Deployed on Vercel. Code comments and UI strings are in German; keep new comments/strings consistent with that.

Project status: Phase 1 (core schema: Organisationen, Teilnehmer, Seminartypen, Veranstaltungsorte, Trainer, Seminartermine, Preisstaffeln, Buchungen, Buchungspositionen) is built. Phase 2 (payments) is not yet started.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — run production build
- `npx tsc --noEmit` — type-check (there is no separate `lint` or `test` script/framework configured in this repo)

Setup: copy `.env.example` to `.env.local` and fill in real values (Supabase project URL + service role key from the Supabase dashboard, plus Resend/WebinarGeek/session/cron secrets as needed).

## Architecture

**Route groups.** `app/(backstage)/*` is the authenticated admin area (uses `app/(backstage)/layout.tsx`, which renders the `Sidebar` and requires a session). `app/(public)/*` is the public, unauthenticated "Wissen" knowledge-base/blog (its own layout, its own fonts/CSS, mirrors the marketing site's header/footer). Both are plain Next.js route groups sharing the same root `app/layout.tsx`.

**Auth & session.** Custom cookie-based session, not a third-party auth provider. `lib/session.ts` implements HMAC signing/verification using the Web Crypto API (Edge-compatible, no `next/headers` import — required so it also works inside `middleware.ts`). `lib/auth.ts` wraps that with `next/headers` cookie access for use in Server Components/Actions (`getAktuellerBenutzer()`); do not import `lib/auth.ts` from the middleware. Login sets the `au_session` cookie (`SESSION_COOKIE_NAME`) via `signSession()` in `lib/actions.ts`.

**Route protection (`middleware.ts`).** Everything requires a valid session cookie *except*: `/api/cron/*`, `/api/public/*`, `/api/webhooks/*`, `/api/shopify/*`, `/wissen*`, `/sitemap.xml`, `/robots.txt`, and `/login`. New public-facing API routes belong under `app/api/public/`. The middleware also applies `X-Robots-Tag: noindex, nofollow` on any host not listed in `PUBLIC_HOST` (so the Vercel/Backstage domain never gets indexed, even for the public Wissen pages), and resolves legacy-URL redirects (table `insights_redirects`) on `PUBLIC_HOST` requests.

**Data access.** `lib/supabase.ts`'s `getSupabaseAdmin()` returns a Supabase client using the **service role key** — server-only, must never reach the client bundle. There is no client-side Supabase usage; all reads/writes go through Server Components, Server Actions, or API routes.

**Mutations are centralized in `lib/actions.ts`.** This is a single large (~2800 line) `"use server"` file containing essentially all create/update/delete Server Actions used by the backstage UI (organizations, participants, bookings, seminar dates, campaigns, birthdays, insights, etc.), following the pattern: pull fields from `FormData`, write via `getSupabaseAdmin()`, `revalidatePath(...)`, then `redirect(...)`. When adding a new mutation used by a form/page, add it here rather than starting a new actions file, unless it's naturally scoped to one of the topic-specific `lib/*.ts` modules below.

**Topic-specific `lib/` modules** hold domain logic that's reused across actions/routes/pages rather than one-off form handling:
- `lib/funnel.ts` — trigger-based lifecycle email funnels (`buchung_erstellt`, `vor_seminarstart`, `nach_seminarende`, `lead_erstellt`, `warteliste_eingetragen`), placeholder rendering (`{{vorname}}` etc. via `renderPlatzhalter`), and the due-mail check invoked by the cron route.
- `lib/kampagnen.ts` — one-off email campaigns to filtered participant segments (live-evaluated filters, not stored snapshots).
- `lib/insights.ts` — the Wissen CMS: typed content blocks (`Block` union: `absatz`, `ueberschrift`, `liste`, `zitat`, `bild`, `faq`), slug generation.
- `lib/themen-radar.ts` / `lib/triage.ts` — content-topic radar/triage tooling feeding `content-creation` pages.
- `lib/geburtstage.ts` — birthday email feature.
- `lib/organisationsverknuepfung.ts` — auto-linking participants to organizations.
- `lib/geschlecht.ts` — heuristic salutation (`Herr`/`Frau`) guessing from first name; explicit user input always wins (`anrede_quelle: "manuell"` vs. `"automatisch"`).
- `lib/format.ts` — shared formatting helpers (currency incl. `MWST_SATZ` = 19% VAT — all stored prices are net/`netto`, this is where brutto is derived; German dates/date-ranges; `MONATSNAMEN`/`monatsName()` for German month names — reuse these instead of redefining month-name arrays).
- `lib/webinargeek.ts` — server-only client for the WebinarGeek REST API v2 (registrations + broadcast/title/schedule lookups); API key never reaches the client.
- `lib/shopify.ts` — direct Shopify Admin GraphQL access (OAuth token stored in Supabase table `shopify_verbindung` after the one-time connect flow in `app/api/shopify/callback`, since Shopify no longer issues static app tokens post-2026-01-01).
- `lib/email.ts` — Resend client/sender address (`agencyuplifted.de` verified domain).

**API routes (`app/api/`)** follow one of these patterns:
- `public/*` — CORS-enabled (`Access-Control-Allow-Origin: *`), no auth, meant to be called from the separate Onepage marketing/landing-page site. Existing ones return/accept JSON for seminar dates, bookings, webinar registration/info.
- `cron/*` — protected by comparing the `Authorization: Bearer <token>` header against `CRON_SECRET`, invoked by the schedule in `vercel.json`.
- `webhooks/*` — inbound webhooks (e.g. Resend delivery/open/click tracking).
- `shopify/*` — OAuth install/callback for the Shopify Admin API connection.

**SEO/public-site infra**: `app/robots.txt/route.ts`, `app/sitemap.xml/route.ts` (built from published `insights_eintraege`), and `app/llms.txt/route.ts` (an [llms.txt](https://llmstxt.org/) for AI crawlers) are all gated to `PUBLIC_HOST` only, matching the middleware's indexing policy.

## Conventions worth following

- German naming for domain concepts, tables, and comments throughout (`teilnehmer`, `buchungen`, `seminartermine`, etc.) — match this rather than introducing English domain terms.
- Comments explain *why*, often referencing a specific past bug/decision (e.g. why a layout was split, why a field falls back a certain way) — follow that style rather than describing *what* the code does.
- All prices in the DB are net (`netto`); use `lib/format.ts`'s `MWST_SATZ`/`formatEURBrutto` when displaying gross prices, don't hardcode 19%/1.19 elsewhere.
- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `WEBINARGEEK_API_KEY`, `CRON_SECRET`, `SESSION_SECRET`) are read via `process.env` inside small `getXxx()`/`getApiKey()` helpers that throw a descriptive German error if unset — follow this pattern for new integrations rather than reading `process.env` ad hoc at call sites.

## Betriebs-Notizen (wichtig, nicht aus dem Code ersichtlich)

- Deploy: Push auf `main` → Vercel deployt automatisch (kein manueller Deploy-Schritt).
- Vercel-Projekt: prj_hpcInyOVpB7ftCFV5R8nuIlzyw92, Team team_5tzNyimWTHu8DkmGONYdMM8R (Slug ag3ncy-uplift3d).
- Git-Commit-Identität muss sein: `agencyuplifted <markus@agencyuplifted.de>` (nicht die Mac-Standard-Identität).
- `.env.local` ist gitignored und lokal per `npx vercel env pull .env.local --environment=production` befüllt.
- ACHTUNG: Env-Variablen vom Typ "Secret" (z.B. WEBINARGEEK_API_KEY, Supabase-Keys, Resend-Key) kommen bei `vercel env pull` nur als Platzhalter "[SENSITIVE]" zurück. Den echten Wert bei Bedarf aus dem jeweiligen Ursprungs-Dashboard holen (z.B. WebinarGeek-Konto), nicht aus Vercel.
- GitHub-Push läuft über `gh` CLI (Browser-Login, schon eingerichtet) — kein Personal Access Token nötig.
- Vor jedem Commit an neuen API-Routen: ein echter Testaufruf gegen die externe API (z.B. curl) zur Feldnamen-Verifikation, danach `tsc --noEmit`.
