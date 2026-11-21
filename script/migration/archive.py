"""Create a private, verified source archive without changing the source repository."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat

from inventory import git, require_snapshot, write_json


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_relative(value):
    path = Path(value)
    if path.is_absolute() or not path.parts or any(part in ("..", ".git") for part in path.parts):
        raise ValueError("UNSAFE_PATH")
    return path


def file_record(path):
    mode = path.lstat().st_mode
    if stat.S_ISLNK(mode):
        return {"kind": "symlink", "sha256": sha(os.fsencode(os.readlink(path))), "mode": stat.S_IMODE(mode)}
    if not stat.S_ISREG(mode):
        raise ValueError("UNSUPPORTED_FILE_TYPE")
    with path.open("rb") as file:
        checksum = hashlib.sha256()
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            checksum.update(chunk)
    return {"kind": "file", "sha256": checksum.hexdigest(), "mode": stat.S_IMODE(mode)}


def copy_entry(source, destination, root, files):
    if source.is_dir() and not source.is_symlink():
        destination.mkdir(parents=True, exist_ok=True, mode=0o700)
        for child in sorted(source.iterdir()):
            copy_entry(child, destination / child.name, root, files)
        return
    before = file_record(source)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if before["kind"] == "symlink":
        destination.symlink_to(os.readlink(source))
    else:
        with source.open("rb") as src, destination.open("xb") as dst:
            os.chmod(destination, 0o600)
            shutil.copyfileobj(src, dst)
    after = file_record(source)
    copied = file_record(destination)
    if before != after or copied["sha256"] != before["sha256"]:
        raise RuntimeError("SOURCE_CHANGED")
    files[destination.relative_to(root).as_posix()] = before


def allow_entries(value):
    entries = set()
    for item in value.get("files", []):
        safe_relative(item["path"])
        key = (item["worktree"], item["path"])
        if key in entries:
            raise ValueError("DUPLICATE_ALLOWLIST_ENTRY")
        entries.add(key)
    return entries


def create_archive(snapshot, destination, public, private):
    require_snapshot(snapshot)
    destination = Path(destination).resolve()
    for tree in snapshot["worktrees"]:
        if destination.is_relative_to(Path(tree["path"])):
            raise ValueError("ARCHIVE_INSIDE_SOURCE")
    public_entries = allow_entries(public)
    private_entries = allow_entries(private)
    excluded = {(item["worktree"], item["path"]): item["reason"] for item in private.get("excluded", [])}
    candidates = {(tree["path"], name) for tree in snapshot["worktrees"] for name in tree["untracked"] + tree["ignored"]}
    covered = public_entries | private_entries | set(excluded)
    if public_entries & private_entries or (public_entries | private_entries) & set(excluded):
        raise ValueError("CONFLICTING_DISPOSITION")
    if covered != candidates or any(not reason for reason in excluded.values()):
        raise ValueError("UNCLASSIFIED_FILES")
    # The archive and its manifest may contain private filenames and Git history.
    destination.mkdir(parents=True, mode=0o700)
    os.chmod(destination, 0o700)
    files = {}
    mirror = destination / "history.git"
    git(destination, "clone", "--mirror", "--no-hardlinks", snapshot["source"], str(mirror))
    roots = sorted(set(snapshot["reflogRoots"] + snapshot["stash"] + [tree["head"] for tree in snapshot["worktrees"]]))
    for number, oid in enumerate(roots):
        git(mirror, "cat-file", "-e", oid)
        git(mirror, "update-ref", f"refs/backup/roots/{number:06}", oid)
    git(mirror, "bundle", "create", str(destination / "history.bundle"), "--all")
    git(mirror, "bundle", "verify", str(destination / "history.bundle"))
    os.chmod(destination / "history.bundle", 0o600)
    files["history.bundle"] = file_record(destination / "history.bundle")
    worktrees = []
    for number, tree in enumerate(snapshot["worktrees"]):
        source = Path(tree["path"])
        base = destination / "worktrees" / str(number)
        base.mkdir(parents=True, mode=0o700)
        for name, args in [("staged.patch", ("--cached", "HEAD")), ("working.patch", ())]:
            patch = base / name
            patch.write_bytes(git(source, "diff", "--binary", "--no-ext-diff", "--no-textconv", *args))
            os.chmod(patch, 0o600)
            files[patch.relative_to(destination).as_posix()] = file_record(patch)
        index = Path(git(source, "rev-parse", "--path-format=absolute", "--git-path", "index").decode().strip())
        if index.exists():
            copy_entry(index, base / "index", destination, files)
        for category, entries in [("public", public_entries), ("private", private_entries)]:
            for worktree, name in sorted(entries):
                if worktree == tree["path"]:
                    # Parent symlinks must not turn a selected path into an external read.
                    relative = safe_relative(name)
                    if not (source / relative).parent.resolve().is_relative_to(source.resolve()):
                        raise ValueError("SOURCE_PATH_ESCAPE")
                    copy_entry(source / relative, base / category / relative, destination, files)
        worktrees.append({"head": tree["head"], "branch": tree["branch"], "archivePath": f"worktrees/{number}"})
    common = Path(snapshot["commonGitDir"])
    for name in ["config", "HEAD", "packed-refs", "logs", "worktrees"]:
        if (common / name).exists():
            copy_entry(common / name, destination / "git-metadata" / name, destination, files)
    for number, name in enumerate(private.get("external", [])):
        source = Path(name)
        if not source.is_absolute() or source.is_symlink() or not source.is_file():
            raise ValueError("INVALID_EXTERNAL_FILE")
        copy_entry(source, destination / "external" / str(number), destination, files)
    require_snapshot(snapshot)
    write_json(destination / "snapshot.json", snapshot)
    files["snapshot.json"] = file_record(destination / "snapshot.json")
    manifest = {"version": 1, "snapshotSha256": snapshot["sha256"], "refs": snapshot["refs"],
                "roots": roots, "worktrees": worktrees, "files": files, "excluded": private.get("excluded", [])}
    write_json(destination / "manifest.json", manifest)
    (destination / "manifest.sha256").write_text(sha((destination / "manifest.json").read_bytes()) + "\n")
    os.chmod(destination / "manifest.sha256", 0o600)
    return {"snapshotSha256": snapshot["sha256"], "files": len(files), "roots": len(roots), "worktrees": len(worktrees)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--public-allowlist", required=True)
    parser.add_argument("--private-allowlist", required=True)
    args = parser.parse_args()
    print(json.dumps(create_archive(json.loads(Path(args.snapshot).read_text()), args.destination,
                                    json.loads(Path(args.public_allowlist).read_text()),
                                    json.loads(Path(args.private_allowlist).read_text()))))
