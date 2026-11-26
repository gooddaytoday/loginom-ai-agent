import subprocess
import sys
from pathlib import Path

case = Path(__file__).resolve().parent
subprocess.run([sys.executable, case.parent / "wave4b_oracle.py", case.parent, case.name], check=True)
