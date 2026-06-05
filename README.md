# AI Coding Tutor

> An AI-powered competitive programming IDE that teaches algorithmic thinking — not by handing over answers, but by walking you through your own code.

---

## The Problem

Most AI coding tools fail learners the same way: paste your broken code, get back a clean solution. You copy it, it passes, you learned nothing. Repeat indefinitely.

Competitive programming is especially vulnerable to this. The value isn't in the answer — it's in discovering *why* your approach breaks on a specific edge case, why your O(n²) loop times out at n = 10⁵, and which algorithmic technique unlocks the problem. A tool that just solves it robs you of exactly that.

---

## Solution

A three-panel IDE where the AI adapts to *your* code and *your* approach — it never replaces them.

The tutor classifies your submission into one of four buckets before saying anything:

| Bucket | Response |
|---|---|
| Correct + optimal | Confirms it. One optional polish note. |
| Correct but too slow | Points at the bottleneck with exact complexity math. Nudges the optimization. |
| Right approach, buggy | Finds the bug **in your code**. Never swaps the approach. |
| Approach can't work | Names the constraint or edge case that kills it, then the technique. No code. |

Two hard rules baked into the system prompt: the AI may only call something wrong if it can produce a concrete failing input — otherwise it hedges. And it never outputs code, ever.

---

## Architecture

```
User loads problem
  └─> problem + hints + tags from Supabase  (zero AI)

User reveals Hint 1/2/3
  └─> stored hint from DB  (zero AI, anonymous allowed)

Tutor chat panel
  ├─ most turns: choice chips → stored hint  (zero AI)
  ├─ Quick Review  (Tier 1, Flash-Lite):  bucket classification, obvious bugs
  └─ Deep Analysis (Tier 2, 3.5 Flash):   multi-turn reasoning, counterexamples
        └─> T2 exhausted → auto-fall to T1
        └─> T1 exhausted → Zero AI mode (stored hints only)
```

Model IDs in use (`app/api/review/route.ts`):

- **Quick Review (Tier 1):** `gemini-3.1-flash-lite-preview`
- **Deep Analysis (Tier 2):** `gemini-3.5-flash`

**Why two AI tiers?** A weaker model misclassifying a correct solution as wrong destroys user trust. For reasoning-heavy turns where trust matters, quality is non-negotiable. For "any obvious bugs?" — speed and availability win. The split optimises both.

The fallback chain is automatic. Users always see why their tier changed and how many calls remain. This turns a real API quota constraint into honest, visible UX.

---

## Key Features

- **Three-panel layout** — problem statement, Monaco editor (C++/Python), tutor chat
- **Progressive hint system** — three curated hints per problem, stored in DB, revealed on demand
- **Adaptive AI feedback** — classify-then-respond, never rewrite; counterexample-or-hedge rule
- **Quota management** — per-user daily caps (20 Quick / 5 Deep), global project backstops, live badge, automatic fallback chain
- **Performance dashboard** — 0–100 score (rating-weighted, hint/AI-penalized, rolling 30 days), streak calendar, strong/weak topic analysis, difficulty histogram
- **Unseen problem paste** — paste a Codeforces URL, the app parses it and generates hints live; embeddings cached
- **Similar problems** — pgvector cosine similarity with tag/difficulty-weighted ranking
- **Auth tiers** — anonymous: browse + editor + all stored hints; signed-in: all AI features + profile

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack) | Server Components + streaming |
| Database | Supabase (Postgres + pgvector) | Free tier, RLS, vector search |
| AI | Google Gemini API (`@google/generative-ai`) | Free tier: Flash-Lite 500 RPD, 3.5 Flash 20 RPD |
| Quota store | Upstash Redis | Serverless-friendly, TTL-per-midnight |
| Editor | Monaco via `@monaco-editor/react` | Full IDE experience in-browser |
| Styling | Tailwind v4 | No config file, `@plugin` directives |
| Auth | `@supabase/ssr` | Google OAuth + email magic links |
| Parsing | `cheerio` | Server-side HTML parse of CF problem pages |
| Math rendering | `katex` + `remark-math` / `rehype-katex` | LaTeX in problem statements |
| Charts | `recharts` | Profile dashboard visualisations |

---

## Data

**300 curated problems** from `open-r1/codeforces` (ODC-By 4.0), filtered to ratings 1000–2500 across core algorithm tags. Each problem has three progressive hints generated offline via Flash-Lite (`thinking_budget=0`) and stored as JSONB — no AI cost at read time.

