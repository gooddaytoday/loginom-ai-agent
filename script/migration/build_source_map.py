import argparse
import json
from pathlib import Path

from inventory import write_json
from restore_check import verify_archive
from sources import build_map

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--ref", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    verify_archive(args.archive)
    value = build_map(Path(args.archive) / "history.git", args.ref)
    write_json(args.output, value)
    print(json.dumps({"entries": len(value["files"]), "commit": value["files"][0]["commit"]}))
