"""
scripts/patch_sample_io.py
Patches sample_io for existing competitive_problems rows from the open-r1/codeforces dataset.

- SAFE: only updates sample_io. Never touches hints, embedding, or any other column.
- Your 650 embeddings are untouched.
- Idempotent: skips rows that already have sample_io.
- Runs entirely from the local HuggingFace dataset cache — zero API calls.

Usage:
  python scripts/patch_sample_io.py              # patch all rows missing sample_io
  python scripts/patch_sample_io.py --dry-run    # count rows, no DB writes
  pip install datasets supabase python-dotenv    # prerequisites
"""

import argparse
import json
import os
import sys
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))

try:
    from datasets import load_dataset
except ImportError:
    sys.exit("Missing `datasets`. Run: pip install datasets")

try:
    from supabase import create_client
except ImportError:
    sys.exit("Missing `supabase`. Run: pip install supabase")

SUPABASE_URL  = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# ── Build dataset lookup map ───────────────────────────────────────────────────

def build_examples_map() -> dict[str, list[dict]]:
    print("Loading open-r1/codeforces dataset (cached after first run)…")
    ds = load_dataset("open-r1/codeforces", split="train")  # removed trust_remote_code
    print(f"  Dataset loaded: {len(ds)} rows")

    lookup: dict[str, list[dict]] = {}

    for row in ds:
        # Dataset id is "852/A" — strip slash to get "852A" matching our external_id
        raw_id = (row.get("id") or "").strip()
        pid = raw_id.replace("/", "").upper()   # "852/A" → "852A"
        if not pid:
            continue

        samples: list[dict] = []
        for ex in (row.get("examples") or []):
            if isinstance(ex, dict):
                inp = ex.get("input", "")
                out = ex.get("output", "")
                if inp is not None and out is not None:
                    samples.append({"input": str(inp), "output": str(out)})

        if samples:
            lookup[pid] = samples

    print(f"  Problems with sample I/O in dataset: {len(lookup)}")
    return lookup

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Patch sample_io for seeded competitive_problems")
    parser.add_argument("--dry-run", action="store_true", help="Count matches, no DB writes")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. Fetch rows that need patching (sample_io IS NULL and external_id is set)
    rows = (
        supabase.table("competitive_problems")
        .select("id, external_id")
        .is_("sample_io", "null")
        .not_.is_("external_id", "null")
        .execute()
        .data
    )
    print(f"Rows missing sample_io: {len(rows)}")

    if args.dry_run or not rows:
        if args.dry_run:
            print("Dry run — no DB writes.")
        return

    # 2. Build dataset lookup
    examples_map = build_examples_map()

    # 3. Patch rows
    updated = 0
    skipped = 0

    for row in rows:
        ext_id = (row.get("external_id") or "").strip().upper()
        samples = examples_map.get(ext_id)

        if not samples:
            # Try without contest suffix (e.g. "1700A" → "1700A")
            # Some dataset entries may use numeric-only IDs; skip gracefully
            skipped += 1
            continue

        supabase.table("competitive_problems").update(
            {"sample_io": samples}
        ).eq("id", row["id"]).execute()

        updated += 1
        if updated % 50 == 0:
            print(f"  Patched {updated}/{len(rows)}…")

    print(f"\nDone. Updated: {updated}, Not found in dataset: {skipped}")
    if skipped:
        print(f"  ({skipped} problems had no matching sample I/O in the dataset — normal for some problem types)")


if __name__ == "__main__":
    main()