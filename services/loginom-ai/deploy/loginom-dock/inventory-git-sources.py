#!/usr/bin/env python3
"""Create an independent byte/hash baseline from Git blobs and Git LFS pointers.

Reads object databases only; does not fetch, check out, or hydrate another copy.
Pass --repository NAME PATH COMMIT once per source, then --output BASELINE.json.
"""

import argparse
import hashlib
import json
import re
import subprocess


def inventory(path, revision):
    revision = subprocess.check_output(
        ["git", "-C", path, "rev-parse", "--verify", revision + "^{commit}"], text=True
    ).strip()
    entries = subprocess.check_output(["git", "-C", path, "ls-tree", "-rz", revision]).split(b"\0")
    files, gitlinks = [], []
    with subprocess.Popen(
        ["git", "-C", path, "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE
    ) as process:
        for entry in entries:
            if not entry:
                continue
            metadata, name = entry.split(b"\t", 1)
            mode, kind, oid = metadata.split()
            if kind == b"commit" and mode == b"160000":
                gitlinks.append(
                    {"path": name.decode(), "mode": mode.decode(), "commit": oid.decode()}
                )
                continue
            if kind != b"blob" or mode not in (b"100644", b"100755"):
                raise ValueError("Expected an ordinary file or Git link")
            process.stdin.write(oid + b"\n")
            process.stdin.flush()
            header = process.stdout.readline().split()
            size = int(header[2])
            data = process.stdout.read(size)
            assert len(data) == size and process.stdout.read(1) == b"\n"
            lfs = data.startswith(b"version https://git-lfs.github.com/spec/v1\n")
            if lfs:
                digest = re.search(rb"oid sha256:([0-9a-f]{64})", data)[1].decode()
                size = int(re.search(rb"size ([0-9]+)", data)[1])
            else:
                digest = hashlib.sha256(data).hexdigest()
            files.append(
                {
                    "path": name.decode(),
                    "mode": mode.decode(),
                    "size": size,
                    "sha256": digest,
                    "lfs": lfs,
                }
            )
        process.stdin.close()
        process.wait()
        assert process.returncode == 0
    return {"commit": revision, "files": files, "gitlinks": gitlinks}


def main():
    from pathlib import Path

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repository", action="append", nargs=3, required=True, metavar=("NAME", "PATH", "COMMIT")
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = {}
    for name, path, revision in args.repository:
        if name in result:
            parser.error("Repository names must be unique")
        result[name] = inventory(path, revision)
        print(name, len(result[name]["files"]), "files")
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    args.output.chmod(0o600)


if __name__ == "__main__":
    main()
