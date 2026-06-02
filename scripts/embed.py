"""
scripts/embed.py
Embed all competitive_problems rows that have embedding IS NULL.
Uses gemini-embedding-001 (768-d via MRL, L2-normalised).
Respects 1 000 RPD free quota: --batch-size controls per-run ceiling.

Usage:
  python scripts/embed.py                      # embeds up to 950 problems
  python scripts/embed.py --batch-size 200     # embed 200 today
  python scripts/embed.py --dry-run            # count nulls, no API calls

Requirements (in requirements_seed.txt or a venv):
  google-genai
  supabase>=2.0
  python-dotenv
  numpy
"""

import argparse
import math
import os
import sys
import time

import numpy as np
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))

# ── Imports after env load ────────────────────────────────────────────────────

try:
    from google import genai
    from google.genai import types
except ImportError:
    sys.exit("Missing google-genai. Run: pip install google-genai")

try:
    from supabase import create_client
except ImportError:
    sys.exit("Missing supabase. Run: pip install supabase")

# ── Config ────────────────────────────────────────────────────────────────────

GEMINI_API_KEY  = os.environ.get("GEMINI_API_KEY", "")
SUPABASE_URL    = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

EMBED_MODEL     = "models/gemini-embedding-001"
TASK_TYPE       = "RETRIEVAL_DOCUMENT"
OUTPUT_DIM      = 768          # MRL truncation target
SLEEP_BETWEEN   = 1.2          # seconds between calls → ~50 RPM, well under 1500 RPM limit
DEFAULT_BATCH   = 950          # safe daily ceiling (under 1K RPD)

# ── Helpers ───────────────────────────────────────────────────────────────────

def l2_normalise(vec: list[float]) -> list[float]:
    arr = np.array(vec, dtype=np.float32)
    norm = np.linalg.norm(arr)
    if norm == 0:
        return vec
    return (arr / norm).tolist()


def embed_text(client: genai.Client, text: str) -> list[float]:
    """Call Gemini embedding API, return 768-d L2-normalised vector."""
    result = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
        config=types.EmbedContentConfig(
            task_type=TASK_TYPE,
            output_dimensionality=OUTPUT_DIM,
        )
    )
    return l2_normalise(result.embeddings[0].values)


def build_embed_input(row: dict) -> str:
    """Construct the text we embed for a problem row."""
    parts = [row.get("title", "")]
    if row.get("tags"):
        parts.append("Tags: " + ", ".join(row["tags"]))
    if row.get("difficulty"):
        parts.append(f"Difficulty: {row['difficulty']}")
    # Truncate statement to ~2000 chars — model handles more but keeps cost stable
    stmt = (row.get("problem_statement") or "")[:2000]
    parts.append(stmt)
    return "\n".join(p for p in parts if p)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Embed competitive_problems rows")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH,
                        help=f"Max rows to embed per run (default {DEFAULT_BATCH})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Count null-embedding rows and exit without API calls")
    args = parser.parse_args()

    if not GEMINI_API_KEY:
        sys.exit("GEMINI_API_KEY not set in .env.local")
    if not SUPABASE_URL or not SUPABASE_KEY:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local")

    # Initialize the new SDK client
    client = genai.Client(api_key=GEMINI_API_KEY)
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Count rows needing embedding
    count_res = (
        supabase.table("competitive_problems")
        .select("id", count="exact")
        .is_("embedding", "null")
        .execute()
    )
    null_count = count_res.count or 0
    print(f"Rows with null embedding: {null_count}")

    if args.dry_run or null_count == 0:
        print("Dry run or nothing to embed — exiting.")
        return

    to_process = min(null_count, args.batch_size)
    estimated_minutes = math.ceil(to_process * SLEEP_BETWEEN / 60)
    print(f"Will embed {to_process} rows (~{estimated_minutes} min at {SLEEP_BETWEEN}s/call)")

    # Fetch rows in pages of 100
    PAGE = 100
    processed = 0
    errors = 0
    offset = 0

    while processed < to_process:
        page_limit = min(PAGE, to_process - processed)
        rows = (
            supabase.table("competitive_problems")
            .select("id, title, problem_statement, tags, difficulty")
            .is_("embedding", "null")
            .limit(page_limit)
            .offset(offset)
            .execute()
            .data
        )
        if not rows:
            break

        for row in rows:
            if processed >= to_process:
                break
            try:
                text = build_embed_input(row)
                # Pass the client explicitly
                vec = embed_text(client, text)
                supabase.table("competitive_problems").update(
                    {"embedding": vec}
                ).eq("id", row["id"]).execute()
                processed += 1
                print(f"  [{processed}/{to_process}] {row['id'][:8]}… ✓")
            except Exception as e:
                errors += 1
                print(f"  [{processed}/{to_process}] {row['id'][:8]}… ERROR: {e}")
                # On rate-limit (429) sleep longer
                if "429" in str(e) or "quota" in str(e).lower():
                    print("  Rate limit hit — sleeping 60s")
                    time.sleep(60)
                    continue

            time.sleep(SLEEP_BETWEEN)

        offset += len(rows)

    print(f"\nDone. Embedded: {processed}, Errors: {errors}")
    if null_count - processed > 0:
        remaining = null_count - processed
        print(f"{remaining} rows still need embedding — run again tomorrow (1K RPD limit).")


if __name__ == "__main__":
    main()