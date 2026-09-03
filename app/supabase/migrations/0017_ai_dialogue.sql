-- Wardrobe — AI dialogue pane on Sanctuary entries.
-- Run this once in Supabase SQL Editor (after 0001 … 0016).
-- Idempotent: safe to re-run.
--
-- One column: the HTML of the entry's AI-dialogue pane, where the user
-- pastes AI analysis and threads their own follow-up questions. Polarity
-- there is inverted from the journal body: pane text is AI unless marked
-- with <span class="sa-my-text">; body text is the user's unless marked
-- with <span class="sa-ai-text">. The Data room's Writing tab attributes
-- words accordingly (yours vs an "AI words" line — excluded from your
-- counts but kept on the ledger).
--
-- NOT NULL with a '' default: every existing row (and Timeline rows,
-- which share this table) is valid with no backfill.

alter table entries
  add column if not exists ai_dialogue text not null default '';
