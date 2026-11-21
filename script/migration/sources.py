"""Frozen Git source selection shared by import and provenance verification."""

import hashlib
import os
from pathlib import Path
import subprocess

from archive import safe_relative
from inventory import git


class Blobs:
    def __init__(self, repository):
        self.process = subprocess.Popen(["git", "-C", str(repository), "cat-file", "--batch"],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    def read(self, object_id):
        self.process.stdin.write(object_id.encode() + b"\n")
        self.process.stdin.flush()
        header = self.process.stdout.readline().split()
        if len(header) != 3 or header[1] != b"blob":
            raise ValueError("EXPECTED_BLOB")
        data = self.process.stdout.read(int(header[2]))
        if self.process.stdout.read(1) != b"\n":
            raise ValueError("INVALID_BLOB_STREAM")
        return data

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.process.stdin.close()
        self.process.stdout.close()
        self.process.wait()


def destination(name):
    if Path(name).name == "AGENTS.md" or name.startswith((".agents/", ".github/", ".claude-plugin/",
                                                          "plugins/", "agent-plugins/", "integrations/")):
        return "archive", "history.bundle"
    if name.startswith(("client/", "executor/", "tools/loginom-acceptance/", "examples/memory-plugin-shared/lib/")):
        return "active", "packages/loginom-runtime/" + name
    if name.startswith("landing/"):
        return "active", "apps/loginom-site/" + name[len("landing/"):]
    if name.startswith("examples/"):
        return "archive", "history.bundle"
    return "active", "services/loginom-ai/" + name


def build_map(repository, ref):
    commit = git(repository, "rev-parse", f"{ref}^{{commit}}").decode().strip()
    tree = git(repository, "rev-parse", f"{commit}^{{tree}}").decode().strip()
    files = []
    with Blobs(repository) as blobs:
        for row in git(repository, "ls-tree", "-rz", commit).split(b"\0"):
            if not row:
                continue
            info, raw_name = row.split(b"\t", 1)
            mode, kind, oid = info.decode().split()
            if kind != "blob":
                raise ValueError("UNSUPPORTED_SOURCE_OBJECT")
            name = raw_name.decode()
            disposition, target = destination(name)
            entry = {"sourceRepo": "loginom-dock", "ref": ref, "commit": commit, "tree": tree,
                     "sourcePath": name, "destination": target, "disposition": disposition,
                     "hash": hashlib.sha256(blobs.read(oid)).hexdigest(), "object": oid, "mode": mode}
            files.append(entry)
            if name in ("LICENSE", "README_UPSTREAM.md"):
                files.append({**entry, "destination": "packages/loginom-runtime/" + name})
    return {"version": 1, "files": files}


def validate_map(value):
    if value.get("version") != 1 or not isinstance(value.get("files"), list):
        raise ValueError("INVALID_SOURCE_MAP")
    destinations = set()
    for entry in value["files"]:
        safe_relative(entry["sourcePath"])
        safe_relative(entry["destination"])
        if entry["mode"] not in ("100644", "100755", "120000"):
            raise ValueError("UNSUPPORTED_SOURCE_MODE")
        if entry["disposition"] not in ("active", "archive", "excluded"):
            raise ValueError("INVALID_DISPOSITION")
        if entry["disposition"] != "active":
            continue
        if entry["destination"] in destinations:
            raise ValueError("DUPLICATE_DESTINATION")
        destinations.add(entry["destination"])


def require_target(root, name):
    path = root / safe_relative(name)
    if not path.parent.resolve().is_relative_to(root):
        raise ValueError("DESTINATION_PATH_ESCAPE")
    return path


def import_map(repository, value, root, dry_run=False):
    validate_map(value)
    root = Path(root).resolve()
    active = [entry for entry in value["files"] if entry["disposition"] == "active"]
    # Validate the complete batch before the first write.
    with Blobs(repository) as blobs:
        trees = {}
        for entry in active:
            target = require_target(root, entry["destination"])
            if target.exists() or target.is_symlink():
                raise ValueError("DESTINATION_EXISTS")
            if entry["commit"] not in trees:
                trees[entry["commit"]] = git(repository, "rev-parse", f'{entry["commit"]}^{{tree}}').decode().strip()
            if trees[entry["commit"]] != entry["tree"]:
                raise ValueError("SOURCE_TREE_MISMATCH")
            actual = git(repository, "rev-parse", f'{entry["commit"]}:{entry["sourcePath"]}').decode().strip()
            if actual != entry["object"]:
                raise ValueError("SOURCE_OBJECT_MISMATCH")
            data = blobs.read(actual)
            if hashlib.sha256(data).hexdigest() != entry["hash"]:
                raise ValueError("SOURCE_HASH_MISMATCH")
            if entry["mode"] == "120000":
                link = Path(os.fsdecode(data))
                if link.is_absolute() or not (target.parent / link).resolve().is_relative_to(root):
                    raise ValueError("SYMLINK_ESCAPE")
        if dry_run:
            return len(active)
        # Symlinks are created last so that they cannot redirect subsequent writes.
        for entry in sorted(active, key=lambda item: item["mode"] == "120000"):
            target = require_target(root, entry["destination"])
            target.parent.mkdir(parents=True, exist_ok=True)
            data = blobs.read(entry["object"])
            if entry["mode"] == "120000":
                target.symlink_to(os.fsdecode(data))
            else:
                with target.open("xb") as file:
                    file.write(data)
                target.chmod(0o755 if entry["mode"] == "100755" else 0o644)
    return len(active)


def verify_map(value, root, transforms=None):
    validate_map(value)
    root = Path(root).resolve()
    transforms = transforms or {}
    checked = 0
    for entry in value["files"]:
        if entry["disposition"] != "active":
            continue
        path = require_target(root, entry["destination"])
        if path.is_symlink() != (entry["mode"] == "120000"):
            raise ValueError("IMPORTED_FILE_TYPE_MISMATCH")
        if not path.is_symlink() and bool(path.stat().st_mode & 0o111) != (entry["mode"] == "100755"):
            raise ValueError("IMPORTED_MODE_MISMATCH")
        data = os.fsencode(os.readlink(path)) if path.is_symlink() else path.read_bytes()
        expected = entry["hash"]
        if entry["destination"] in transforms:
            record = transforms[entry["destination"]]
            if record["baseHash"] != expected or not record["reason"]:
                raise ValueError("INVALID_TRANSFORMATION")
            expected = record["hash"]
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f'IMPORTED_HASH_MISMATCH: {entry["destination"]}')
        checked += 1
    return checked
