import { type NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAuthUser } from '@/lib/supabase-server';
import { resolveTier, incrementT1, incrementT2, getQuotaState } from '@/lib/quota';
import {
  buildSystemPrompt,
  trimHistory,
  toGeminiHistory,
  postProcessResponse,
  type ChatTurn,
} from '@/lib/prompt';
import type { Problem } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Hobby: 60s; Fluid Compute: up to 300s

// ─── Model configuration ──────────────────────────────────────────────────────

const MODELS = {
  quick: 'gemini-3.1-flash-lite-preview',
  deep: 'gemini-3.5-flash',
} as const;

/**
 * Thinking budgets.
 * Tier 1: modest — enough to classify the bucket and reason about one issue.
 * Tier 2: high  — needed for counterexample construction and complex edge cases.
 */
const THINKING_BUDGET = {
  quick: 512,
  deep: 8192,
} as const;

// ─── Request shape ────────────────────────────────────────────────────────────

type ReviewRequest = {
  problem: Problem;
  code: string;
  language: string;
  /** The tier the user explicitly chose. Fallback chain may downgrade it. */
  tier: 'quick' | 'deep';
  /** Trimmed chat history sent from the client. */
  history: ChatTurn[];
  /** The user's question / chip text — drives this turn. */
  intent: string;
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. ── Auth check (middleware also guards, but defence-in-depth) ────────────
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to use AI tutor features.' }, { status: 401 });
  }

  // 2. ── Parse body ──────────────────────────────────────────────────────────
  let body: ReviewRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { problem, code, language, tier, history, intent } = body;

  if (!problem || !code || !intent) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  // 3. ── Three-level fallback chain ──────────────────────────────────────────
  const { effectiveTier, quotaState, downgradeReason } = await resolveTier(user.id, tier);

  // Level 3 — Zero AI
  if (effectiveTier === 'zero') {
    return NextResponse.json({
      mode: 'zero_ai',
      content: '',
      chips: ['Reveal Hint 1', 'Reveal Hint 2', 'Reveal Hint 3'],
      message: quotaState.reason ?? 'All AI tokens used for today. Come back tomorrow.',
      t1Remaining: 0,
      t2Remaining: 0,
      activeTier: 'zero',
    });
  }

  // 4. ── Build prompt ────────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(problem);
  const trimmedHistory = trimHistory(history);
  const geminiHistory = toGeminiHistory(trimmedHistory);

  // Wrap the user's code in a fenced block inside the message so the model sees
  // exact syntax — but note the system prompt forbids it from echoing code back.
  const userMessage = `My current code (${language}):\n\`\`\`${language}\n${code.slice(0, 8000)}\n\`\`\`\n\n${intent}`;

  // 5. ── Call Gemini ─────────────────────────────────────────────────────────
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const modelId = MODELS[effectiveTier as 'quick' | 'deep'];

  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: systemPrompt,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.4,
      // thinkingConfig is supported by the newer Gemini models.
      // The TS types may lag; cast to any to avoid compile errors.
      ...(({
        thinkingConfig: {
          thinkingBudget: THINKING_BUDGET[effectiveTier as 'quick' | 'deep'],
        },
      }) as Record<string, unknown>),
    },
  });

  let rawResponse = '';

  try {
    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(userMessage);
    rawResponse = result.response.text();
  } catch (err: unknown) {
    console.error('[/api/review] Gemini error:', err);
    // Don't burn quota on a failed call.
    return NextResponse.json(
      {
        error:
          'AI is temporarily unavailable. Stored hints are still here for you.',
        chips: ['Reveal Hint 1', 'Reveal Hint 2', 'Reveal Hint 3'],
        ...quotaState,
      },
      { status: 503 }
    );
  }

  // 6. ── Post-process: extract chips, strip code blocks ─────────────────────
  const { text, chips } = postProcessResponse(rawResponse);

  // 7. ── Increment quota (only on success) ───────────────────────────────────
  if (effectiveTier === 'quick') {
    await incrementT1(user.id);
  } else {
    await incrementT2(user.id);
  }

  // 8. ── Compute updated remaining counts ────────────────────────────────────
  // Decrement locally rather than doing another round-trip to Redis.
  const updatedQuota = {
    t1Remaining:
      effectiveTier === 'quick'
        ? Math.max(0, quotaState.t1Remaining - 1)
        : quotaState.t1Remaining,
    t2Remaining:
      effectiveTier === 'deep'
        ? Math.max(0, quotaState.t2Remaining - 1)
        : quotaState.t2Remaining,
  };

  // 9. ── Return ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    mode: 'ai',
    content: text,
    chips: chips.length > 0 ? chips : ['Got it', 'Need more help', 'Show a hint'],
    activeTier: effectiveTier,
    downgradeReason: downgradeReason ?? null,
    ...updatedQuota,
  });
}