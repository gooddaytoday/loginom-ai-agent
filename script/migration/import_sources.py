import argparse
import json
from pathlib import Path

from restore_check import verify_archive
from sources import import_map

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--map", required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    verify_archive(args.archive)
    count = import_map(Path(args.archive) / "history.git", json.loads(Path(args.map).read_text()),
                       args.destination, args.dry_run)
    print(json.dumps({"status": "VALIDATED" if args.dry_run else "IMPORTED", "files": count}))
