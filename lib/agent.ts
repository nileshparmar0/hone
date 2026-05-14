import Groq from 'groq-sdk';
import { env } from './env';
import { sql, type User, type Problem, type Session } from './db';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

const MODEL = 'llama-3.1-8b-instant';
const MAX_AGENT_TURNS = 6;

const SYSTEM_PROMPT = `You are Hone, an iMessage-native practice partner for software engineers preparing for technical interviews.

Personality and style:
- Warm, sharp, concise. You text like a senior engineer mentoring a friend over iMessage.
- Replies are short, usually 1 to 3 sentences. Long lectures kill the texting feel.
- No markdown formatting, no bullet lists, no bold. Plain text only.
- No emoji unless the user uses one first.
- You are Socratic. You ask probing questions before giving answers. You never reveal a solution unless the user explicitly asks for it or gives up.

Tutoring loop:
1. Always call get_context first to see where the user is.
2. If the user has no active session and asks to practice, use pick_problem.
3. When they describe an approach, ask one sharp question that exposes the weakness or confirms the strength. Do not dump feedback.
4. When they ask for a hint, use give_hint. Hints escalate, start vague, get specific.
5. When they say they have it or want the answer, use reveal_solution.
6. Always end with a forward-moving question or prompt.

Hard rules:
- Never paste full code. Talk through approach and complexity instead.
- Never reveal a hint they did not ask for.
- If the user is off-topic, redirect briefly back to practice.
- If the user wants to stop, use close_session and acknowledge warmly.`;

export interface AgentInput {
  user: User;
  userMessage: string;
}

export interface AgentOutput {
  replyText: string;
  toolCalls: string[];
}