Dataset attribution: *Problems sourced from [open-r1/codeforces](https://huggingface.co/datasets/open-r1/codeforces) (ODC-By 4.0).*

---

## Quota & Cost Design

The free Gemini API tier is **per-project, shared across all users.** Every architectural decision flows from this constraint. The numbers below live in `lib/quota.ts`.

```
Per-user daily caps (Redis, expires at UTC midnight):
  Quick Review  — 20 calls/user   (Flash-Lite, 500 RPD project-wide)
  Deep Analysis —  5 calls/user   (3.5 Flash,   20 RPD project-wide)

Global project backstops:
  Quick Review  — 480/day  (20 under the 500 RPD hard cap)
  Deep Analysis —  18/day  (2 under the 20 RPD hard cap)

Fallback order: Deep → Quick → Zero AI (stored hints + chips only)
Response cache: SHA-256(problem_id + normalized_code + intent + tier), TTL 24h
```

Cache hits return instantly and don't increment any counter. Identical code sent twice costs nothing.

---

## Constraints & Trade-offs

This project runs on a $0 budget. Some decisions are worth documenting:

- **3.5 Flash = 20 RPD project-wide.** At 5 deep analyses per user that's ~4 users before the project ceiling is hit. Fine for a prototype; the fallback chain means the app never breaks, it just steps down.
- **No code execution (deferred).** Piston public API became auth-gated in Feb 2026 and won't issue keys to portfolio projects. Judge0 via RapidAPI is $0.0017/submission — rejected. Options: self-host Piston on Fly.io, Pyodide in-browser (Python only), or wait for a free provider. The `app/api/execute/route.ts` + `RunPanel.tsx` scaffolding is in place for when one lands.
- **Non-streaming JSON → SSE streaming.** The simpler approach shipped first; `ReadableStream` + `TransformStream` added once the core was stable.
- **Embeddings.** The `tags` column satisfies "frame the nudge in the right paradigm" at zero cost. Embeddings earn their keep for the unseen-problem paste and similar-problem recommender — not for per-problem feedback.

---

## Running Locally

```bash
git clone https://github.com/your-username/ai-tutor
cd ai-tutor
npm install
```

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Set up the database, then seed:

```bash
# Provision the schema in your Supabase project (Postgres + pgvector):
#   - enable the `vector` extension
#   - create the problems / hints / progress / embeddings tables and RLS policies
# Schema is managed in the Supabase dashboard (not checked into this repo).

# Then seed 300 problems (requires GEMINI_API_KEY, ~40 min, idempotent)
python scripts/seed.py --limit 300

# Optional: generate 768-d embeddings for the remaining problems
python scripts/embed.py

# Optional: patch sample I/O on seeded problems
python scripts/patch_sample_io.py
```

```bash
npm run dev
```

---

## Project Structure

```
app/
  page.tsx                        # Homepage — problem list + dashboard banner
  layout.tsx                      # Root layout
  globals.css                     # Tailwind v4 entry
  problems/
    seen/[id]/                    # Seeded problem view (page.tsx + ProblemView.tsx)
    unseen/[id]/                  # Parsed unseen problem view (page.tsx + UnseenProblemView.tsx)
  profile/page.tsx                # Performance dashboard
  auth/callback/route.ts          # OAuth / magic-link callback
  api/
    review/route.ts               # AI feedback dispatcher (SSE, quota, cache)
    quota/route.ts                # Badge state on mount
    progress/                     # open / hint-revealed / mark-solved / heartbeat
    unseen/parse/route.ts         # URL → cheerio → hints → embed → DB
    similar/route.ts              # pgvector similarity search
    execute/route.ts              # Code execution (deferred — no provider)
components/                       # Flat — no subfolders
  TutorChat.tsx                   # Chat panel — chips, stored hints, SSE consumer
  CodeEditor.tsx                  # Monaco editor
  RunPanel.tsx                    # Sample I/O runner (deferred)
  ProblemStatement.tsx            # KaTeX-rendered statement
  HintPanel.tsx                   # Progressive hint reveal
  SimilarProblems.tsx             # Similarity widget
  Stopwatch.tsx                   # Display-only timer
  FilterForm.tsx                  # Problem-list filters
  UnseenProblemInput.tsx          # Codeforces URL paste box
  AuthButton.tsx / Footer.tsx     # Shell chrome
  StreakCalender.tsx              # Profile: streak calendar
  TopicStrength.tsx               # Profile: strong/weak topics
  DifficultyHistogram.tsx         # Profile: difficulty distribution
  RecentActivity.tsx              # Profile: recent solves
  AIUsageToday.tsx                # Profile: live quota usage
lib/
  quota.ts                        # Per-user + global counters, fallback chain
  prompt.ts                       # buildSystemPrompt, postProcessResponse, sanitizeGeminiHistory
  scoring.ts                      # 0–100 performance score formula
  profile-queries.ts              # Parallel profile data fetching
  progress.ts                     # Progress read/write helpers
  topic-categories.ts             # Tag → topic-bucket mapping
  env.ts                          # Boot-time env validation
  types.ts                        # Shared types
  supabase.ts / supabase-server.ts / supabase-browser.ts  # Supabase clients
scripts/
  seed.py                         # Offline hint generation (Flash-Lite, thinking_budget=0)
  embed.py                        # 768-d embeddings via gemini-embedding-001
  patch_sample_io.py              # Populate sample_io from HF dataset cache
docs/                             # Build plans / design notes
```

---

## Performance Score

```
base             = difficulty_rating / 3250
raw_contribution = base − 0.04·hints − (0.015·quick_calls + 0.05·deep_calls)
problem_points   = raw_contribution × 16
overall_score    = clamp( Σ problem_points [last 30 days], 0, 100 )
```

Score can decrease. Heavy hint and AI use make `raw_contribution` negative. A clean solve of a 2400-rated problem contributes ~11.8 points; the same solve with all 3 hints and 3 deep-analysis calls contributes ~0.6. ~10 clean medium solves approach 100.

---

## License

MIT. Problems are sourced from `open-r1/codeforces` under ODC-By 4.0 — attribution required.
