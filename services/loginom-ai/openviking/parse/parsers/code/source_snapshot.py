# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: AGPL-3.0
"""Preserve the checked-out Git revision alongside its native search view."""

import asyncio
import hashlib
import json
import subprocess
from pathlib import Path

from openviking.parse.parsers.upload_utils import upload_directory

SOURCE_DIRECTORY = ".source"
SOURCE_MANIFEST = ".source-manifest.json"


def inspect_checkout(path: Path) -> dict:
    """Inventory committed regular files and reject unhydrated LFS pointers."""

    def git(*args):
        return subprocess.check_output(["git", "-C", str(path), *args], stderr=subprocess.DEVNULL)

    commit = git("rev-parse", "HEAD").decode().strip()
    entries = git("ls-tree", "-rz", "HEAD").split(b"\0")
    files = []
    gitlinks = []
    for entry in entries:
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        mode, kind, _oid = metadata.decode().split()
        relative = name.decode("utf-8")
        file = path / relative
        if kind == "commit" and mode == "160000":
            gitlinks.append({"path": relative, "mode": mode, "commit": _oid})
            continue
        if kind != "blob" or mode not in ("100644", "100755"):
            raise ValueError(f"Source snapshot requires regular files: {relative}")
        if file.is_symlink() or not file.resolve().is_relative_to(path.resolve()):
            raise ValueError(f"Unsafe source file: {relative}")
        digest = hashlib.sha256()
        size = 0
        with file.open("rb") as stream:
            prefix = stream.read(1024)
            if prefix.startswith(b"version https://git-lfs.github.com/spec/v1\n"):
                raise ValueError(f"Unhydrated Git LFS pointer: {relative}")
            digest.update(prefix)
            size += len(prefix)
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
                size += len(chunk)
        files.append({"path": relative, "mode": mode, "size": size, "sha256": digest.hexdigest()})
    return {
        "version": 1,
        "commit": commit,
        "originals": SOURCE_DIRECTORY,
        "files": files,
        "gitlinks": gitlinks,
    }


async def preserve_git_source(path: Path, target_uri: str, viking_fs) -> dict:
    """Use the existing VikingFS uploader; never clone or create another index."""
    manifest = await asyncio.to_thread(inspect_checkout, path)
    count, warnings = await upload_directory(
        path,
        f"{target_uri}/{SOURCE_DIRECTORY}",
        viking_fs,
        source_files=[entry["path"] for entry in manifest["files"]],
    )
    if warnings or count != len(manifest["files"]):
        raise ValueError("Incomplete original source upload")
    await viking_fs.write_file_bytes(
        f"{target_uri}/{SOURCE_MANIFEST}",
        (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode(),
    )
    return manifest
