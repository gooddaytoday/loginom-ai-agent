import argparse
import json
from pathlib import Path

from sources import verify_map

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--map", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--transforms")
    args = parser.parse_args()
    transforms = json.loads(Path(args.transforms).read_text()) if args.transforms else None
    count = verify_map(json.loads(Path(args.map).read_text()), args.root, transforms)
    print(json.dumps({"status": "PASS", "verifiedFiles": count}))
