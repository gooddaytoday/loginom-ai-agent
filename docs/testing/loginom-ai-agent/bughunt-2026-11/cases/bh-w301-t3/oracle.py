from pathlib import Path
from runpy import run_path

case = Path(__file__).resolve().parent
run_path(str(case.parent / "wave3-oracle.py"))["main"](case)
