'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { User } from '@supabase/supabase-js';
import type { Problem, Hint } from '@/lib/types';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageSource = 'system' | 'stored' | 'ai-t1' | 'ai-t2';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source: MessageSource;
  chips?: string[];
};

type QuotaState = {
  t1Remaining: number;
  t2Remaining: number;
  activeTier: 'deep' | 'quick' | 'zero';
};

// ─── Constants ────────────────────────────────────────────────────────────────

const WELCOME = `Welcome! I'm your coding tutor for this problem.

Use the chips below to reveal stored hints or get AI feedback on your code. I'll guide you step by step — never giving away the solution.`;

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TutorChat({
  problem,
  code,
  language,
  user,
}: {
  problem: Problem;
  code: string;
  language: string;
  user: User | null;
}) {
  const initialChips = user
    ? ['Review my code ⚡', 'Deep analysis 🔬', 'Reveal Hint 1', 'Reveal Hint 2', 'Reveal Hint 3']
    : ['Reveal Hint 1', 'Reveal Hint 2', 'Reveal Hint 3'];

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: WELCOME,
      source: 'system',
      chips: initialChips,
    },
  ]);

  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [downgradeNote, setDowngradeNote] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  // Keep a ref to messages so callbacks always see the latest snapshot.
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Fetch initial quota on mount (if signed in).
  useEffect(() => {
    if (!user) return;
    fetch('/api/quota')
      .then((r) => r.json())
      .then((data) => {
        if ('t1Remaining' in data) setQuota(data as QuotaState);
      })
      .catch(() => {});
  }, [user]);

  // ── Message helpers ──────────────────────────────────────────────────────────

  const push = useCallback((msg: Omit<Message, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: makeId() }]);
  }, []);

  // ── Stored-hint reveal ───────────────────────────────────────────────────────

  const revealHint = useCallback(
    (level: number) => {
      const hint = (problem.hints ?? []).find((h: Hint) => h.level === level);
      if (!hint) {
        push({
          role: 'assistant',
          content: `Hint ${level} isn't stored for this problem.`,
          source: 'system',
        });
        return;
      }

      push({ role: 'user', content: `Reveal Hint ${level}`, source: 'system' });
      push({
        role: 'assistant',
        content: `**Hint ${level}** *(${hintLabel(level)})*\n\n${hint.text}`,
        source: 'stored',
        chips:
          level < (problem.hints ?? []).length
            ? [`Reveal Hint ${level + 1}`, 'Got it, I can work from here']
            : ['Got it, I can work from here'],
      });
    },
    [problem.hints, push]
  );

  // ── AI call ──────────────────────────────────────────────────────────────────

  const callReview = useCallback(
    async (tier: 'quick' | 'deep', intent: string, displayLabel: string) => {
      if (!user) {
        push({
          role: 'assistant',
          content:
            'Sign in to unlock AI tutor features. Stored hints are always available above.',
          source: 'system',
          chips: ['Reveal Hint 1', 'Reveal Hint 2', 'Reveal Hint 3'],
        });
        return;
      }

      push({ role: 'user', content: displayLabel, source: 'system' });
      setIsLoading(true);
      setDowngradeNote(null);

      // Build trimmed history: include ALL user messages + AI (non-system) assistant messages.
      // Excluding user messages by source was the original bug — it produced model-first history.
      const history = messagesRef.current
        .filter(
          (m) =>
            m.role === 'user' ||
            (m.role === 'assistant' && m.source !== 'system')
        )
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            problem: {
              id: problem.id,
              title: problem.title,
              problem_statement: problem.problem_statement,
              difficulty: problem.difficulty,
              tags: problem.tags,
              hints: problem.hints,
            },
            code,
            language,
            tier,
            history,
            intent,
          }),
        });

        const data = await res.json();

        // ── Zero AI ──
        if (data.mode === 'zero_ai') {
          push({
            role: 'assistant',
            content:
              data.message ??
              'All AI tokens used for today. Come back tomorrow.',
            source: 'system',
            chips: data.chips ?? ['Reveal Hint 1', 'Reveal Hint 2', 'Reveal Hint 3'],
          });
          setQuota({ t1Remaining: 0, t2Remaining: 0, activeTier: 'zero' });
          return;
        }

        // ── Error ──
        if (!res.ok) {
          push({
            role: 'assistant',
            content: data.error ?? 'Something went wrong. Please try again.',
            source: 'system',
            chips: ['Try again', 'Reveal a hint instead'],
          });
          return;
        }

        // ── Success ──
        if (data.downgradeReason) {
          setDowngradeNote(data.downgradeReason);
        }

        push({
          role: 'assistant',
          content: data.content,
          source: data.activeTier === 'deep' ? 'ai-t2' : 'ai-t1',
          chips:
            data.chips?.length > 0
              ? data.chips
              : ['Got it', 'Need more help', 'Show a hint'],
        });

        setQuota({
          t1Remaining: data.t1Remaining,
          t2Remaining: data.t2Remaining,
          activeTier: data.activeTier,
        });
      } catch {
        push({
          role: 'assistant',
          content: 'Network error. Please check your connection and try again.',
          source: 'system',
          chips: ['Try again'],
        });
      } finally {
        setIsLoading(false);
      }
    },
    [user, problem, code, language, push]
  );

  // ── Chip dispatcher ──────────────────────────────────────────────────────────

  const handleChip = useCallback(
    async (chip: string) => {
      if (chip.startsWith('Reveal Hint ')) {
        const level = parseInt(chip.replace('Reveal Hint ', ''), 10);
        if (!isNaN(level)) { revealHint(level); return; }
      }

      if (chip === 'Sign in with Google') {
        const supabase = getSupabaseBrowser();
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        return;
      }

      if (chip === 'Got it, I can work from here' || chip === 'Got it, moving on') {
        push({ role: 'user', content: chip, source: 'system' });
        push({
          role: 'assistant',
          content: 'Great! Let me know when you want feedback on your next attempt.',
          source: 'system',
          chips: ['Review my code ⚡', 'Deep analysis 🔬'],
        });
        return;
      }

      // Everything else → AI quick review with the chip text as intent.
      const tier = chip.includes('Deep') || chip.includes('🔬') ? 'deep' : 'quick';
      const intent =
        chip === 'Review my code ⚡'
          ? 'Please review my current code and give me one targeted piece of feedback.'
          : chip === 'Deep analysis 🔬'
          ? 'Please deeply analyse my code: approach, time complexity, and any subtle edge cases.'
          : chip; // use chip label as the explicit question

      await callReview(tier, intent, chip);
    },
    [revealHint, callReview, push]
  );

  // ── Custom message send ──────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');

    if (!user) {
      push({ role: 'user', content: text, source: 'system' });
      push({
        role: 'assistant',
        content: 'Sign in to chat with the AI tutor.',
        source: 'system',
        chips: ['Sign in with Google', 'Reveal Hint 1', 'Reveal Hint 2'],
      });
      return;
    }

    await callReview('quick', text, text);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col text-sm">

      {/* ── Quota badge ── */}
      {user && (
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <QuotaBadge
            emoji="🔬"
            label="Deep"
            remaining={quota?.t2Remaining ?? null}
            exhausted={quota?.t2Remaining === 0}
          />
          <QuotaBadge
            emoji="⚡"
            label="Quick"
            remaining={quota?.t1Remaining ?? null}
            exhausted={quota?.t1Remaining === 0}
          />
          {quota?.activeTier === 'zero' && (
            <span className="text-[10px] text-amber-500">All AI used today</span>
          )}
        </div>
      )}

      {/* ── Downgrade note ── */}
      {downgradeNote && (
        <div className="shrink-0 border-b border-amber-900/30 bg-amber-950/20 px-3 py-1.5 text-[11px] text-amber-400">
          ↓ {downgradeNote}
        </div>
      )}

      {/* ── Privacy notice (shown once, small) ── */}
      {user && (
        <div className="shrink-0 px-3 pt-1 text-[10px] text-zinc-600">
          AI prompts may be used by Google for model improvement (free tier).
        </div>
      )}

      {/* ── Chat thread ── */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onChip={handleChip} />
        ))}

        {isLoading && <ThinkingBubble />}

        <div ref={bottomRef} />
      </div>

      {/* ── Auth CTA (anonymous) ── */}
      {!user && (
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/60 p-3 text-center">
          <p className="mb-2 text-xs text-zinc-400">
            Sign in to unlock AI tutor feedback
          </p>
          <button
            onClick={() => handleChip('Sign in with Google')}
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            Sign in with Google
          </button>
        </div>
      )}

      {/* ── Input area (signed in) ── */}
      {user && (
        <div className="shrink-0 border-t border-zinc-800 p-2 space-y-2">
          {/* Review buttons */}
          <div className="flex gap-2">
            <button
              onClick={() =>
                callReview(
                  'quick',
                  'Please review my current code and give me one targeted piece of feedback.',
                  'Review my code ⚡'
                )
              }
              disabled={isLoading || quota?.t1Remaining === 0}
              suppressHydrationWarning
              className="flex-1 rounded border border-zinc-700 px-2 py-1.5 text-[11px] text-zinc-300 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ⚡ Review{quota ? ` (${quota.t1Remaining})` : ''}
            </button>
            <button
              onClick={() =>
                callReview(
                  'deep',
                  'Please deeply analyse my code: approach, time complexity, edge cases, and paradigm fit.',
                  'Deep analysis 🔬'
                )
              }
              disabled={isLoading || quota?.t2Remaining === 0}
              suppressHydrationWarning
              className="flex-1 rounded border border-purple-900 px-2 py-1.5 text-[11px] text-purple-300 hover:border-purple-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              🔬 Deep{quota ? ` (${quota.t2Remaining})` : ''}
            </button>
          </div>

          {/* Free-text input */}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask a question…"
              disabled={isLoading}
              suppressHydrationWarning
              className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              suppressHydrationWarning
              className="rounded bg-zinc-700 px-2.5 py-1.5 text-xs text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChatMessage({
  message,
  onChip,
}: {
  message: Message;
  onChip: (chip: string) => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div>
      {/* Source label for non-user, non-system messages */}
      {!isUser && message.source !== 'system' && (
        <div className="mb-0.5 text-[10px] text-zinc-600">
          {message.source === 'stored' && '📚 Stored hint'}
          {message.source === 'ai-t1' && '⚡ Quick Review'}
          {message.source === 'ai-t2' && '🔬 Deep Analysis'}
        </div>
      )}

      <div
        className={
          isUser
            ? 'ml-8 rounded-lg bg-zinc-700 px-3 py-2 text-xs text-zinc-100'
            : message.source === 'stored'
            ? 'rounded-lg border border-amber-900/30 bg-amber-950/10 px-3 py-2'
            : message.source === 'ai-t2'
            ? 'rounded-lg border border-purple-900/30 bg-purple-950/10 px-3 py-2'
            : 'rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2'
        }
      >
        <div className="prose prose-xs prose-invert max-w-none leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>

      {/* Action chips */}
      {message.chips && message.chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {message.chips.map((chip) => (
            <button
              key={chip}
              onClick={() => onChip(chip)}
              suppressHydrationWarning
              className="rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-0.5 text-[11px] text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <span className="flex gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="block h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="text-xs text-zinc-500">Thinking…</span>
    </div>
  );
}

function QuotaBadge({
  emoji,
  label,
  remaining,
  exhausted,
}: {
  emoji: string;
  label: string;
  remaining: number | null;
  exhausted: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
        exhausted
          ? 'text-zinc-700'
          : label === 'Deep'
          ? 'bg-purple-900/20 text-purple-400'
          : 'bg-blue-900/20 text-blue-400'
      }`}
    >
      {emoji} {label}
      {remaining !== null && (
        <span className="ml-0.5 opacity-70">{remaining} left</span>
      )}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hintLabel(level: number): string {
  if (level === 1) return 'nudge';
  if (level === 2) return 'approach';
  return 'key insight';
}