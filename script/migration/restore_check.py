"""Restore every source worktree into a new private directory and verify it."""

import argparse
import json
import os
from pathlib import Path
import shutil

from archive import file_record, safe_relative, sha
from inventory import git, write_json


def verify_archive(archive):
    archive = Path(archive).resolve()
    content = (archive / "manifest.json").read_bytes()
    if sha(content) != (archive / "manifest.sha256").read_text().strip():
        raise ValueError("MANIFEST_HASH_MISMATCH")
    manifest = json.loads(content)
    if manifest["version"] != 1:
        raise ValueError("UNSUPPORTED_MANIFEST")
    for name, expected in manifest["files"].items():
        path = archive / safe_relative(name)
        if not path.parent.resolve().is_relative_to(archive):
            raise ValueError("ARCHIVE_PATH_ESCAPE")
        actual = file_record(path)
        if actual["kind"] != expected["kind"] or actual["sha256"] != expected["sha256"]:
            raise ValueError("FILE_HASH_MISMATCH")
    return manifest


def restore_archive(archive, destination):
    archive = Path(archive).resolve()
    manifest = verify_archive(archive)
    destination = Path(destination).resolve()
    destination.mkdir(parents=True, mode=0o700)
    os.chmod(destination, 0o700)
    mirror = destination / "history.git"
    git(destination, "clone", "--mirror", str(archive / "history.bundle"), str(mirror))
    git(mirror, "bundle", "verify", str(archive / "history.bundle"))
    for name, oid in manifest["refs"].items():
        if git(mirror, "rev-parse", name).decode().strip() != oid:
            raise ValueError("REF_MISMATCH")
    for oid in manifest["roots"]:
        git(mirror, "cat-file", "-e", oid)
    for number, tree in enumerate(manifest["worktrees"]):
        root = destination / "worktrees" / str(number)
        root.parent.mkdir(exist_ok=True, mode=0o700)
        git(destination, "clone", "--no-hardlinks", "--no-checkout", str(mirror), str(root))
        git(root, "checkout", "--detach", tree["head"])
        base = archive / tree["archivePath"]
        for name, args in [("staged.patch", ("--index",)), ("working.patch", ())]:
            if (base / name).stat().st_size:
                git(root, "apply", "--binary", *args, str(base / name))
        for category in ["public", "private"]:
            prefix = f'{tree["archivePath"]}/{category}/'
            for name, expected in sorted(manifest["files"].items(), key=lambda item: item[1]["kind"] == "symlink"):
                if not name.startswith(prefix):
                    continue
                target = root / safe_relative(name[len(prefix):])
                if not target.parent.resolve().is_relative_to(root):
                    raise ValueError("RESTORE_PATH_ESCAPE")
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                if target.exists() or target.is_symlink():
                    raise ValueError("RESTORE_OVERWRITE")
                if expected["kind"] == "symlink":
                    target.symlink_to(os.readlink(archive / name))
                else:
                    shutil.copyfile(archive / name, target)
                    os.chmod(target, expected["mode"])
                if file_record(target) != expected:
                    raise ValueError("RESTORED_FILE_MISMATCH")
        for name, args in [("staged.patch", ("--cached", "HEAD")), ("working.patch", ())]:
            if git(root, "diff", "--binary", "--no-ext-diff", "--no-textconv", *args) != (base / name).read_bytes():
                raise ValueError("RESTORED_DIFF_MISMATCH")
    for name, expected in manifest["files"].items():
        if not name.startswith(("external/", "git-metadata/")):
            continue
        target = destination / safe_relative(name)
        if not target.parent.resolve().is_relative_to(destination):
            raise ValueError("RESTORE_PATH_ESCAPE")
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if expected["kind"] == "symlink":
            target.symlink_to(os.readlink(archive / name))
        else:
            shutil.copyfile(archive / name, target)
            os.chmod(target, 0o600)
        if file_record(target)["sha256"] != expected["sha256"]:
            raise ValueError("RESTORED_PRIVATE_FILE_MISMATCH")
    return {"status": "PASS", "snapshotSha256": manifest["snapshotSha256"],
            "manifestSha256": sha((archive / "manifest.json").read_bytes()),
            "refs": len(manifest["refs"]), "roots": len(manifest["roots"]),
            "worktrees": len(manifest["worktrees"]), "verifiedFiles": len(manifest["files"])}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    result = restore_archive(args.archive, args.destination)
    write_json(args.report, result)
    print(json.dumps(result))
