import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUser } from '@/lib/supabase-server';
import { fetchProfileData } from '@/lib/profile-queries';
import StreakCalendar from '@/components/StreakCalender';
import TopicStrength from '@/components/TopicStrength';
import DifficultyHistogram from '@/components/DifficultyHistogram';
import RecentActivity from '@/components/RecentActivity';
import AIUsageToday from '@/components/AIUsageToday';

export const dynamic = 'force-dynamic';

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-2xl font-bold tabular-nums text-zinc-100">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-zinc-300">{title}</h2>
      {children}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProfilePage() {
  const user = await getAuthUser();
  if (!user) redirect('/');

  // Note: timezone defaults to UTC here. A future improvement is to pass the
  // user's IANA timezone via a header or user preference row. For IST users
  // streaks are ~5.5 h ahead of UTC — rarely makes a practical difference.
  const data = await fetchProfileData(user.id, 'UTC');

  if (!data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-zinc-500">
          Could not load profile data. Please refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">

      {/* ── Header stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Problems Solved" value={data.totalSolved} />
        <StatCard label="30-Day Score" value={data.score.toLocaleString()} />
        <StatCard label="Current Streak" value={`${data.streaks.current}d`} />
        <StatCard label="Longest Streak" value={`${data.streaks.longest}d`} />
      </div>

      {/* ── Activity calendar ── */}
      <Section title="Activity (last 53 weeks)">
        <StreakCalendar solvedByDay={data.solvedByDay} />
      </Section>

      {/* ── Topics + Difficulty side by side ── */}
      <div className="grid gap-8 md:grid-cols-2">
        <Section title="Topics solved">
          <TopicStrength stats={data.topicStats} />
        </Section>

        <Section title="Difficulty distribution (solved)">
          <DifficultyHistogram buckets={data.difficultyBuckets} />
        </Section>
      </div>

      {/* ── AI usage today ── */}
      <Section title="AI usage today">
        <AIUsageToday
          t1Remaining={data.quota.t1Remaining}
          t2Remaining={data.quota.t2Remaining}
          activeTier={data.quota.activeTier}
        />
      </Section>

      {/* ── Recent activity ── */}
      <Section title="Recent activity">
        <RecentActivity rows={data.recentRows} />
      </Section>

      {/* ── Footer note ── */}
      <p className="text-xs text-zinc-600">
        Score (0–100) rewards harder solves and subtracts for hints and AI use,
        summed over problems solved in the last 30 days. Leaning heavily on hints
        and AI can lower it.{' '}
        <Link href="/" className="text-zinc-500 hover:text-zinc-400 underline">
          ← Back to problems
        </Link>
      </p>
    </div>
  );
}