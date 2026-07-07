# Wardrobe

A personal mind-palace web app for contemplative practice — Scripture reading, prayer, life timeline, and study. The umbrella name is *Wardrobe* (after Narnia's): the entrance looks ordinary, the inside is a whole world.

## Build status

- **Build 1** — Foundation: Vite + React + TypeScript scaffold, Supabase auth + schema, Hallway with 4 spheres + animations + threshold transition, placeholder Sanctuary and Timeline pages, scripture proxy stub for Vercel.
- **Build 2** — Timeline (year tabs, sheet, side editor, ✦ Sanctuary link, xlsx/csv/txt import + xlsx export), Sanctuary (binder, rich editor, inspector, scripture pane with translation switching, mode toggle, selection highlight), full ESV proxy, day-shared link between rooms.
- **Notes expansion (2026-07)** — the Notes room grown into a full Milanote-style board system across 19 sprints (one commit each on `main`): 11 card types, marquee multi-select, a per-board undo/redo command layer, a Milanote skin toggle, image/file cards on Supabase Storage, rich link previews, columns, arrows, paste/drop intelligence, a TipTap editor, a registry-driven shortcut map + help overlay, an Unsorted inbox tray, global search, a board-tree sidebar, Trash v2 with board-subtree restore and typed permanent delete, and PNG/PDF/Markdown export.
- **Desktop app (2026-07)** — a local-data build of the whole app: `npm run dev:desktop` / `build:desktop` swap `lib/supabase.ts` for `lib/supabase.local.ts` via a Vite alias (the cloud build is untouched and contains no local-mode code). The local client runs the real migrations 0001–0014 against an embedded PGlite Postgres (data in IndexedDB, media bytes included), auto-signs-in a single local user, and implements the exact supabase-js query surface the app uses (integration-tested in `test/localClient.test.ts`). `app/src-tauri/` wraps it in a Tauri v2 shell; `.github/workflows/desktop-release.yml` builds Windows/macOS installers on a `desktop-v*` tag and publishes them to GitHub Releases.
- **Build 3** *(planned)* — Tweaks panel (themes, creaminess/lightness sliders, custom colors), search across years, photos per day if asked.
- **Verify** *(planned)* — End-to-end smoke pass across all seams.

## Running locally

```powershell
cd E:\git\life-dashboard\app
npm install
npm run dev
```

Open http://localhost:5180.

You'll be redirected to `/login` — enter your email, click the link in the email, and you're in.

## One-time Supabase setup

1. Open the Supabase SQL Editor at https://supabase.com/dashboard/project/_/sql
2. Run **every file in `supabase/migrations/` in numeric order** (`0001` → `0014`). They're all idempotent — safe to re-run. The app fails loudly (a red status bar in the Notes room) if it detects a missing migration, but save yourself the trip:

   | Migration | Adds |
   |---|---|
   | `0001_init.sql` | `entries`, `user_prefs`, RLS, the `updated_at` trigger |
   | `0002_build2.sql` | `timeline_with_sanctuary` join view |
   | `0003_relax_timeline_unique.sql` | Multiple Timeline events per date |
   | `0004_notes.sql` | Notes room: `notes_boards`, `notes_cards`, `notes_trash` |
   | `0005_data.sql` | Data room: the five reading-tracker tables |
   | `0006_treasury.sql` | Treasury room |
   | `0007_daybook.sql` | Daybook room |
   | `0008_practice.sql` | Sanctuary practice tracking |
   | `0009_notes_image_cards.sql` | Image cards + the private `notes-media` Storage bucket & policies |
   | `0010_notes_file_cards.sql` | File-attachment cards |
   | `0011_notes_columns.sql` | Column containers on the Notes canvas |
   | `0012_notes_arrows.sql` | `notes_arrows` table (card connectors) |
   | `0013_notes_swatch_comment.sql` | Color swatch + comment cards |
   | `0014_notes_starred.sql` | Starred boards |

3. Confirm under Authentication → Providers that **Email** is enabled (it is, by default — magic links are on by default).

## Environment variables

Local: `app/.env.local` (gitignored).
Production: set in Vercel → Project → Settings → Environment Variables.

| Variable | Where read | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Client | Project URL — exposed to browser, fine. |
| `VITE_SUPABASE_ANON_KEY` | Client | Publishable key — exposed to browser, fine (RLS protects rows). |
| `ESV_API_TOKEN` | Server (Vercel function) only | NEVER expose to client. The `/api/scripture` proxy reads it and forwards passage requests. |

## Deployment (later)

```powershell
npm install -g vercel
vercel login
cd E:\git\life-dashboard\app
vercel
```

Set the three env vars in Vercel's dashboard before the first deploy. After that, every push to `main` redeploys automatically (once you connect a Git repo).

## Project layout

```
app/
  src/
    components/   small visual primitives
    hooks/        useAuth and friends
    lib/          supabase client, design tokens, env access, and the
                  pure logic modules (notes*, data aggregation, recurrence,
                  imports) — unit-tested, no React/Supabase imports where
                  possible
    pages/        Hallway, Login, Sanctuary, Timeline, Notes, Data,
                  Treasury, Daybook
    App.tsx       routes + protected wrapper
    main.tsx      entry point
  api/
    scripture.ts  Vercel edge function — ESV proxy
    link-meta.ts  Vercel edge function — auth-gated link-preview fetcher
  supabase/
    migrations/   SQL files; run ALL of them via Supabase SQL Editor
  test/           Vitest suites for the pure lib modules
  .env.local      local secrets (gitignored)
  .env.example    template
```

## Design

The visual language comes from the design handoff at `../Life Board/design_handoff_life_board/`. Tokens live in `src/lib/tokens.css`. Don't change them ad-hoc — adjust there if the whole palette needs to shift.

## Why "Wardrobe"

> *"This must be a simply enormous wardrobe!"*

The Lion, the Witch, and the Wardrobe. The whole point is that the entrance looks like a piece of furniture and the inside is a country.
