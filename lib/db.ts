import { neon } from '@neondatabase/serverless';
import { env } from './env';

export const sql = neon(env.DATABASE_URL);

export interface User {
  id: string;
  phone: string;
  display_name: string | null;
  experience_level: string;
  preferred_topics: string[];
  timezone: string;
  daily_nudge_enabled: boolean;
  onboarded_at: string | null;
  created_at: string;
}

export interface Problem {
  id: string;
  slug: string;
  title: string;
  topic: string;
  difficulty: string;
  prompt: string;
  hints: string[];
  solution: string;
  complexity: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  problem_id: string | null;
  state: string;
  hints_given: number;
  started_at: string;
  closed_at: string | null;
}

export interface Message {
  id: string;
  user_id: string;
  session_id: string | null;
  direction: 'inbound' | 'outbound';
  parts: unknown;
  linq_message_id: string | null;
  linq_event_id: string | null;
  trace_id: string | null;
  created_at: string;
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const rows = (await sql`
    select * from users where phone = ${phone} limit 1
  `) as User[];
  return rows[0] ?? null;
}

export async function createUser(phone: string): Promise<User> {
  const rows = (await sql`
    insert into users (phone) values (${phone})
    on conflict (phone) do update set phone = excluded.phone
    returning *
  `) as User[];
  return rows[0];
}

export async function getOrCreateUser(phone: string): Promise<{ user: User; isNew: boolean }> {
  const existing = await getUserByPhone(phone);
  if (existing) return { user: existing, isNew: false };
  const user = await createUser(phone);
  return { user, isNew: true };
}

export async function updateUserPreferences(
  userId: string,
  patch: Partial<Pick<User, 'experience_level' | 'preferred_topics' | 'timezone' | 'display_name'>>,
): Promise<User> {
  const rows = (await sql`
    update users
    set
      experience_level = coalesce(${patch.experience_level ?? null}, experience_level),
      preferred_topics = coalesce(${patch.preferred_topics ?? null}, preferred_topics),
      timezone = coalesce(${patch.timezone ?? null}, timezone),
      display_name = coalesce(${patch.display_name ?? null}, display_name),
      onboarded_at = coalesce(onboarded_at, now())
    where id = ${userId}
    returning *
  `) as User[];
  return rows[0];
}

export async function getActiveSession(userId: string): Promise<Session | null> {
  const rows = (await sql`
    select * from sessions
    where user_id = ${userId} and state in ('active', 'awaiting_attempt', 'hinted')
    order by started_at desc
    limit 1
  `) as Session[];
  return rows[0] ?? null;
}

export async function recordInboundMessage(params: {
  userId: string;
  sessionId: string | null;
  eventId: string;
  linqMessageId: string;
  parts: unknown;
  traceId: string | null;
}): Promise<Message | null> {
  const rows = (await sql`
    insert into messages (user_id, session_id, direction, parts, linq_message_id, linq_event_id, trace_id)
    values (${params.userId}, ${params.sessionId}, 'inbound', ${JSON.stringify(params.parts)}::jsonb,
            ${params.linqMessageId}, ${params.eventId}, ${params.traceId})
    on conflict (linq_event_id) do nothing
    returning *
  `) as Message[];
  return rows[0] ?? null;
}

export async function recordOutboundMessage(params: {
  userId: string;
  sessionId: string | null;
  parts: unknown;
  linqMessageId: string | null;
  traceId: string | null;
}): Promise<Message> {
  const rows = (await sql`
    insert into messages (user_id, session_id, direction, parts, linq_message_id, trace_id)
    values (${params.userId}, ${params.sessionId}, 'outbound', ${JSON.stringify(params.parts)}::jsonb,
            ${params.linqMessageId}, ${params.traceId})
    returning *
  `) as Message[];
  return rows[0];
}

export async function getRecentMessages(userId: string, limit = 20): Promise<Message[]> {
  return (await sql`
    select * from messages
    where user_id = ${userId}
    order by created_at desc
    limit ${limit}
  `) as Message[];
}