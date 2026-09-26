-- ═══════════════════════════════════════════════════════════════════════════
-- Shenava · schema
--
-- Paste this whole file into the Supabase SQL Editor and press Run. It is
-- idempotent: running it twice changes nothing the second time.
--
-- EVERY object here is prefixed `shenava_`. That is deliberate, and it is the
-- whole reason you can drop this into a Supabase project that already has
-- tables of its own: nothing in this file can collide with a table, function,
-- policy or type you already have. If you would rather keep Shenava in its
-- own schema, see the note at the bottom of this file.
--
-- WHAT IS STORED, AND WHAT IS NOT.
-- The audio is never stored. Not here, not in Supabase Storage, not anywhere.
-- The browser cuts the recording locally and uploads one piece at a time to a
-- function that transcribes that piece and forgets it. What is kept is the
-- TEXT — the transcript, the speaker-labelled dialogue, and the proposal
-- draft — because the text is the product: you come back to it days later,
-- edit it, and download it.
--
-- WHO CAN READ IT.
-- Row Level Security is ON for every table and there are NO policies. That is
-- not an oversight — it means the anon key (the one your browser holds) can
-- read nothing at all. Every read and write in this app goes through the
-- service role key, which lives only in the server's environment and never
-- reaches a browser. If you later add real accounts, add policies here; until
-- then this is the tighter setting, not the looser one.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create extension if not exists pgcrypto;

-- ── Settings ───────────────────────────────────────────────────────────────
-- One row, id = 1. The dashboard's Settings page reads and writes it.
--
-- Two seats spend money: the TRANSCRIBER turns each audio piece into words,
-- and the WRITER reads the whole transcript and writes the proposal draft.
-- They want different models — the transcriber wants a fast multimodal model,
-- the writer wants a model with judgement — so each has its own row of
-- numbers here rather than one shared setting.
create table if not exists public.shenava_settings (
  id                    smallint primary key default 1 check (id = 1),

  -- Who the proposal speaks as. The draft prompt is written against these,
  -- so filling them in is what makes the output sound like YOUR studio.
  studio_name           text    not null default 'Your Studio',
  studio_name_fa        text    not null default 'استودیوی شما',
  studio_voice          text    not null default '',   -- free text: tone, words to avoid

  -- The transcriber seat.
  stt_model             text    not null default 'google/gemini-3.5-flash',
  stt_fallback_model    text    not null default '',   -- used when the first engine refuses
  stt_max_output_tokens integer not null default 4000  check (stt_max_output_tokens between 256 and 64000),

  -- The writer seat.
  writer_model          text    not null default 'anthropic/claude-sonnet-5',
  writer_temperature    numeric(3,2) not null default 0.30 check (writer_temperature between 0 and 2),
  writer_max_output_tokens integer not null default 12000 check (writer_max_output_tokens between 1000 and 200000),

  -- Ceilings, in US dollars. A call that would take the day past its ceiling
  -- is refused before it is sent, which is the only kind of spending limit
  -- that actually works.
  daily_ceiling_usd     numeric(8,2) not null default 3.00  check (daily_ceiling_usd >= 0),
  monthly_ceiling_usd   numeric(8,2) not null default 30.00 check (monthly_ceiling_usd >= 0),

  -- How many days a meeting is kept before the clear-out removes it.
  -- Zero means keep forever.
  retention_days        integer not null default 0 check (retention_days >= 0),

  updated_at            timestamptz not null default now()
);

insert into public.shenava_settings (id) values (1) on conflict (id) do nothing;

