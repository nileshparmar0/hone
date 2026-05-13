create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  display_name text,
  experience_level text not null default 'medium',
  preferred_topics text[] not null default '{}',
  timezone text not null default 'America/New_York',
  daily_nudge_enabled boolean not null default true,
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists problems (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  topic text not null,
  difficulty text not null,
  prompt text not null,
  hints text[] not null default '{}',
  solution text not null,
  complexity text,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  problem_id uuid references problems(id),
  state text not null default 'idle',
  hints_given int not null default 0,
  started_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  direction text not null,
  parts jsonb not null,
  linq_message_id text,
  linq_event_id text unique,
  trace_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_user_created on messages(user_id, created_at desc);
create index if not exists idx_sessions_user_state on sessions(user_id, state);
create index if not exists idx_users_phone on users(phone);