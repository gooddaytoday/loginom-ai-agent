import json
from pathlib import Path
import sys

expected = json.loads(Path(__file__).with_name("expected.json").read_text())
expected["package_path"] = sys.argv[1]
print(json.dumps(expected, ensure_ascii=False))
