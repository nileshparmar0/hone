# Hone

An iMessage-native practice partner for software engineers, built on the Linq messaging platform.

Text a number, get a coding problem, talk through your approach in plain English, get Socratic feedback. Hints when you're stuck. Solution when you give up. Daily nudges so you keep showing up.

**Live sandbox:** [hone-pearl.vercel.app](https://hone-pearl.vercel.app)
**Demo video:** [link to be added]
**Submitted for:** Linq Software Engineer technical assessment, May 2026.

---

## The idea

Linq's bet is that conversation is the interface. I wanted to test that on a domain where conversation actually is the right UX, not a forced fit.

Every engineer I know has practiced LeetCode in a browser tab they keep forgetting about. The friction isn't the problems, it's the context switch. If the practice lived where the procrastination already lives — iMessage — I'd actually do it. So that's what Hone is: a conversational practice partner you text like a friend.

The bot:
- Picks a problem matched to your level and topic preferences
- Asks you to describe your approach in plain English (not code)
- Responds Socratically — one sharp question instead of a wall of feedback
- Hands out hints in escalating order, only when asked
- Reveals the full solution on demand
- Texts you in the morning to nudge you back in

The use case is intentionally on-brand for what Linq is building. Long-running, personalized, async, content-rich, daily re-engagement. Same shape as Poke. The platform should shine.

---

## Architecture

```
iPhone / Android
       │
       │  SMS / iMessage / RCS
       ▼
   Linq API ──► message.received webhook ──► Vercel serverless function
                                                   │
                                                   ├── HMAC signature verification
                                                   ├── Idempotency on event_id
                                                   │
                                                   ├──► Gemini 2.5 Flash agent loop
                                                   │       (tool use: pick_problem,
                                                   │        give_hint, reveal_solution,
                                                   │        get_context, close_session)
                                                   │
                                                   ├──► Neon Postgres
                                                   │       (users, problems, sessions,
                                                   │        messages)
                                                   │
                                                   └──► Linq /chats ──► reply to user

   Vercel Cron (daily 9am ET) ──► /api/cron/daily ──► fan-out nudges to active users
```

The whole system is one Next.js app on Vercel. Webhook handler, agent, dashboard, and cron all share the same deployment, same env, same logs.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend / API | Next.js 16 (App Router) | One repo for landing, dashboard, webhook handler, cron |
| Language | TypeScript everywhere | Strict mode, no `any` |
| Hosting | Vercel | Serverless functions for the webhook, Cron Jobs for daily nudges |
| Database | Neon Postgres (HTTP driver) | Works in serverless without connection pooling drama |
| LLM | Gemini 2.5 Flash with function calling | Fast inference matters — users wait on iMessage. Free tier was a nice bonus. |
| Messaging | Linq Partner API v3 | The reason we're here |

Maps directly to the role's listed stack (React/Next.js, Node, TypeScript) plus the cloud infra and API fluency in the nice-to-haves.

---

## What's implemented

- **End-to-end conversation loop** — onboarding, problem selection, Socratic feedback, hints, solution reveal, session close
- **8 seeded problems** across arrays, strings, trees, graphs, stacks, design (easy/medium)
- **Per-user state** — experience level, preferred topics, attempted problems (no repeats)
- **Daily 9am ET nudge** via Vercel Cron, with idempotency-keyed sends
- **Ops dashboard** at `/dashboard` showing user list and recent messages
- **HMAC-SHA256 webhook signature verification** with constant-time comparison
- **Idempotency at both ingress and egress** — unique constraint on `linq_event_id` for inbound, idempotency keys on every outbound send
- **W3C trace ID propagation** — Linq's `x-trace-id` flows through our DB rows so any conversation can be traced back to the originating webhook

---

## Engineering decisions worth flagging

A few choices that aren't obvious from the code.

**Webhook returns 200 immediately, then processes in the background.** Linq's webhook timeout is 10 seconds. A naive implementation that runs the LLM call synchronously is a coin-flip at best — Gemini can take 3-8s on its own, plus DB roundtrips. We acknowledge in <100ms using Vercel's `after()` primitive and run the agent loop off the critical path. A retry storm would have been the first thing to break in production.

**Idempotency at both ends, not just one.** `linq_event_id` has a `UNIQUE` constraint on the messages table, and the insert uses `ON CONFLICT DO NOTHING`. If Linq retries (and at-least-once delivery means they will), the second insert returns no rows and we short-circuit. Outbound sends use a deterministic idempotency key (`reply-{event_id}`) so even if our handler runs twice, the user sees one reply, not two.

**Constant-time signature comparison.** Used `crypto.timingSafeEqual`. A naive `===` on HMAC hex leaks timing info that can be used to forge signatures byte by byte. Linq's docs flag this; not all webhook implementations actually do it.

**Raw body, not parsed JSON, for HMAC.** Parsing then restringifying changes whitespace and key order; HMACs are byte-exact. Read the body as text first, verify, then parse.

**The Linq client is hand-rolled, not the official SDK.** ~100 lines of `fetch` with proper error typing and trace ID surfacing. Adds zero dependencies and demonstrates the integration explicitly. The SDK would have been faster to ship but lower signal in this context.

**Gemini instead of Claude or GPT.** Free tier, fast inference, function calling is mature. The agent system prompt + tool definitions are model-agnostic — swapping providers is a 30-line diff.

**Stateless agent, stateful database.** Each webhook is a fresh function invocation. The agent re-reads context every turn via `get_context` instead of relying on session memory. This is how real production agents work, not how tutorials show them.

**No Go scheduler, even though the JD lists Go.** I considered splitting the daily nudge job into a Go service for the ephemeris-style heavy lifting, but the workload doesn't warrant it. Vercel Cron + a TypeScript handler keeps everything in one repo, one deploy, one mental model. If this scaled to ten thousand users with per-minute precision, I'd revisit.

---

## Local setup

```bash
git clone https://github.com/nileshparmar0/hone
cd hone
npm install
cp .env.example .env.local      # then fill in real values
npm run dev
```

You'll need:
- A Linq sandbox account ([linqapp.com](https://linqapp.com)) for `LINQ_API_TOKEN`, `LINQ_WEBHOOK_SECRET`, and a sandbox phone number
- A Neon Postgres database for `DATABASE_URL`
- A Gemini API key from [aistudio.google.com](https://aistudio.google.com)
- A random hex string for `CRON_SECRET` (`openssl rand -hex 32`)

Then in Neon's SQL editor, run `schema.sql` followed by `seed.sql`.

For local webhook testing, expose `localhost:3000` via ngrok and point the Linq webhook subscription at `https://<ngrok-id>.ngrok.io/api/webhooks/linq?version=2026-02-03`.

---

## What I'd build next

- **Tool: schedule a real mock interview.** Hone hands you off to a human coach when you're stuck on the same topic three times.
- **Group chats.** Pair-programming-by-text — two users in a chat, Hone facilitates.
- **Voice input via Linq's voice API.** Explain your approach out loud during a walk. Hone transcribes and replies. The natural extension of "the practice should happen where you already are."
- **Streak tracking + leaderboards.** The fastest way to get engineers to do anything is to make it slightly competitive.
- **Per-company prep packs.** Stripe, Datadog, Ramp — curated problem sets matching each company's known interview style.

---

Built by **Nilesh Parmar** ([nileshparmar0](https://github.com/nileshparmar0)) over 4 days in May 2026.
