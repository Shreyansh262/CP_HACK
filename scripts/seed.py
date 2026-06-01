#!/usr/bin/env python3
"""
AI Coding Tutor — Phase 1 Seed Script
======================================
Loads the open-r1/codeforces dataset (ODC-By 4.0), generates 3-level progressive
hints per problem via Gemini 2.5 Flash, and upserts to Supabase.

Usage
-----
  # First run: inspect dataset column names (no API calls, no DB writes)
  python seed.py --inspect

  # Smoke test: seed 10 problems
  python seed.py --limit 10

  # Full seed
  python seed.py --limit 300

  # Resume after interruption (idempotent — skips already-seeded problems)
  python seed.py --limit 300

Free-tier constraints
---------------------
  Gemini 2.5 Flash: ~250 RPD, 10 RPM.
  Script runs at ~8 req/min (7.5s sleep) → 300 problems in ~38 min, within 1 day's quota.
  The script tracks a DAILY_CAP and stops before hitting the limit.
"""

import os, sys, json, time, re, argparse
from datetime import datetime, date
from pathlib import Path
from dotenv import load_dotenv

# ── Load .env ─────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent.parent / ".env.local")
load_dotenv(Path(__file__).parent.parent / ".env")

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL           = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_SERVICE_KEY   = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
GEMINI_API_KEY         = os.environ.get("GEMINI_API_KEY", "")

TARGET_TAGS = {
    "dp", "graphs", "graph matchings", "greedy",
    "binary search", "two pointers",
    "monotonic stack", "shortest paths", "trees",
    "divide and conquer", "math",
}
MIN_RATING   = 1000   # skip trivial <800 problems
MAX_RATING   = 2400   # skip elite-only >2500 problems
SLEEP_SECS   = 5.0    # ~12 req/min; under 15 RPM cap
DAILY_CAP    = 480    # stop 20 under the 500 RPD limit of gemini-3.1-flash-lite-preview

HINT_PROMPT = """\
You are an expert competitive-programming tutor. Given the problem statement below,
generate exactly 3 progressive hints that guide a student toward the solution without giving it away.

Rules:
- Hint 1: A very gentle nudge. Point to the problem category or a key observation.
  Reveal no more than 10% of the full approach.
- Hint 2: The key insight or algorithmic idea (e.g. "think about this as a graph problem where...").
  Reveal ~40% of the full approach.
- Hint 3: A near-complete strategy — the algorithm at a high level, no code, no pseudocode.
  A student who reads this should be able to implement the solution themselves.

Never include code, pseudocode, or variable names. Never state "the answer is X".

Problem statement:
{statement}

Respond with exactly this format and nothing else:
HINT 1:
[write hint 1 here]

HINT 2:
[write hint 2 here]

HINT 3:
[write hint 3 here]
"""

# ── Field name candidates (open-r1/codeforces may use different names across splits) ──
# The inspect flag prints actual names so you can verify.
STATEMENT_FIELDS = ["problem", "statement", "description", "problem_statement", "content"]
TITLE_FIELDS     = ["name", "title", "problem_name"]
RATING_FIELDS    = ["rating", "difficulty", "cf_rating", "problem_rating"]
TAGS_FIELDS      = ["tags", "cf_tags", "problem_tags"]
ID_FIELDS        = ["problem_id", "cf_id", "id"]
CONTEST_FIELDS   = ["contest_id", "cf_contest_id", "contestId"]
INDEX_FIELDS     = ["problem_index", "cf_index", "index"]


def get_field(row: dict, candidates: list[str], default=None):
    for key in candidates:
        val = row.get(key)
        if val is not None and val != "":
            return val
    return default


def build_external_id(row: dict) -> str:
    # Dataset 'id' field is already "contestId/index" e.g. "852/A" — use directly
    raw_id = row.get("id")
    if raw_id:
        return str(raw_id).replace("/", "")  # "852/A" → "852A"
    # Fallback
    contest = str(row.get("contest_id", "") or "").strip()
    index   = str(row.get("index", "") or "").strip()
    if contest and index:
        return f"{contest}{index}"
    title = str(row.get("title", "unknown") or "unknown")
    return f"hash_{abs(hash(title)) % 1_000_000}"


