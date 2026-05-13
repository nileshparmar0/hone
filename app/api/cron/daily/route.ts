import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { sql } from '@/lib/db';
import { sendText } from '@/lib/linq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface UserToNudge {
  id: string;
  phone: string;
  experience_level: string;
}

const NUDGE_MESSAGES = [
  "Morning. Want to take a swing at a problem before standup?",
  "Hey, quick one before the day picks up — ready for today's problem?",
  "Texting from Hone. Got 10 minutes for a problem?",
  "Up for a problem this morning? Just say 'yes' and I'll pick.",
  "Pop quiz time. Want one?",
];

function pickMessage(): string {
  return NUDGE_MESSAGES[Math.floor(Math.random() * NUDGE_MESSAGES.length)];
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const users = (await sql`
    select id, phone, experience_level from users
    where daily_nudge_enabled = true and onboarded_at is not null
  `) as UserToNudge[];

  const results: Array<{ phone: string; ok: boolean; error?: string }> = [];

  for (const user of users) {
    const message = pickMessage();
    const sendResult = await sendText(user.phone, message, {
      idempotencyKey: `nudge-${user.id}-${new Date().toISOString().slice(0, 10)}`,
    });

    if (sendResult.ok) {
      await sql`
        insert into messages (user_id, direction, parts, linq_message_id, trace_id)
        values (${user.id}, 'outbound', ${JSON.stringify([{ type: 'text', value: message }])}::jsonb,
                ${sendResult.messageId ?? null}, ${sendResult.traceId ?? null})
      `;
      results.push({ phone: user.phone, ok: true });
    } else {
      results.push({ phone: user.phone, ok: false, error: sendResult.error });
    }
  }

  return NextResponse.json({ ok: true, nudged: results.length, results }, { status: 200 });
}