from datasets import load_dataset
ds = load_dataset("open-r1/codeforces", split="train")
print("Columns:", ds.column_names)
print()
row = ds[0]
for k, v in row.items():
    print(f"  {k!r}: {str(v)[:120]}")