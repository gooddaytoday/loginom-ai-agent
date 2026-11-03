"""run-check entrypoint for the independent ISO-calendar oracle."""
import json
from pathlib import Path
import runpy
import sys

oracle = runpy.run_path(str(Path(__file__).with_name('oracle-iso-weeks.py')))
result = oracle['expected']()
if len(sys.argv) > 1:
    result['package_path'] = sys.argv[1]
print(json.dumps(result, ensure_ascii=False))
