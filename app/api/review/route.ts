import { type NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import { Redis } from '@upstash/redis';
import { getAuthUser } from '@/lib/supabase-server';
import { supabase as supabaseAdmin } from '@/lib/supabase';
import { resolveTier, incrementT1, incrementT2 } from '@/lib/quota';
import {
  buildSystemPrompt,
  trimHistory,
  toGeminiHistory,
  sanitizeGeminiHistory,
  postProcessResponse,
  type ChatTurn,
} from '@/lib/prompt';
import type { Problem } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ─── Config ───────────────────────────────────────────────────────────────────

const MODELS = {
  quick: 'gemini-3.1-flash-lite-preview',
  deep: 'gemini-3.5-flash',
} as const;

const THINKING_BUDGET = { quick: 512, deep: 7936 } as const;
const MAX_OUTPUT_TOKENS = { quick: 1500, deep: 3500 } as const;
const CACHE_TTL_SEC = 60 * 60 * 24; // 24 h

// ─── Redis (Phase 4 response cache) ──────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewRequest = {
  problem: Problem;
  code: string;
  language: string;
  tier: 'quick' | 'deep';
  history: ChatTurn[];
  intent: string;
};

type DonePayload = {
  content: string;
  chips: string[];
  activeTier: 'quick' | 'deep';
  downgradeReason: string | null;
  t1Remaining: number;
  t2Remaining: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stable cache key for a (problem, code, intent, tier) combination. */
function cacheKey(problemId: string, code: string, intent: string, tier: string): string {
  const normalized = code.replace(/\s+/g, ' ').trim().slice(0, 4000);
  const hash = createHash('sha256')
    .update(`${problemId}:${normalized}:${intent}:${tier}`)
    .digest('hex')
    .slice(0, 20);
  return `cache:review:${hash}`;
}

const enc = new TextEncoder();

/** Format one SSE event. */
function sse(data: Record<string, unknown>): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(data)}\n\n`);
}

/** Respond immediately with a single SSE done event (for cache hits / zero-AI). */
function sseInstant(payload: Record<string, unknown>): Response {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(sse({ type: 'done', ...payload }));
      c.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Auth guard
  const user = await getAuthUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Parse + validate body
  let body: ReviewRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { problem, code, language, tier, history, intent } = body;
  if (!problem?.id || typeof code !== 'string' || !tier || !intent) {
    return new Response(JSON.stringify({ error: 'missing_fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Three-level fallback chain (§3.1)
  const { effectiveTier, quotaState, downgradeReason } = await resolveTier(user.id, tier);

  // 4. Zero-AI branch
  if (effectiveTier === 'zero') {
    return sseInstant({
      content: quotaState.reason ?? 'All AI tokens used for today. Come back tomorrow.',
      chips: ['Reveal Hint 1', 'Reveal Hint 2', 'Reveal Hint 3'],
      activeTier: 'zero',
      downgradeReason: null,
      t1Remaining: 0,
      t2Remaining: 0,
    });
  }

  const eTier = effectiveTier as 'quick' | 'deep';

  // 5. Cache check — hits don't burn quota
  const ck = cacheKey(problem.id, code, intent, eTier);
  try {
    const raw = await redis.get<string>(ck);
    if (raw) {
      const cached: DonePayload = typeof raw === 'string' ? JSON.parse(raw) : raw;
      // Refresh quota numbers (they change daily even though the answer is cached)
      return sseInstant({
        ...cached,
        t1Remaining: quotaState.t1Remaining,
        t2Remaining: quotaState.t2Remaining,
      });
    }
  } catch (err) {
    console.warn('[review] cache read error:', err);
  }

  // 6. Build Gemini inputs
  const systemPrompt = buildSystemPrompt(problem, eTier);
  const geminiHistory = sanitizeGeminiHistory(toGeminiHistory(trimHistory(history)));
  const userMessage =
    `${intent}\n\nMy current ${language} code:\n\`\`\`${language}\n${code}\n\`\`\``;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: MODELS[eTier],
    systemInstruction: systemPrompt,
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS[eTier],
      temperature: 0.4,
      ...({
        thinkingConfig: { thinkingBudget: THINKING_BUDGET[eTier] },
      } as Record<string, unknown>),
    },
  });

  // 7. Stream response via SSE
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chat = model.startChat({ history: geminiHistory });
        const result = await chat.sendMessageStream(userMessage);

        let fullText = '';
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            fullText += text;
            controller.enqueue(sse({ type: 'token', text }));
          }
        }

        // Post-process: strip code blocks + extract chips
        const { text: processedText, chips } = postProcessResponse(fullText);

        // Increment quota (only on success)
        if (eTier === 'quick') await incrementT1(user.id);
        else await incrementT2(user.id);

        // Compute updated remaining counts locally (avoid extra Redis round-trip)
        const updatedQuota = {
          t1Remaining: eTier === 'quick'
            ? Math.max(0, quotaState.t1Remaining - 1)
            : quotaState.t1Remaining,
          t2Remaining: eTier === 'deep'
            ? Math.max(0, quotaState.t2Remaining - 1)
            : quotaState.t2Remaining,
        };

        const donePayload: DonePayload = {
          content: processedText,
          chips: chips.length > 0 ? chips : ['Got it', 'Need more help', 'Show a hint'],
          activeTier: eTier,
          downgradeReason: downgradeReason ?? null,
          ...updatedQuota,
        };

        // Cache for 24 h (best-effort)
        redis
          .set(ck, JSON.stringify(donePayload), { ex: CACHE_TTL_SEC })
          .catch((err) => console.warn('[review] cache write error:', err));

        // ── Phase 4: update user_progress tier counters ──────────────────
        supabaseAdmin
          .rpc('increment_tier_call', {
            p_user_id: user.id,
            p_problem_id: problem.id,
            p_column: eTier === 'deep' ? 'tier2_calls' : 'tier1_calls',
          })
          .then(({ error }) => {
            if (error) console.error('[review] progress increment failed:', error);
          });

        controller.enqueue(sse({ type: 'done', ...donePayload }));
        controller.close();
      } catch (err) {
        console.error('[review] Gemini error:', err);
        controller.enqueue(
          sse({
            type: 'error',
            content:
              'AI is temporarily unavailable. Stored hints are still here for you.',
            chips: ['Reveal Hint 1', 'Reveal Hint 2', 'Reveal Hint 3'],
            activeTier: eTier,
            downgradeReason: null,
            t1Remaining: quotaState.t1Remaining,
            t2Remaining: quotaState.t2Remaining,
          }),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}