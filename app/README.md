# Wardrobe

A personal mind-palace web app for contemplative practice — Scripture reading, prayer, life timeline, and study. The umbrella name is *Wardrobe* (after Narnia's): the entrance looks ordinary, the inside is a whole world.

## Build status

- **Build 1** — Foundation: Vite + React + TypeScript scaffold, Supabase auth + schema, Hallway with 4 spheres + animations + threshold transition, placeholder Sanctuary and Timeline pages, scripture proxy stub for Vercel.
- **Build 2** *(this commit)* — Timeline (year tabs, sheet, side editor, ✦ Sanctuary link, xlsx/csv/txt import + xlsx export), Sanctuary (binder, rich editor, inspector, scripture pane with translation switching, mode toggle, selection highlight), full ESV proxy, day-shared link between rooms.
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
2. Run `supabase/migrations/0001_init.sql`. Creates `entries`, `user_prefs`, RLS policies, and the `updated_at` trigger.
3. Run `supabase/migrations/0002_build2.sql`. Adds the one-per-day Timeline index and the `timeline_with_sanctuary` join view.
4. Confirm under Authentication → Providers that **Email** is enabled (it is, by default — magic links are on by default).

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
    components/   small visual primitives (Build 2 fills this in)
    hooks/        useAuth and friends
    lib/          supabase client, design tokens, env access
    pages/        Hallway, Login, Sanctuary, Timeline
    App.tsx       routes + protected wrapper
    main.tsx      entry point
  api/
    scripture.ts  Vercel edge function — ESV proxy (stub in Build 1)
  supabase/
    migrations/   SQL files; run via Supabase SQL Editor
  .env.local      local secrets (gitignored)
  .env.example    template
```

## Design

The visual language comes from the design handoff at `../Life Board/design_handoff_life_board/`. Tokens live in `src/lib/tokens.css`. Don't change them ad-hoc — adjust there if the whole palette needs to shift.

## Why "Wardrobe"

> *"This must be a simply enormous wardrobe!"*

The Lion, the Witch, and the Wardrobe. The whole point is that the entrance looks like a piece of furniture and the inside is a country.
