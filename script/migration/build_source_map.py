import argparse
import json
from pathlib import Path

from inventory import write_json
from restore_check import verify_archive
from sources import build_map

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--archive")
    # A live repository (or its .git dir) has no manifest: only the archive path is verified before reading.
    source.add_argument("--repository")
    parser.add_argument("--ref", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.archive:
        verify_archive(args.archive)
    value = build_map(Path(args.archive) / "history.git" if args.archive else args.repository, args.ref)
    write_json(args.output, value)
    print(json.dumps({"entries": len(value["files"]), "commit": value["files"][0]["commit"]}))
