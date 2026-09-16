#!/usr/bin/env python3
"""Compare imported original bytes with an independently captured Git baseline."""

import argparse
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source", action="append")
    args = parser.parse_args()
    client = json.loads(args.client.read_text())
    baseline = json.loads(args.baseline.read_text())
    base = client["endpoint"].removesuffix("/mcp")

    def download(uri):
        return urlopen(
            Request(
                base + "/api/v1/content/download?uri=" + quote(uri, safe=""),
                headers={"Authorization": "Bearer " + client["api_key"]},
            ),
            timeout=300,
        )

    results = {}
    for name in args.source or baseline:
        expected = baseline[name]
        root = "viking://resources/loginom-dock/sources/" + name
        with download(root + "/.source-manifest.json") as response:
            manifest = json.load(response)
        assert manifest["commit"] == expected["commit"], name + ": revision mismatch"
        assert manifest["gitlinks"] == expected["gitlinks"], name + ": Git link mismatch"
        fields = ("path", "mode", "size", "sha256")
        originals = [{k: f[k] for k in fields} for f in expected["files"]]
        assert manifest["files"] == originals, name + ": file inventory mismatch"

        def check(entry, root=root):
            digest = hashlib.sha256()
            size = 0
            with download(root + "/.source/" + entry["path"]) as response:
                for chunk in iter(lambda: response.read(1024 * 1024), b""):
                    digest.update(chunk)
                    size += len(chunk)
            assert size == entry["size"], entry["path"] + ": size mismatch"
            assert digest.hexdigest() == entry["sha256"], entry["path"] + ": SHA-256 mismatch"
            return size

        with ThreadPoolExecutor(max_workers=4) as pool:
            sizes = list(pool.map(check, originals))
        results[name] = {
            "commit": manifest["commit"],
            "verified_files": len(sizes),
            "verified_bytes": sum(sizes),
            "lfs_files": sum(f.get("lfs", False) for f in expected["files"]),
            "status": "passed",
        }
        print(json.dumps({name: results[name]}), flush=True)
    args.output.write_text(json.dumps(results, indent=2) + "\n")
    args.output.chmod(0o600)


if __name__ == "__main__":
    main()
