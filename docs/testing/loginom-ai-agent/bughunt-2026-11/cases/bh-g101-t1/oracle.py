from pathlib import Path
from runpy import run_path


folder = Path(__file__).resolve().parent
run_path(str(folder.parent / "oracle-g1.py"))["main"](folder)
