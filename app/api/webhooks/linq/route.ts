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

interface LinqWebhookEvent {
  event_id: string;
  event_type: string;
  occurred_at?: string;
  data: {
    message?: {
      id?: string;
      from?: string;
      to?: string[];
      parts?: Array<{ type: string; value?: string }>;
      chat_id?: string;
    };
    chat?: {
      id?: string;
      participants?: string[];
    };
  };
}

function extractInboundText(event: LinqWebhookEvent): { text: string; from: string | null; messageId: string | null } {
  const msg = event.data.message;
  if (!msg) return { text: '', from: null, messageId: null };
  const textParts = (msg.parts ?? []).filter((p) => p.type === 'text' && typeof p.value === 'string');
  const text = textParts.map((p) => p.value).join('\n').trim();
  return { text, from: msg.from ?? null, messageId: msg.id ?? null };
}

async function processInbound(event: LinqWebhookEvent, traceId: string | null): Promise<void> {
  const { text, from, messageId } = extractInboundText(event);
  if (!from || !messageId) {
    console.warn('[webhook] missing from or messageId', { eventId: event.event_id });
    return;
  }

  const { user, isNew } = await getOrCreateUser(from);

  const recorded = await recordInboundMessage({
    userId: user.id,
    sessionId: (await getActiveSession(user.id))?.id ?? null,
    eventId: event.event_id,
    linqMessageId: messageId,
    parts: event.data.message?.parts ?? [],
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