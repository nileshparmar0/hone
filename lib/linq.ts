import { env } from './env';

const LINQ_BASE_URL = 'https://api.linqapp.com/api/partner/v3';

export type MessagePart =
  | { type: 'text'; value: string }
  | { type: 'media'; url: string; mime_type: string; filename?: string };

export interface SendMessageOptions {
  to: string;
  parts: MessagePart[];
  effect?: string;
  idempotencyKey?: string;
}

export interface SendMessageResult {
  ok: boolean;
  status: number;
  chatId?: string;
  messageId?: string;
  traceId?: string;
  error?: string;
  raw?: unknown;
}

export class LinqError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly traceId?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'LinqError';
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<{ data: T; traceId?: string }> {
  const { idempotencyKey, ...rest } = init;

  const headers = new Headers(rest.headers);
  headers.set('Authorization', `Bearer ${env.LINQ_API_TOKEN}`);
  headers.set('Content-Type', 'application/json');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  const response = await fetch(`${LINQ_BASE_URL}${path}`, {
    ...rest,
    headers,
  });

  const traceId = response.headers.get('x-trace-id') ?? undefined;
  const text = await response.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const msg =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Linq request failed: ${response.status}`;
    throw new LinqError(msg, response.status, traceId, body);
  }

  return { data: body as T, traceId };
}

export async function sendMessage(
  opts: SendMessageOptions,
): Promise<SendMessageResult> {
  try {
    const payload = {
      from: env.LINQ_FROM_NUMBER,
      to: [opts.to],
      message: {
        parts: opts.parts,
        ...(opts.effect ? { effect: opts.effect } : {}),
      },
    };

    const { data, traceId } = await request<{
      id?: string;
      chat_id?: string;
      message?: { id?: string };
    }>('/chats', {
      method: 'POST',
      body: JSON.stringify(payload),
      idempotencyKey: opts.idempotencyKey,
    });

    return {
      ok: true,
      status: 200,
      chatId: data.chat_id ?? data.id,
      messageId: data.message?.id,
      traceId,
      raw: data,
    };
  } catch (err) {
    if (err instanceof LinqError) {
      return {
        ok: false,
        status: err.status,
        traceId: err.traceId,
        error: err.message,
        raw: err.body,
      };
    }
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendText(
  to: string,
  text: string,
  opts: { effect?: string; idempotencyKey?: string } = {},
): Promise<SendMessageResult> {
  return sendMessage({
    to,
    parts: [{ type: 'text', value: text }],
    ...opts,
  });
}