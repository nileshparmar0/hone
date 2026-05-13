import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface UserRow {
  id: string;
  phone: string;
  display_name: string | null;
  experience_level: string;
  onboarded_at: string | null;
  created_at: string;
  message_count: number;
}

interface MessageRow {
  id: string;
  user_phone: string;
  direction: string;
  preview: string;
  created_at: string;
}

async function getUsers(): Promise<UserRow[]> {
  return (await sql`
    select u.id, u.phone, u.display_name, u.experience_level, u.onboarded_at, u.created_at,
      (select count(*) from messages m where m.user_id = u.id)::int as message_count
    from users u
    order by u.created_at desc
    limit 50
  `) as UserRow[];
}

async function getRecentMessages(): Promise<MessageRow[]> {
  return (await sql`
    select m.id, u.phone as user_phone, m.direction,
      coalesce(m.parts->0->>'value', '[non-text]') as preview,
      m.created_at
    from messages m
    join users u on u.id = m.user_id
    order by m.created_at desc
    limit 25
  `) as MessageRow[];
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return phone.slice(0, 3) + '•••' + phone.slice(-4);
}

export default async function DashboardPage() {
  const [users, messages] = await Promise.all([getUsers(), getRecentMessages()]);

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Hone — Ops</h1>
          <p className="text-zinc-500 text-sm">{users.length} users · {messages.length} recent messages</p>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-300">Users</h2>
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-400 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Phone</th>
                  <th className="px-4 py-2 font-medium">Level</th>
                  <th className="px-4 py-2 font-medium">Messages</th>
                  <th className="px-4 py-2 font-medium">Onboarded</th>
                  <th className="px-4 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-zinc-600">No users yet — text the sandbox number to onboard.</td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-t border-zinc-900">
                      <td className="px-4 py-2 font-mono text-zinc-300">{maskPhone(u.phone)}</td>
                      <td className="px-4 py-2 text-zinc-400">{u.experience_level}</td>
                      <td className="px-4 py-2 text-zinc-400">{u.message_count}</td>
                      <td className="px-4 py-2 text-zinc-500">{u.onboarded_at ? 'yes' : '—'}</td>
                      <td className="px-4 py-2 text-zinc-500">{timeAgo(u.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-300">Recent messages</h2>
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-400 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Dir</th>
                  <th className="px-4 py-2 font-medium">Preview</th>
                </tr>
              </thead>
              <tbody>
                {messages.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-zinc-600">No messages yet.</td>
                  </tr>
                ) : (
                  messages.map((m) => (
                    <tr key={m.id} className="border-t border-zinc-900">
                      <td className="px-4 py-2 text-zinc-500 whitespace-nowrap">{timeAgo(m.created_at)}</td>
                      <td className="px-4 py-2 font-mono text-zinc-400">{maskPhone(m.user_phone)}</td>
                      <td className="px-4 py-2 text-zinc-500">{m.direction === 'inbound' ? '→' : '←'}</td>
                      <td className="px-4 py-2 text-zinc-300 truncate max-w-md">{m.preview}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}