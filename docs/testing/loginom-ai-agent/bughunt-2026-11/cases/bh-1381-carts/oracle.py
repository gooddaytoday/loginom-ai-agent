from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).resolve().parents[1] / "tree-1381-oracle.py"), init_globals={"CASE": Path(__file__).resolve().parent})
