import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { supabase } from '@/lib/supabase';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── URL validation ─────────────────────────────────────────────────────────────

function validateCfUrl(raw: string): { ok: true; canonical: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Invalid URL format.' };
  }

  if (url.hostname !== 'codeforces.com' && url.hostname !== 'www.codeforces.com') {
    return { ok: false, error: 'Only codeforces.com URLs are supported.' };
  }

  const p = url.pathname;
  const problemsetMatch = p.match(/^\/problemset\/problem\/(\d+)\/([A-Z]\d*)$/i);
  const contestMatch    = p.match(/^\/contest\/(\d+)\/problem\/([A-Z]\d*)$/i);
  const gymMatch        = p.match(/^\/gym\/(\d+)\/problem\/([A-Z]\d*)$/i);

  if (!problemsetMatch && !contestMatch && !gymMatch) {
    return {
      ok: false,
      error: 'URL must point to a specific problem, e.g. codeforces.com/problemset/problem/1700/A',
    };
  }

  const m = problemsetMatch || contestMatch || gymMatch!;
  const canonical = `https://codeforces.com/problemset/problem/${m[1]}/${m[2].toUpperCase()}`;
  return { ok: true, canonical };
}

// ── HTML parser ────────────────────────────────────────────────────────────────

interface ParsedProblem {
  title: string;
  problemStatement: string;
  constraintsText: string;
  sampleIo: { input: string; output: string }[];
  difficulty: string | null;
  tags: string[];
}

function parseCfHtml(html: string): ParsedProblem | { error: string } {
  const $ = cheerio.load(html);

  try {
    const title = $('.title').first().text().trim().replace(/^[A-Z\d]+\.\s*/, '') || 'Unknown Problem';

    const statementDiv = $('.problem-statement');
    if (!statementDiv.length) {
      return { error: "Couldn't find the problem statement on this page — is the URL correct?" };
    }

    const statementClone = statementDiv.clone();
    statementClone.find('.sample-tests').remove();
    statementClone.find('.note').remove();

    const problemStatement = statementClone.text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    const constraintsText = statementDiv.find('.input-specification, .memory-limit, .time-limit')
      .map((_, el) => $(el).text().trim())
      .get()
      .join('\n') || '';

    const sampleIo: { input: string; output: string }[] = [];
    statementDiv.find('.sample-tests').first().find('.input, .output').each((i, el) => {
      const text = ($(el).find('pre').text() || $(el).text()).trim();
      if (i % 2 === 0) {
        sampleIo.push({ input: text, output: '' });
      } else if (sampleIo.length > 0) {
        sampleIo[sampleIo.length - 1].output = text;
      }
    });

    const tags = $('.tag-box')
      .map((_, el) => $(el).text().trim().toLowerCase())
      .get()
      .filter((t) => t && t !== '*special' && !t.startsWith('*'));

    const diffText = $('.tag-box[title="Difficulty"]').text().trim()
      || $('[title="Difficulty"]').text().trim();
    const diffMatch = diffText.match(/\d{3,4}/);
    const difficulty = diffMatch ? diffMatch[0] : null;

    return { title, problemStatement, constraintsText, sampleIo, difficulty, tags };
  } catch (e) {
    return { error: `Parse error: ${(e as Error).message}. The page structure may have changed.` };
  }
}

// ── Hint generation ────────────────────────────────────────────────────────────

async function generateHints(problem: ParsedProblem): Promise<object[]> {
  const model = genai.getGenerativeModel({
    model: 'gemini-3.1-flash-lite-preview',
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
  });

  const tagStr = problem.tags.length ? problem.tags.join(', ') : 'unknown';
  const prompt = `You are a competitive programming tutor. Generate exactly 3 progressive hints for this problem.

Problem: ${problem.title}
Tags: ${tagStr}
Difficulty: ${problem.difficulty ?? 'unknown'}

Statement (excerpt):
${problem.problemStatement.slice(0, 1500)}

Rules:
- Hint 1: Only reveal the high-level algorithmic approach. No implementation details. Max 40 words.
- Hint 2: Reveal the key insight that makes the approach work. No code. Max 60 words.
- Hint 3: Describe the algorithm steps in plain English. No code, ever. Max 80 words.
- Never reveal a full solution or write code.

Respond with ONLY valid JSON — no markdown, no backticks, no preamble:
[{"level":1,"text":"..."},{"level":2,"text":"..."},{"level":3,"text":"..."}]`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim().replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 3) return parsed;
  } catch {
    // fall through to defaults
  }

  return [
    { level: 1, text: 'Think about what algorithmic approach fits the constraints.' },
    { level: 2, text: 'Consider the data structures needed to implement your approach efficiently.' },
    { level: 3, text: 'Work through the algorithm step by step on the sample inputs before coding.' },
  ];
}

