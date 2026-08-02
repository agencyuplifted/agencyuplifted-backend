# AgencyUplifted Backend

Schlanke Seminarverwaltung für AgencyUplifted – Next.js Admin-App auf Vercel, Datenbank in Supabase (Frankfurt/eu-central-1).

## Stack
- Next.js (App Router)
- Supabase (Postgres)
- Deployment: Vercel

## Setup
1. `.env.example` nach `.env.local` kopieren und mit echten Werten füllen (Supabase Project URL + Service Role Key aus dem Supabase-Dashboard, Settings → API)
2. `npm install`
3. `npm run dev`

## Status
Phase 1 (Kern-Schema): Organisationen, Teilnehmer, Seminartypen, Veranstaltungsorte, Trainer, Seminartermine, Preisstaffeln, Buchungen, Buchungspositionen — angelegt in Supabase.
Noch offen: Admin-UI, Funnel/Kommunikation, Lead-Liste, Legacy-Import, Zahlungsanbindung (Phase 2).
