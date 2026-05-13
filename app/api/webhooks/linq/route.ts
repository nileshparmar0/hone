import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { env } from '@/lib/env';
import { verifyLinqSignature } from '@/lib/verify';
import { getOrCreateUser, recordInboundMessage, recordOutboundMessage, getActiveSession } from '@/lib/db';
import { sendText, LinqError } from '@/lib/linq';
import { runAgent } from '@/lib/agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface LinqHandle {
  handle?: string;
  id?: string;
  is_me?: boolean;
  service?: string;
  status?: string;
}

interface LinqMessagePart {
  type: string;
  value?: string;
  text?: string;
}

interface LinqWebhookEvent {
  api_version?: string;
  webhook_version?: string;
  event_type: string;
  event_id: string;
  created_at?: string;
  trace_id?: string;
  partner_id?: string;
  data?: {
    id?: string;
    chat?: {
      id?: string;
      is_group?: boolean;
      owner_handle?: LinqHandle;
    };
    direction?: string;
    parts?: LinqMessagePart[];
    sender_handle?: LinqHandle;
    sent_at?: string;
    service?: string;
    reply_to?: string | null;
    idempotency_key?: string | null;
  };
}

function extractInboundText(event: LinqWebhookEvent): { text: string; from: string | null; messageId: string | null; chatId: string | null } {
  const data = event.data;
  if (!data) return { text: '', from: null, messageId: null, chatId: null };

  const from = data.sender_handle?.handle ?? null;
  const messageId = data.id ?? null;
  const chatId = data.chat?.id ?? null;

  const text = (data.parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => p.value ?? p.text ?? '')
    .join('\n')
    .trim();

  return { text, from, messageId, chatId };
}

async function processInbound(event: LinqWebhookEvent, traceId: string | null): Promise<void> {
  console.log('[webhook] raw event', JSON.stringify(event, null, 2));
  const { text, from, messageId } = extractInboundText(event);
  if (!from || !messageId) {
    console.warn('[webhook] missing from or messageId', { eventId: event.event_id, eventType: event.event_type });
    return;
  }

  const { user, isNew } = await getOrCreateUser(from);

  const recorded = await recordInboundMessage({
    userId: user.id,
    sessionId: (await getActiveSession(user.id))?.id ?? null,
    eventId: event.event_id,
    linqMessageId: messageId,
    parts: event.data?.parts ?? [{ type: 'text', value: text }],
    traceId,
  });

  if (!recorded) {
    console.log('[webhook] duplicate event skipped', { eventId: event.event_id });
    return;
  }

  if (!text) {
    console.log('[webhook] non-text inbound, skipping agent', { eventId: event.event_id });
    return;
  }

  const greeting = isNew
    ? "Hey, welcome to Hone. I'm a practice partner for software engineers — text me a topic like 'medium arrays' or just say 'pick one' and we'll get started. "
    : '';

  let replyText: string;
  try {
    const agentResult = await runAgent({ user, userMessage: text });
    replyText = greeting + agentResult.replyText;
  } catch (err) {
    console.error('[webhook] agent error', err);
    replyText = "Hit a snag on my end. Try once more in a moment?";
  }

  const sendResult = await sendText(from, replyText, {
    idempotencyKey: `reply-${event.event_id}`,
  });

  if (!sendResult.ok) {
    console.error('[webhook] send failed', {
      eventId: event.event_id,
      status: sendResult.status,
      error: sendResult.error,
      traceId: sendResult.traceId,
    });
    return;
  }

  await recordOutboundMessage({
    userId: user.id,
    sessionId: (await getActiveSession(user.id))?.id ?? null,
    parts: [{ type: 'text', value: replyText }],
    linqMessageId: sendResult.messageId ?? null,
    traceId: sendResult.traceId ?? null,
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get('x-webhook-timestamp');
  const signature = request.headers.get('x-webhook-signature');
  const traceId = request.headers.get('x-trace-id');

  const verification = verifyLinqSignature(rawBody, timestamp, signature);
  if (!verification.valid) {
    console.warn('[webhook] signature verification failed', { reason: verification.reason });
    return NextResponse.json({ error: 'invalid_signature', reason: verification.reason }, { status: 401 });
  }

  let event: LinqWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (event.event_type !== 'message.received') {
    return NextResponse.json({ ok: true, ignored: event.event_type }, { status: 200 });
  }

  after(async () => {
    try {
      await processInbound(event, traceId);
    } catch (err) {
      if (err instanceof LinqError) {
        console.error('[webhook] LinqError in background', { status: err.status, message: err.message, traceId: err.traceId });
      } else {
        console.error('[webhook] background error', err);
      }
    }
  });

  return NextResponse.json({ ok: true, event_id: event.event_id }, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'hone-webhook' }, { status: 200 });
}