// ── Embedding ──────────────────────────────────────────────────────────────────

async function embedProblem(problem: ParsedProblem): Promise<number[] | null> {
  try {
    const text = [
      problem.title,
      problem.tags.length ? 'Tags: ' + problem.tags.join(', ') : '',
      problem.difficulty ? `Difficulty: ${problem.difficulty}` : '',
      problem.problemStatement.slice(0, 2000),
    ].filter(Boolean).join('\n');

    // Use getGenerativeModel — embedContent lives on the model instance, not the top-level client
    const model = genai.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await model.embedContent({
      content: { parts: [{ text }], role: 'user' },
      taskType: TaskType.RETRIEVAL_DOCUMENT,
      // @ts-expect-error outputDimensionality supported in API but may not be typed in older SDK versions
      outputDimensionality: 768,
    });

    const vec = result.embedding.values;
    // L2 normalise
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? vec.map((v) => v / norm) : vec;
  } catch {
    return null; // non-fatal — problem is still usable without embedding
  }
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { url } = await req.json() as { url?: string };

  if (!url?.trim()) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  // 1. Validate URL
  const validated = validateCfUrl(url.trim());
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { canonical } = validated;

  // 2. Cache check — return immediately if already parsed
  const { data: existing } = await supabase          // FIX: .from() not .table()
    .from('unseen_problems')
    .select('id, title, problem_statement, constraints_text, sample_io, difficulty, tags, hints')
    .eq('source_url', canonical)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ problem: existing, cached: true });
  }

  // 3. Fetch from Codeforces
  let html: string;
  try {
    const res = await fetch(canonical, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-Coding-Tutor/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'Problem not found on Codeforces (404). Check the URL.' }, { status: 404 });
      }
      return NextResponse.json({ error: `Codeforces returned ${res.status}. Try again later.` }, { status: 502 });
    }
    html = await res.text();
  } catch (e) {
    const msg = (e as Error).message || '';
    if (msg.includes('timeout')) {
      return NextResponse.json({ error: 'Codeforces took too long to respond. Try again.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Could not reach Codeforces. Check your connection.' }, { status: 502 });
  }

  // 4. Parse
  const parsed = parseCfHtml(html);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  // 5. Dedup by statement hash (same problem at different URL)
  const statementHash = crypto
    .createHash('sha256')
    .update(parsed.problemStatement.slice(0, 500))
    .digest('hex');

  const { data: hashCheck } = await supabase
    .from('unseen_problems')
    .select('id')
    .eq('statement_hash', statementHash)
    .maybeSingle();

  if (hashCheck) {
    // Update source_url alias so next lookup is faster, return existing
    await supabase
      .from('unseen_problems')                       // FIX: .from() not .table()
      .update({ source_url: canonical })
      .eq('id', hashCheck.id);

    const { data: full } = await supabase
      .from('unseen_problems')
      .select('*')
      .eq('id', hashCheck.id)
      .single();

    return NextResponse.json({ problem: full, cached: true });
  }

  // 6. Generate hints (live Flash-Lite call)
  const hints = await generateHints(parsed);

  // 7. Embed (non-blocking if it fails)
  const embedding = await embedProblem(parsed);

  // 8. Insert
  const insertPayload = {
    source_url:        canonical,
    statement_hash:    statementHash,
    title:             parsed.title,
    problem_statement: parsed.problemStatement,
    constraints_text:  parsed.constraintsText || null,
    sample_io:         parsed.sampleIo.length ? parsed.sampleIo : null,
    difficulty:        parsed.difficulty,
    tags:              parsed.tags,
    hints,
    embedding,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('unseen_problems')                         // FIX: .from() not .table()
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    console.error('[unseen/parse] insert error:', insertError);
    return NextResponse.json({ error: 'Failed to save problem. Try again.' }, { status: 500 });
  }

  return NextResponse.json({ problem: inserted, cached: false });
}