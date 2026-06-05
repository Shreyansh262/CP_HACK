'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { User } from '@supabase/supabase-js';
import type { Problem } from '@/lib/types';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { hintLabel } from '@/lib/prompt';

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageSource = 'system' | 'stored' | 'ai-t1' | 'ai-t2';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  source: MessageSource;
  chips?: string[];
  streaming?: boolean; // true while SSE tokens are still arriving
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function QuotaBadge({
  label,
  remaining,
  exhausted,
  tone,
}: {
  label: string;
  remaining: number | null;
  exhausted: boolean;
  tone: 'quick' | 'deep';
}) {
  // A leading dot + tinted text distinguishes the tiers without emoji.
  const dot = tone === 'deep' ? 'bg-violet-400' : 'bg-blue-400';
  const text = exhausted
    ? 'text-zinc-600'
    : tone === 'deep'
      ? 'text-violet-300'
      : 'text-blue-300';
  return (
    <span className={`flex items-center gap-1.5 rounded bg-zinc-800 px-1.5 py-0.5 text-[13px] font-medium ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${exhausted ? 'bg-zinc-600' : dot}`} />
      {label} {remaining !== null ? `(${remaining})` : '—'}
    </span>
  );
}

function ChatMessage({
  message,
  onChip,
}: {
  message: Message;
  onChip: (chip: string) => void;
}) {
  const isUser = message.role === 'user';
  const isStreaming = message.streaming && message.content;

  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${isUser
          ? 'bg-blue-600 text-white'
          : message.source === 'stored'
            ? 'border border-zinc-700 bg-zinc-900 text-zinc-200'
            : message.source === 'system'
              ? 'text-zinc-500'
              : 'border border-zinc-700 bg-zinc-900 text-zinc-200'
          }`}
      >
        {message.source === 'system' && !isUser ? (
          <span>{message.content}</span>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
              code: ({ children }) => (
                <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[14px] text-zinc-300">
                  {children}
                </code>
              ),
              h3: ({ children }) => (
                <h3 className="mb-1 mt-2 text-xs font-semibold text-zinc-200">{children}</h3>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
        {isStreaming && (
          <span className="ml-1 inline-block h-2 w-1 animate-pulse bg-zinc-400" />
        )}
      </div>

      {/* Chips */}
      {!isStreaming && message.chips && message.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {message.chips.map((chip) => (
            <button
              key={chip}
              onClick={() => onChip(chip)}
              suppressHydrationWarning
              className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${chip.startsWith('Reveal Hint')
                  ? 'border-amber-800 bg-amber-950/40 text-amber-400 hover:border-amber-600 hover:text-amber-300'
                  : chip === 'Review my code'
                    ? 'border-blue-800 bg-blue-950/40 text-blue-300 hover:border-blue-600 hover:text-blue-200'
                    : chip === 'Deep analysis'
                      ? 'border-violet-800 bg-violet-950/40 text-violet-300 hover:border-violet-600 hover:text-violet-200'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                }`}            >
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
    <div className="flex items-start gap-2">
      <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
    ? ['Review my code', 'Deep analysis', 'Reveal Hint 1']
    : ['Reveal Hint 1'];

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
  const [maxHintRevealed, setMaxHintRevealed] = useState(0); // 0=none, 1=h1, 2=h2, 3=h3
  const [isLoading, setIsLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [downgradeNote, setDowngradeNote] = useState<string | null>(null);
  // Tier for free-typed messages, chosen via the selector by the Send box.
  const [selectedTier, setSelectedTier] = useState<'quick' | 'deep'>('quick');

  // Deep is unavailable once the user's T2 quota (or global backstop, surfaced
  // as t2Remaining = 0) is spent. Derive the effective tier rather than storing
  // it — we never send 'deep' when it would silently downgrade, and the user's
  // choice is restored automatically if quota frees up.
  const deepAvailable = quota ? quota.t2Remaining > 0 : true;
  const effectiveTier: 'quick' | 'deep' =
    selectedTier === 'deep' && !deepAvailable ? 'quick' : selectedTier;

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Auto-scroll on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Fetch initial quota on mount.
  useEffect(() => {
    if (!user) return;
    fetch('/api/quota')
      .then((r) => r.json())
      .then((d) => { if ('t1Remaining' in d) setQuota(d as QuotaState); })
      .catch(() => { });
  }, [user]);

  // ── Message helper ─────────────────────────────────────────────────────────

  const push = useCallback((msg: Omit<Message, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: makeId() }]);
  }, []);

  // ── Stored-hint reveal ─────────────────────────────────────────────────────

  // ── AI review call (Phase 4: SSE streaming) ────────────────────────────────

  const callReview = useCallback(
    async (tier: 'quick' | 'deep', intent: string, displayLabel: string) => {
      if (!user) {
        push({
          role: 'assistant',
          content: 'Sign in to unlock AI tutor features. Stored hints are always available.',
          source: 'system',
          chips: ['Reveal Hint 1', 'Reveal Hint 2', 'Reveal Hint 3'],
        });
        return;
      }

      push({ role: 'user', content: displayLabel, source: 'system' });
      setIsLoading(true);
      setDowngradeNote(null);

      // Build trimmed history (last 6 messages, user+AI only, no system).
      const history = messagesRef.current
        .filter(
          (m) =>
            m.role === 'user' ||
            (m.role === 'assistant' && m.source !== 'system'),
        )
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      // Placeholder message id for streaming updates.
      const placeholderId = makeId();

      let firstToken = true;
      try {
        const response = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problem, code, language, tier, history, intent }),
        });

        if (!response.ok || !response.body) throw new Error('Stream failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(part.slice(6));
            } catch {
              continue;
            }

            if (event.type === 'token') {
              const text = event.text as string;
              if (firstToken) {
                // Replace loading state with streaming placeholder.
                setIsLoading(false);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: placeholderId,
                    role: 'assistant',
                    content: text,
                    source: 'system',
                    streaming: true,
                  },
                ]);
                firstToken = false;
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === placeholderId
                      ? { ...m, content: m.content + text }
                      : m,
                  ),
                );
              }
            } else if (event.type === 'done' || event.type === 'error') {
              const content = event.content as string;
              const chips = (event.chips as string[]) ?? [];
              const eTier = event.activeTier as string;

              if (firstToken) {
                // Cache hit, zero-AI, or error: no tokens arrived. Upsert by
                // placeholderId so a trailing error→done pair can't double-push.
                setIsLoading(false);
                const finalMsg: Message = {
                  id: placeholderId,
                  role: 'assistant',
                  content,
                  source:
                    eTier === 'deep' ? 'ai-t2' : eTier === 'quick' ? 'ai-t1' : 'system',
                  chips,
                };
                setMessages((prev) =>
                  prev.some((m) => m.id === placeholderId)
                    ? prev.map((m) => (m.id === placeholderId ? finalMsg : m))
                    : [...prev, finalMsg],
                );
              } else {
                // Finalise the streaming placeholder.
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === placeholderId
                      ? {
                        ...m,
                        content,
                        source:
                          eTier === 'deep'
                            ? 'ai-t2'
                            : eTier === 'quick'
                              ? 'ai-t1'
                              : 'system',
                        chips,
                        streaming: false,
                      }
                      : m,
                  ),
                );
              }

              if (
                typeof event.t1Remaining === 'number' &&
                typeof event.t2Remaining === 'number'
              ) {
                setQuota({
                  t1Remaining: event.t1Remaining as number,
                  t2Remaining: event.t2Remaining as number,
                  activeTier: (eTier === 'deep'
                    ? 'deep'
                    : eTier === 'quick'
                      ? 'quick'
                      : 'zero') as QuotaState['activeTier'],
                });
              }

              if (event.downgradeReason) {
                setDowngradeNote(event.downgradeReason as string);
              }
            }
          }
        }
      } catch {
        setIsLoading(false);
        setMessages((prev) =>
          firstToken
            ? [
              ...prev,
              {
                id: placeholderId,
                role: 'assistant',
                content: 'Network error. Please check your connection and try again.',
                source: 'system',
                chips: ['Try again'],
              },
            ]
            : prev.filter((m) => m.id !== placeholderId),
        );
        if (!firstToken) {
          push({
            role: 'assistant',
            content: 'Network error. Please check your connection and try again.',
            source: 'system',
            chips: ['Try again'],
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [user, problem, code, language, push],
  );

  function revealHint(idx: number) {
    // Sequential guard — can't skip hints
    if (idx > maxHintRevealed + 1) {
      push({
        role: 'assistant',
        source: 'system',
        content: `Please reveal Hint ${maxHintRevealed + 1} first — hints build on each other.`,
        chips: [`Reveal Hint ${maxHintRevealed + 1}`],
      });
      return;
    }

    const hint = problem.hints?.[idx];
    if (!hint) return;

    const nextChips = idx < 2 ? [`Reveal Hint ${idx + 2}`] : [];
    const aiChips = user ? ['Review my code', 'Deep analysis'] : [];

    push({
      role: 'assistant',
      source: 'stored',
      content: `**Hint ${idx + 1} (${hintLabel(idx + 1)}):** ${hint.text}`,
      chips: [...nextChips, ...aiChips],
    });

    setMaxHintRevealed(idx + 1);

    if (user) {
      fetch('/api/progress/hint-revealed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem_id: problem.id }),
      }).catch(() => { });
    }
  }

  // ── Chip dispatcher ────────────────────────────────────────────────────────

  const handleChip = useCallback(
    async (chip: string) => {
      if (chip.startsWith('Reveal Hint ')) {
        const level = parseInt(chip.replace('Reveal Hint ', ''), 10);
        if (!Number.isNaN(level)) {
          revealHint(level - 1);
          return;
        }
      }

      if (chip === 'Sign in with Google') {
        const sb = getSupabaseBrowser();
        await sb.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        return;
      }

      if (
        chip === 'Got it, I can work from here' ||
        chip === 'Got it, moving on'
      ) {
        push({ role: 'user', content: chip, source: 'system' });
        push({
          role: 'assistant',
          content:
            "Great! Let me know when you want feedback on your next attempt.",
          source: 'system',
          chips: ['Review my code', 'Deep analysis'],
        });
        return;
      }

      const tier = chip.includes('Deep') ? 'deep' : 'quick';
      const intent =
        chip === 'Review my code'
          ? 'Please review my current code and give me one targeted piece of feedback.'
          : chip === 'Deep analysis'
            ? 'Please deeply analyse my code: approach, time complexity, and any subtle edge cases.'
            : chip;

      await callReview(tier, intent, chip);
    },
    [revealHint, callReview, push],
  );

  // ── Free-form send ─────────────────────────────────────────────────────────

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

    await callReview(effectiveTier, text, text);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col text-sm">

      {/* Quota badge */}
      {user && (
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <QuotaBadge
            tone="deep"
            label="Deep"
            remaining={quota?.t2Remaining ?? null}
            exhausted={quota?.t2Remaining === 0}
          />
          <QuotaBadge
            tone="quick"
            label="Quick"
            remaining={quota?.t1Remaining ?? null}
            exhausted={quota?.t1Remaining === 0}
          />
          {quota?.activeTier === 'zero' && (
            <span className="text-[13px] text-amber-500">All AI used today</span>
          )}
        </div>
      )}

      {/* Downgrade note */}
      {downgradeNote && (
        <div className="shrink-0 border-b border-amber-900/30 bg-amber-950/20 px-3 py-1.5 text-[14px] text-amber-400">
          ↓ {downgradeNote}
        </div>
      )}

      {/* Privacy notice — shown only to signed-in users (free tier disclosure) */}
      {user && (
        <div className="shrink-0 px-3 pt-1 text-[13px] text-zinc-600">
          AI prompts may be used by Google for model improvement (free tier).
        </div>
      )}

      {/* Chat thread */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} onChip={handleChip} />
        ))}
        {isLoading && <ThinkingBubble />}
        <div ref={bottomRef} />
      </div>

      {/* Auth CTA (anonymous) */}
      {!user && (
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/60 p-3 text-center">
          <p className="mb-2 text-xs text-zinc-400">
            Sign in to unlock AI tutor feedback
          </p>
          <button
            onClick={() => handleChip('Sign in with Google')}
            suppressHydrationWarning
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            Sign in with Google
          </button>
        </div>
      )}

      {/* Input area (signed-in) */}
      {user && (
        <div className="shrink-0 space-y-2 border-t border-zinc-800 p-2">
          {/* Quick buttons */}
          <div className="flex gap-2">
            <button
              onClick={() =>
                callReview(
                  'quick',
                  'Please review my current code and give me one targeted piece of feedback.',
                  'Review my code',
                )
              }
              disabled={isLoading || quota?.t1Remaining === 0}
              suppressHydrationWarning
              className="flex-1 rounded border border-blue-900 px-2 py-1.5 text-[14px] text-blue-300 hover:border-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Review{quota ? ` (${quota.t1Remaining})` : ''}
            </button>
            <button
              onClick={() =>
                callReview(
                  'deep',
                  'Please deeply analyse my code: approach, time complexity, edge cases, and paradigm fit.',
                  'Deep analysis',
                )
              }
              disabled={isLoading || quota?.t2Remaining === 0}
              suppressHydrationWarning
              className="flex-1 rounded border border-violet-900 px-2 py-1.5 text-[14px] text-violet-300 hover:border-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Deep{quota ? ` (${quota.t2Remaining})` : ''}
            </button>
          </div>

          {/* Free-form input */}
          <div className="flex gap-1.5">
            {/* Per-message model selector — routes the typed message to the
                chosen tier. Deep disables when its quota is spent. */}
            <select
              value={effectiveTier}
              onChange={(e) => setSelectedTier(e.target.value as 'quick' | 'deep')}
              disabled={isLoading}
              suppressHydrationWarning
              title="Model for your typed message"
              className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-40"
            >
              <option value="quick">Quick</option>
              <option value="deep" disabled={!deepAvailable}>
                Deep{deepAvailable ? '' : ' (0)'}
              </option>
            </select>
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask a specific question…"
              suppressHydrationWarning
              className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !inputText.trim()}
              suppressHydrationWarning
              className="rounded border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}