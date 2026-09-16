"""Read-only migration snapshot. File contents and Git remote credentials stay private."""

import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import subprocess


def git(path, *args, input=None):
    result = subprocess.run(
        ["git", "-C", str(path), *args], input=input, capture_output=True,
        env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"},
    )
    if result.returncode:
        # Git errors can quote credentials/config values; never relay their bodies.
        raise RuntimeError(f"GIT_FAILED: {args[0]} ({result.returncode})")
    return result.stdout


def names(data):
    return [value.decode("utf-8", "surrogateescape") for value in data.split(b"\0") if value]


def metadata(path):
    if not path.exists() and not path.is_symlink():
        return None
    stat = path.lstat()
    return {"mode": stat.st_mode, "size": stat.st_size, "mtimeNs": stat.st_mtime_ns}


def scan(source):
    source = Path(source).resolve()
    common = git(source, "rev-parse", "--path-format=absolute", "--git-common-dir").decode().strip()
    refs = dict(line.split(" ", 1) for line in git(
        source, "for-each-ref", "--format=%(refname) %(objectname)"
    ).decode().splitlines())
    worktrees = []
    for block in git(source, "-c", "core.quotePath=false", "worktree", "list", "--porcelain").decode().split("\n\n"):
        fields = block.splitlines()
        if not fields:
            continue
        record = dict(field.split(" ", 1) if " " in field else (field, True) for field in fields)
        if record["worktree"].startswith('"'):
            record["worktree"] = ast.literal_eval(record["worktree"])
        root = Path(record["worktree"])
        if not root.is_dir():
            raise RuntimeError("MISSING_WORKTREE")
        tracked = sorted(set(names(git(root, "ls-files", "--cached", "-z"))))
        untracked = sorted(names(git(root, "ls-files", "--others", "--exclude-standard", "-z")))
        ignored = sorted(names(git(root, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z")))
        worktrees.append({
            "path": str(root), "head": record["HEAD"], "branch": record.get("branch"),
            "status": names(git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all")),
            "tracked": tracked, "untracked": untracked, "ignored": ignored,
            "files": {name: metadata(root / name) for name in tracked + untracked},
        })
    roots = sorted(set(git(source, "reflog", "show", "--all", "--format=%H").decode().splitlines()))
    stash = git(source, "reflog", "show", "refs/stash", "--format=%H").decode().splitlines() if "refs/stash" in refs else []
    return {"version": 1, "source": str(source), "commonGitDir": common,
            "refs": refs, "reflogRoots": roots, "stash": stash, "worktrees": worktrees}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def snapshot(source):
    first = scan(source)
    if first != scan(source):
        raise RuntimeError("SOURCE_CHANGED")
    return {**first, "sha256": digest(first)}


def require_snapshot(value):
    content = {key: item for key, item in value.items() if key != "sha256"}
    if digest(content) != value.get("sha256"):
        raise RuntimeError("SNAPSHOT_HASH_MISMATCH")
    if scan(value["source"]) != content:
        raise RuntimeError("SOURCE_CHANGED")


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "x", encoding="utf-8") as file:
        os.chmod(path, 0o600)
        json.dump(value, file, ensure_ascii=True, indent=2)
        file.write("\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = snapshot(args.source)
    write_json(args.output, result)
    print(json.dumps({"sha256": result["sha256"], "worktrees": len(result["worktrees"]),
                      "refs": len(result["refs"]), "reflogRoots": len(result["reflogRoots"])}))