def parse_tags(raw) -> list[str]:
    if isinstance(raw, list):
        return [str(t).strip().lower() for t in raw if t]
    if isinstance(raw, str):
        return [t.strip().lower() for t in raw.split(",") if t.strip()]
    return []


def parse_rating(raw) -> int | None:
    if raw is None:
        return None
    try:
        return int(str(raw).strip())
    except (ValueError, TypeError):
        return None


def filter_problem(row: dict) -> bool:
    rating = parse_rating(get_field(row, RATING_FIELDS))
    if rating is None:
        return False  # skip problems with no rating
    if not (MIN_RATING <= rating <= MAX_RATING):
        return False
    tags = parse_tags(get_field(row, TAGS_FIELDS, []))
    return bool(set(tags) & TARGET_TAGS)


def generate_hints(statement: str, client, retries: int = 5) -> list[dict] | None:
    from google.genai import types
    truncated = statement[:4000]  # cap at 4k chars to keep prompt size manageable
    for attempt in range(retries):
        try:
            response = client.models.generate_content(
                model="gemini-3.1-flash-lite-preview",
                contents=HINT_PROMPT.format(statement=truncated),
                config=types.GenerateContentConfig(
                    temperature=0.4,
                    max_output_tokens=2048,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
            raw = response.text.strip()
            # Split on any "HINT N:" pattern — handles bold, case, spacing variations
            parts = re.split(r'(?i)(?:\*\*)?\s*hint\s*\d+\s*:?\*?\*?\s*', raw)
            hint_texts = [p.strip() for p in parts if p.strip()]
            hints = [{"level": i + 1, "text": t} for i, t in enumerate(hint_texts[:3])]
            assert len(hints) == 3, f"Expected 3 hints, got {len(hints)}.\nFull raw:\n{raw}"
            assert all(len(h["text"]) > 20 for h in hints), "Hints too short"
            return hints
        except json.JSONDecodeError as e:
            print(f"    JSON parse error (attempt {attempt+1}): {e}")
            print(f"    Raw response: {raw[:300]!r}")
        except AssertionError as e:
            print(f"    Hint validation failed (attempt {attempt+1}): {e}")
        except Exception as e:
            print(f"    API error (attempt {attempt+1}): {type(e).__name__}: {e}")

        if attempt < retries - 1:
            wait = 15 * (attempt + 1)
            print(f"    Retrying in {wait}s ...")
            time.sleep(wait)
    return None


def already_seeded(external_id: str, supabase) -> bool:
    result = (
        supabase.table("competitive_problems")
        .select("id")
        .eq("external_id", external_id)
        .execute()
    )
    return len(result.data) > 0


def check_env():
    missing = []
    if not SUPABASE_URL:       missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY: missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not GEMINI_API_KEY:     missing.append("GEMINI_API_KEY")
    if missing:
        print(f"❌ Missing env vars: {', '.join(missing)}")
        print("   Copy .env.example → .env.local and fill in the values.")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Seed the AI Coding Tutor problem database.")
    parser.add_argument("--inspect", action="store_true",
                        help="Print dataset column names and one sample row, then exit.")
    parser.add_argument("--limit", type=int, default=300,
                        help="Maximum number of problems to seed (default: 300).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Filter and preview problems but make no API calls or DB writes.")
    args = parser.parse_args()

    # ── Imports (deferred so --help works without deps installed) ─────────────
    try:
        from datasets import load_dataset
        from supabase import create_client
        from google import genai
        from tqdm import tqdm
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("   Run: pip install -r requirements_seed.txt")
        sys.exit(1)

    # ── Dataset ───────────────────────────────────────────────────────────────
    print("📦 Loading open-r1/codeforces (first run downloads ~1 GB, cached after) ...")
    ds = load_dataset("open-r1/codeforces", split="train", trust_remote_code=True)
    print(f"   Loaded {len(ds):,} problems.")

    if args.inspect:
        print("\n── Column names ──────────────────────────────────────────────────")
        print(ds.column_names)
        print("\n── Sample row (first problem) ────────────────────────────────────")
        row = ds[0]
        for k, v in row.items():
            val_preview = str(v)[:120].replace("\n", "↵") if v else "(empty)"
            print(f"  {k:30s}: {val_preview}")
        print("\nInspect complete. Verify field names match the script's *_FIELDS lists at the top.")
        print("If any differ, update the lists in seed.py before running the full seed.")
        return

    # ── Filter ────────────────────────────────────────────────────────────────
    print(f"\n🔍 Filtering: rating {MIN_RATING}–{MAX_RATING}, tags: {TARGET_TAGS}")
    candidates = [row for row in ds if filter_problem(row)]
    print(f"   {len(candidates):,} problems match. Capping at {args.limit}.")
    candidates = candidates[:args.limit]

    if args.dry_run:
        print("\n── DRY RUN — first 5 candidates ─────────────────────────────────")
        for row in candidates[:5]:
            ext_id  = build_external_id(row)
            title   = get_field(row, TITLE_FIELDS, "(no title)")
            rating  = parse_rating(get_field(row, RATING_FIELDS))
            tags    = parse_tags(get_field(row, TAGS_FIELDS, []))
            stmt    = get_field(row, STATEMENT_FIELDS, "")
            print(f"  [{ext_id}] {title} | rating={rating} | tags={tags[:3]}")
            print(f"          statement preview: {str(stmt)[:100]!r}")
        print(f"\nDry run complete. {len(candidates)} problems would be processed.")
        return

    # ── Clients ───────────────────────────────────────────────────────────────
    check_env()
    supabase    = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

    # ── Seed loop ─────────────────────────────────────────────────────────────
    seeded = skipped = failed = api_calls_today = 0
    today  = date.today().isoformat()
    print(f"\n🚀 Seeding {len(candidates)} problems ...")
    print(f"   Rate: ~8 req/min | Daily cap guard: {DAILY_CAP} calls\n")

    for row in tqdm(candidates, desc="Seeding", unit="problem"):
        if api_calls_today >= DAILY_CAP:
            print(f"\n⚠️  Daily cap of {DAILY_CAP} reached. Re-run tomorrow to continue.")
            print(f"   Progress is saved — the script will skip already-seeded problems.")
            break

        external_id = build_external_id(row)
        title       = str(get_field(row, TITLE_FIELDS, external_id) or external_id)
        # Combine all sections into a complete problem statement
        _parts = []
        for _lbl, _fld in [("Problem", "description"), ("Input Format", "input_format"),
                            ("Output Format", "output_format"), ("Note", "note")]:
            _val = row.get(_fld)
            if _val and isinstance(_val, str) and _val.strip():
                _parts.append(f"{_lbl}:\n{_val.strip()}")
        statement = "\n\n".join(_parts)
        rating      = parse_rating(get_field(row, RATING_FIELDS))
        tags        = parse_tags(get_field(row, TAGS_FIELDS, []))

        if not statement or len(statement) < 50:
            tqdm.write(f"  ⬜ [{external_id}] No usable statement, skipping.")
            failed += 1
            continue

        if already_seeded(external_id, supabase):
            skipped += 1
            continue

        hints = generate_hints(statement, gemini_client)
        api_calls_today += 1

        if hints is None:
            tqdm.write(f"  ❌ [{external_id}] Hint generation failed after retries.")
            failed += 1
            time.sleep(SLEEP_SECS)
            continue

        try:
            supabase.table("competitive_problems").upsert(
                {
                    "external_id":       external_id,
                    "source":            "codeforces",
                    "title":             title,
                    "problem_statement": statement,
                    "difficulty":        rating,
                    "tags":              tags,
                    "hints":             hints,
                    "edge_cases":        [],
                    # embedding: NULL for now; populated in Phase 3
                },
                on_conflict="external_id",
            ).execute()
            seeded += 1
        except Exception as e:
            tqdm.write(f"  ❌ [{external_id}] DB error: {e}")
            failed += 1

        time.sleep(SLEEP_SECS)

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'─'*60}")
    print(f"✅  Seeded:  {seeded}")
    print(f"⬛  Skipped (already in DB): {skipped}")
    print(f"❌  Failed:  {failed}")
    print(f"📡  API calls today: {api_calls_today}")
    if seeded + skipped < len(candidates):
        remaining = len(candidates) - seeded - skipped - failed
        print(f"\n⏳  {remaining} problems remaining. Re-run to continue (idempotent).")
    else:
        print("\n🎉  All problems processed!")


if __name__ == "__main__":
    main()