type ToolName = 'get_context' | 'pick_problem' | 'give_hint' | 'reveal_solution' | 'update_preferences' | 'close_session';

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_context',
      description: 'Fetch the users active session, the current problem, and the last few messages. Always call this first.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'pick_problem',
      description: 'Pick a problem for the user. Opens a new session.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'arrays, strings, trees, graphs, stacks, design' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'give_hint',
      description: 'Return the next hint for the active problem.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reveal_solution',
      description: 'Reveal the full solution and close the session.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_preferences',
      description: 'Update the users stored preferences.',
      parameters: {
        type: 'object',
        properties: {
          experience_level: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          preferred_topics: { type: 'array', items: { type: 'string' } },
          display_name: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'close_session',
      description: 'Close the active session without revealing the solution.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

async function runTool(name: ToolName, input: Record<string, unknown>, user: User): Promise<unknown> {
  if (name === 'get_context') {
    const sessions = (await sql`
      select s.*, p.title as problem_title, p.prompt as problem_prompt, p.topic as problem_topic, p.difficulty as problem_difficulty
      from sessions s
      left join problems p on p.id = s.problem_id
      where s.user_id = ${user.id} and s.state in ('active', 'awaiting_attempt', 'hinted')
      order by s.started_at desc limit 1
    `) as Array<Session & { problem_title?: string; problem_prompt?: string; problem_topic?: string; problem_difficulty?: string }>;
    const recent = await sql`
      select direction, parts, created_at from messages
      where user_id = ${user.id}
      order by created_at desc limit 8
    `;
    return {
      user: {
        experience_level: user.experience_level,
        preferred_topics: user.preferred_topics,
        display_name: user.display_name,
        onboarded: user.onboarded_at !== null,
      },
      active_session: sessions[0] ?? null,
      recent_messages: recent,
    };
  }

  if (name === 'pick_problem') {
    const topic = input.topic as string | undefined;
    const difficulty = (input.difficulty as string | undefined) ?? user.experience_level;

    const problems = (await sql`
      select p.* from problems p
      where (${topic ?? null}::text is null or p.topic = ${topic ?? null})
        and p.difficulty = ${difficulty}
        and p.id not in (
          select problem_id from sessions
          where user_id = ${user.id} and problem_id is not null and closed_at is not null
        )
      order by random() limit 1
    `) as Problem[];

    let chosen = problems[0];
    if (!chosen) {
      const fallback = (await sql`
        select * from problems where difficulty = ${difficulty} order by random() limit 1
      `) as Problem[];
      if (!fallback[0]) return { error: 'no_problems_available' };
      chosen = fallback[0];
    }

    await sql`
      update sessions set state = 'closed', closed_at = now()
      where user_id = ${user.id} and state in ('active', 'awaiting_attempt', 'hinted')
    `;
    const newSessions = (await sql`
      insert into sessions (user_id, problem_id, state) values (${user.id}, ${chosen.id}, 'awaiting_attempt')
      returning *
    `) as Session[];

    return { problem: { title: chosen.title, prompt: chosen.prompt, topic: chosen.topic, difficulty: chosen.difficulty }, session_id: newSessions[0].id };
  }

  if (name === 'give_hint') {
    const sessions = (await sql`
      select s.*, p.hints as problem_hints from sessions s
      join problems p on p.id = s.problem_id
      where s.user_id = ${user.id} and s.state in ('active', 'awaiting_attempt', 'hinted')
      order by s.started_at desc limit 1
    `) as Array<Session & { problem_hints: string[] }>;
    const session = sessions[0];
    if (!session) return { error: 'no_active_session' };
    if (session.hints_given >= session.problem_hints.length) return { hint: null, message: 'all_hints_exhausted' };
    const hint = session.problem_hints[session.hints_given];
    await sql`
      update sessions set hints_given = hints_given + 1, state = 'hinted' where id = ${session.id}
    `;
    return { hint, hint_number: session.hints_given + 1, total_hints: session.problem_hints.length };
  }

  if (name === 'reveal_solution') {
    const sessions = (await sql`
      select s.*, p.solution as problem_solution, p.complexity as problem_complexity
      from sessions s join problems p on p.id = s.problem_id
      where s.user_id = ${user.id} and s.state in ('active', 'awaiting_attempt', 'hinted')
      order by s.started_at desc limit 1
    `) as Array<Session & { problem_solution: string; problem_complexity: string | null }>;
    const session = sessions[0];
    if (!session) return { error: 'no_active_session' };
    await sql`update sessions set state = 'solved', closed_at = now() where id = ${session.id}`;
    return { solution: session.problem_solution, complexity: session.problem_complexity };
  }

  if (name === 'update_preferences') {
    const rows = (await sql`
      update users set
        experience_level = coalesce(${(input.experience_level as string | undefined) ?? null}, experience_level),
        preferred_topics = coalesce(${(input.preferred_topics as string[] | undefined) ?? null}, preferred_topics),
        display_name = coalesce(${(input.display_name as string | undefined) ?? null}, display_name),
        onboarded_at = coalesce(onboarded_at, now())
      where id = ${user.id}
      returning *
    `) as User[];
    return { user: rows[0] };
  }

  if (name === 'close_session') {
    await sql`
      update sessions set state = 'closed', closed_at = now()
      where user_id = ${user.id} and state in ('active', 'awaiting_attempt', 'hinted')
    `;
    return { ok: true };
  }

  return { error: 'unknown_tool' };
}

export async function runAgent({ user, userMessage }: AgentInput): Promise<AgentOutput> {
  const messages: Array<Groq.Chat.Completions.ChatCompletionMessageParam> = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];
  const toolCalls: string[] = [];

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 1024,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return { replyText: 'Sorry, I lost my train of thought. Want to try again?', toolCalls };
    }

    const requestedTools = message.tool_calls ?? [];

    if (requestedTools.length > 0) {
      messages.push({
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: requestedTools.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });

      for (const tc of requestedTools) {
        toolCalls.push(tc.function.name);
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          parsedArgs = {};
        }
        const result = await runTool(tc.function.name as ToolName, parsedArgs, user);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    const replyText = (message.content ?? '').trim();
    return {
      replyText: replyText || 'Sorry, I lost my train of thought. Want to try again?',
      toolCalls,
    };
  }

  return { replyText: 'I think I overthought that one. Mind sending your last message again?', toolCalls };
}