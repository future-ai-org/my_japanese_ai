#!/usr/bin/env python3

"""Print TypeScript, Python, and combined coverage totals."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TS_SUMMARY = ROOT / ".coverage" / "js" / "coverage-summary.json"
PY_SUMMARY = ROOT / ".coverage" / "python-summary.json"


def pct(covered: int, total: int) -> float:
    return 100.0 * covered / total if total else 100.0


def main() -> int:
    missing = [path for path in (TS_SUMMARY, PY_SUMMARY) if not path.is_file()]
    if missing:
        print("🐟 Coverage totals are unavailable; missing:", file=sys.stderr)
        for path in missing:
            print(f"  {path}", file=sys.stderr)
        return 1

    ts = json.loads(TS_SUMMARY.read_text())["total"]["lines"]
    py = json.loads(PY_SUMMARY.read_text())["totals"]

    ts_covered = int(ts["covered"])
    ts_total = int(ts["total"])
    ts_pct = pct(ts_covered, ts_total)

    py_total = int(py["num_statements"])
    py_pct = float(py["percent_covered"])

    combined_pct = (ts_pct * ts_total + py_pct * py_total) / (ts_total + py_total)

    print()
    print("🐟 Coverage totals:")
    print()
    print(f"  TypeScript  {ts_pct:6.2f}%")
    print(f"  Python      {py_pct:6.2f}%")
    print(f"  Combined    {combined_pct:6.2f}%")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
