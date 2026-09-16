"""Client source provenance shared by source checks and the VPS builder."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile


def git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root, stderr=subprocess.PIPE)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def packager(root):
    spec = importlib.util.spec_from_file_location("dock_packager", Path(__file__).with_name("package-client-source.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def inventory(root, revision="HEAD"):
    root = root.resolve()
    selection = packager(root)
    commit = git(root, "rev-parse", "--verify", f"{revision}^{{commit}}").decode().strip()
    committed = {}
    for record in git(root, "ls-tree", "-rz", commit).split(b"\0"):
        if not record:
            continue
        metadata, raw_name = record.split(b"\t", 1)
        name = raw_name.decode()
        if selection.is_client_source(name):
            mode, kind, oid = metadata.decode().split()
            committed[name] = (mode, kind, oid)
    files = []
    changed = []
    selected = selection.client_source_files(root)
    for name in sorted(set(selected) | set(committed)):
        path = root / name
        reference = committed.get(name)
        if name not in selected:
            changed.append({"path": name, "reason": "missing"})
            continue
        # Symlinks (including a symlinked parent) must never pull private data
        # into evidence or make a supposedly portable snapshot depend on a host.
        if path.is_symlink() or path.resolve() != path.absolute():
            raise ValueError(f"Symlink source input is unsupported: {name}")
        data = path.read_bytes()
        mode = "100755" if path.stat().st_mode & 0o111 else "100644"
        record = {"path": name, "sha256": sha(data), "bytes": len(data), "mode": mode}
        files.append(record)
        if reference is None:
            changed.append({"path": name, "reason": "untracked_at_commit"})
        elif reference[1] != "blob" or reference[0] != mode:
            changed.append({"path": name, "reason": "type_or_mode"})
        elif data != git(root, "cat-file", "blob", reference[2]):
            changed.append({"path": name, "reason": "content"})
    serialized = json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
    return {"source_commit": commit, "build_inputs_match_commit": not changed,
            "files": files, "inventory_sha256": sha(serialized), "differences": changed}


def tree_inventory(root):
    """Read actual extracted inputs without relying on Git's ignored file list."""
    root = root.resolve()
    selection = packager(root)
    files = []
    for base, directories, names in os.walk(root, followlinks=False):
        # These are never build inputs; dependencies are handled separately.
        kept = []
        for name in directories:
            if name in {"node_modules", "__pycache__", ".git"} or name.startswith(".env"):
                continue
            path = Path(base) / name
            prefix = path.relative_to(root).as_posix() + "/"
            relevant = any(prefix.startswith(d) or d.startswith(prefix) for d in selection.DIRECTORIES)
            relevant = relevant or any(p.startswith(prefix) for p in selection.INDIVIDUAL)
            if relevant:
                if path.is_symlink():
                    raise ValueError("Symlink source directory is unsupported")
                kept.append(name)
        directories[:] = kept
        for name in directories + names:
            path = Path(base) / name
            relative = path.relative_to(root).as_posix()
            if not selection.is_client_source(relative):
                continue
            if path.is_symlink():
                raise ValueError(f"Symlink source input is unsupported: {relative}")
            if path.is_dir():
                continue
            if not path.is_file():
                raise ValueError(f"Non-regular source input: {relative}")
            data = path.read_bytes()
            files.append({"path": relative, "sha256": sha(data), "bytes": len(data),
                          "mode": "100755" if path.stat().st_mode & 0o111 else "100644"})
    return sorted(files, key=lambda item: item["path"])


def committed_inventory(repository, revision):
    selection = packager(repository)
    commit = git(repository, "rev-parse", "--verify", f"{revision}^{{commit}}").decode().strip()
    files = []
    for record in git(repository, "ls-tree", "-rz", commit).split(b"\0"):
        if not record:
            continue
        metadata, raw_name = record.split(b"\t", 1)
        name = raw_name.decode()
        if not selection.is_client_source(name):
            continue
        mode, kind, oid = metadata.decode().split()
        if kind != "blob" or mode not in {"100644", "100755"}:
            raise ValueError(f"Non-regular committed input: {name}")
        data = git(repository, "cat-file", "blob", oid)
        files.append({"path": name, "sha256": sha(data), "bytes": len(data), "mode": mode})
    missing = selection.INDIVIDUAL - {item["path"] for item in files}
    if missing:
        raise ValueError("Commit lacks required build inputs: " + ", ".join(sorted(missing)))
    return commit, sorted(files, key=lambda item: item["path"])


def verify_clean_source(source, repository, revision):
    commit, expected = committed_inventory(repository, revision)
    if commit != revision:
        raise ValueError("A full exact commit SHA is required for clean builds")
    if tree_inventory(source) != expected:
        raise ValueError("Extracted build inputs do not match the source commit")
    return {"source_commit": commit, "files": expected,
            "inventory_sha256": sha(json.dumps(expected, sort_keys=True, separators=(",", ":")).encode())}


BUILD_ONLY = {"deploy/loginom-dock/build-client-bundle.py", "deploy/loginom-dock/package-client-source.py",
              "deploy/loginom-dock/client-source-inventory.py"}


def verify_staged_source(target, proof):
    expected = [item for item in proof["files"] if item["path"] not in BUILD_ONLY]
    if tree_inventory(target) != expected:
        raise ValueError("Staged build inputs changed after source verification")


def verify_archive(archive, expected):
    rows = []
    with tarfile.open(archive, "r:gz") as snapshot:
        for member in snapshot:
            if not member.isfile() or member.name.startswith("/") or ".." in Path(member.name).parts:
                raise ValueError("Unsafe or non-regular source archive entry")
            data = snapshot.extractfile(member).read()
            rows.append({"path": member.name, "sha256": sha(data), "bytes": len(data),
                         "mode": "100755" if member.mode & 0o111 else "100644"})
    if sorted(rows, key=lambda item: item["path"]) != expected:
        raise ValueError("Source archive differs from recorded build inputs")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Verify source archive bytes and file inventory without extracting it")
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    report = json.loads(args.manifest.read_text())
    if report["archive_sha256"] != sha(args.archive.read_bytes()):
        raise ValueError("Source archive SHA mismatch")
    verify_archive(args.archive, report["source"]["files"])
    print(json.dumps({"verified": True, "source_commit": report["source"]["source_commit"],
                      "files": len(report["source"]["files"]),
                      "commit_equality_claim_is_not_authenticated": True}))


if __name__ == "__main__":
    main()
