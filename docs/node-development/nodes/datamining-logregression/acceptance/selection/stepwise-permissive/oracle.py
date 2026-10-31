#!/usr/bin/env python3
"""Use the independent selection oracle with the authored significance cutoffs."""
from pathlib import Path
import runpy
import sys

sys.argv += ["--entry", "0.95", "--removal", "0.99"]
runpy.run_path(str(Path(__file__).resolve().parents[1] / "oracle.py"), run_name="__main__")