-- ── Meetings ───────────────────────────────────────────────────────────────
create table if not exists public.shenava_meetings (
  id              uuid primary key default gen_random_uuid(),
  title           text not null default '' check (char_length(title) <= 160),
  client_name     text not null default '' check (char_length(client_name) <= 160),

  -- What language the speaker was asked for. 'auto' lets the engine decide.
  language        text not null default 'auto' check (language in ('farsi','english','auto')),

  -- The SHAPE of the recording, never the recording. The hash is how a
  -- resumed upload proves it is the same file before it carries on.
  audio_name      text not null default '' check (char_length(audio_name) <= 255),
  audio_bytes     bigint not null default 0 check (audio_bytes >= 0),
  audio_sha256    text not null default '' check (char_length(audio_sha256) <= 64),
  duration_ms     integer not null default 0 check (duration_ms >= 0),
  segment_count   smallint not null default 0 check (segment_count >= 0),

  status          text not null default 'planned'
                  check (status in ('planned','transcribing','transcribed','failed')),

  -- The whole transcript, assembled when the last piece lands, and yours to
  -- edit thereafter. Null until then.
  transcript      text,
  transcript_edited_at timestamptz,

  -- The two sides told apart: an array of turns, each { side, text }.
  -- Written by the speaker pass, correctable by hand on the page.
  dialogue        jsonb,
  dialogue_model  text,
  dialogue_at     timestamptz,

  -- The proposal draft, both editions, as the writer returned it and the app
  -- validated it. Null until you ask for it.
  notes           jsonb,
  notes_model     text,
  notes_at        timestamptz,
  notes_edited_at timestamptz,

  -- The draft always waits for a person. Every rewrite returns it to pending.
  draft_status    text not null default 'pending'
                  check (draft_status in ('pending','approved','rejected')),
  draft_decided_at timestamptz,

  -- Which template the draft was poured into, and the proposal it produced.
  template_id     uuid,
  proposal_id     uuid,

  -- What this meeting has cost so far, in US dollars, all seats together.
  cost_usd        numeric(10,6) not null default 0 check (cost_usd >= 0),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists shenava_meetings_created_idx
  on public.shenava_meetings (created_at desc);
create index if not exists shenava_meetings_status_idx
  on public.shenava_meetings (status);

-- ── Segments ───────────────────────────────────────────────────────────────
-- One row per piece of audio, written down THE MOMENT that piece comes back.
-- That is why this is a second table and not a column: a tab closed halfway
-- through an hour-long recording loses nothing, and reopening the meeting
-- carries on from the first piece that is still pending.
create table if not exists public.shenava_segments (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references public.shenava_meetings(id) on delete cascade,
  idx           smallint not null check (idx >= 0),
  start_ms      integer not null default 0 check (start_ms >= 0),
  end_ms        integer not null default 0 check (end_ms >= start_ms),
  status        text not null default 'pending' check (status in ('pending','done','error')),
  text          text,
  model         text,
  cost_usd      numeric(10,6) not null default 0 check (cost_usd >= 0),
  attempts      smallint not null default 0 check (attempts >= 0),
  -- Why a piece failed, in the app's own words: 'filtered:split',
  -- 'filtered:partial', 'short', 'timeout', or the provider's message.
  error         text,
  finished_at   timestamptz,
  unique (meeting_id, idx)
);

create index if not exists shenava_segments_meeting_idx
  on public.shenava_segments (meeting_id, idx);

-- ── Runs ───────────────────────────────────────────────────────────────────
-- The ledger: one row per model call, dated by the call. The spending
-- ceilings are read from HERE and not from the figure on the meeting row,
-- because a meeting drawn again next month must not count against last
-- month's ceiling.
create table if not exists public.shenava_runs (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid references public.shenava_meetings(id) on delete cascade,
  seat          text not null check (seat in ('transcriber','speakers','writer','section')),
  model         text not null default '',
  -- Which section, when the seat is 'section'.
  detail        text not null default '',
  tokens_in     integer not null default 0 check (tokens_in >= 0),
  tokens_out    integer not null default 0 check (tokens_out >= 0),
  cost_usd      numeric(10,6) not null default 0 check (cost_usd >= 0),
  ok            boolean not null default true,
  error         text,
  ms            integer not null default 0 check (ms >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists shenava_runs_created_idx
  on public.shenava_runs (created_at desc);
create index if not exists shenava_runs_meeting_idx
  on public.shenava_runs (meeting_id);

-- ── Proposal templates ─────────────────────────────────────────────────────
-- A template is the shape of the document a draft is poured into: which
-- sections, in which order, under which headings, in both languages. The
-- built-in one is seeded by 02_seed.sql; you can add your own from the
-- dashboard, and the meeting page suggests the one that fits the meeting.
create table if not exists public.shenava_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '' check (char_length(name) <= 120),
  name_fa       text not null default '' check (char_length(name_fa) <= 120),
  -- What kind of engagement this template is meant for. The meeting page
  -- suggests a template whose engagement matches the draft's.
  engagement    text not null default 'unknown'
                check (engagement in ('project','consulting','training','retainer','unknown')),
  -- [{ key, label_fa, label_en, kind: 'lines'|'text'|'phases', optional }]
  sections      jsonb not null default '[]'::jsonb,
  -- Lines the document always ends with — your terms, your bank details,
  -- your validity period. The writer is told about these so it never
  -- proposes them itself.
  house_lines   jsonb not null default '{"fa":[],"en":[]}'::jsonb,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ── Proposals ──────────────────────────────────────────────────────────────
-- What an approved draft becomes: a numbered document, in one language,
-- with the template's sections filled in. Editing it afterwards is the
-- proposal's business, not the meeting's.
create table if not exists public.shenava_proposals (
  id            uuid primary key default gen_random_uuid(),
  number        text not null default '' check (char_length(number) <= 40),
  meeting_id    uuid references public.shenava_meetings(id) on delete set null,
  template_id   uuid references public.shenava_templates(id) on delete set null,
  lang          text not null default 'fa' check (lang in ('fa','en')),
  client_name   text not null default '' check (char_length(client_name) <= 160),
  title         text not null default '' check (char_length(title) <= 200),
  body          jsonb not null default '{}'::jsonb,
  status        text not null default 'draft' check (status in ('draft','sent','accepted','declined')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists shenava_proposals_number_idx
  on public.shenava_proposals (number) where number <> '';

alter table public.shenava_meetings
  add constraint shenava_meetings_proposal_fk
  foreign key (proposal_id) references public.shenava_proposals(id) on delete set null
  not valid;

alter table public.shenava_meetings
  add constraint shenava_meetings_template_fk
  foreign key (template_id) references public.shenava_templates(id) on delete set null
  not valid;

-- ── What has been spent ────────────────────────────────────────────────────
-- Called before every model call. Returns today's and this month's spend and
-- whether the ceilings still allow one more, so a call that would go over is
-- refused before it is sent rather than accounted for after.
create or replace function public.shenava_spend_status()
returns table (
  spent_today   numeric,
  spent_month   numeric,
  daily_ceiling numeric,
  monthly_ceiling numeric,
  allowed       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select daily_ceiling_usd, monthly_ceiling_usd from public.shenava_settings where id = 1),
  d as (select coalesce(sum(cost_usd), 0) as v from public.shenava_runs
         where created_at >= date_trunc('day', now())),
  m as (select coalesce(sum(cost_usd), 0) as v from public.shenava_runs
         where created_at >= date_trunc('month', now()))
  select d.v, m.v, s.daily_ceiling_usd, s.monthly_ceiling_usd,
         (s.daily_ceiling_usd = 0 or d.v < s.daily_ceiling_usd)
     and (s.monthly_ceiling_usd = 0 or m.v < s.monthly_ceiling_usd)
  from s, d, m;
$$;

-- ── What it cost, by seat ──────────────────────────────────────────────────
-- What the dashboard's figures come from. Days back, grouped by seat.
create or replace function public.shenava_cost_by_seat(p_days integer default 30)
returns table (seat text, calls bigint, tokens_in bigint, tokens_out bigint, cost_usd numeric)
language sql
stable
security definer
set search_path = public
as $$
  select r.seat,
         count(*),
         coalesce(sum(r.tokens_in), 0),
         coalesce(sum(r.tokens_out), 0),
         coalesce(sum(r.cost_usd), 0)
  from public.shenava_runs r
  where r.created_at >= now() - make_interval(days => greatest(p_days, 1))
  group by r.seat
  order by 5 desc;
$$;

-- ── The clear-out ──────────────────────────────────────────────────────────
-- Removes meetings older than `retention_days`. Zero means keep forever, so
-- the default does nothing. Call it from a cron job if you want it automatic:
--   select cron.schedule('shenava-clearout', '0 3 * * *',
--                        $$select public.shenava_clear_out()$$);
create or replace function public.shenava_clear_out()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_days integer;
  removed   integer := 0;
begin
  select retention_days into keep_days from public.shenava_settings where id = 1;
  if keep_days is null or keep_days <= 0 then
    return 0;
  end if;
  with gone as (
    delete from public.shenava_meetings
    where created_at < now() - make_interval(days => keep_days)
    returning 1
  )
  select count(*) into removed from gone;
  return removed;
end;
$$;

-- ── Keeping updated_at honest ──────────────────────────────────────────────
create or replace function public.shenava_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists shenava_meetings_touch on public.shenava_meetings;
create trigger shenava_meetings_touch before update on public.shenava_meetings
  for each row execute function public.shenava_touch();

drop trigger if exists shenava_proposals_touch on public.shenava_proposals;
create trigger shenava_proposals_touch before update on public.shenava_proposals
  for each row execute function public.shenava_touch();

drop trigger if exists shenava_settings_touch on public.shenava_settings;
create trigger shenava_settings_touch before update on public.shenava_settings
  for each row execute function public.shenava_touch();

-- ── Row Level Security: on, with no policies ───────────────────────────────
-- Read the note at the top of this file. This locks the anon key out of
-- everything; the server's service role key is unaffected by RLS and is how
-- the app reads and writes.
alter table public.shenava_settings  enable row level security;
alter table public.shenava_meetings  enable row level security;
alter table public.shenava_segments  enable row level security;
alter table public.shenava_runs      enable row level security;
alter table public.shenava_templates enable row level security;
alter table public.shenava_proposals enable row level security;

revoke all on public.shenava_settings, public.shenava_meetings,
              public.shenava_segments, public.shenava_runs,
              public.shenava_templates, public.shenava_proposals
  from anon;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- IF YOU WOULD RATHER USE A SEPARATE SCHEMA
--
-- Replace every `public.shenava_` above with `shenava.` and add
-- `create schema if not exists shenava;` at the top. Then, in the Supabase
-- dashboard, go to Settings → API → Exposed schemas and add `shenava`,
-- otherwise the REST layer cannot see it and every read answers 404.
--
-- The prefixed form in this file needs no such step, which is why it is the
-- default.
-- ═══════════════════════════════════════════════════════════════════════════
