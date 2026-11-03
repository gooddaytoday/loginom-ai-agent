#!/usr/bin/env python3
"""Independent MLE/LR oracle on the authored, balanced strict fixture."""
import argparse
import json
from pathlib import Path
import runpy

HERE = Path(__file__).resolve().parent
base = runpy.run_path(str(HERE.parent / "oracle.py"))
rows = base["source"](HERE / "data/selection.csv")
assert sum(r["Target"] == "yes" for r in rows) == 32
assert base["select"](rows)[0]["factors"] == ["X"]
assert base["select"](rows, entry=0.01, removal=0.2)[0]["factors"] == []
result = base["expected"](entry=0.01, removal=0.2, rows=rows)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("actual_csv", nargs="?", type=Path)
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
if args.actual_csv:
    base["check_csv"](args.actual_csv, result)
elif args.check:
    assert json.loads((HERE / "expected.json").read_text()) == result
    print("PASS: 64 rows, balanced target, default X versus strict intercept")
else:
    print(json.dumps(result, ensure_ascii=False, indent=2))
