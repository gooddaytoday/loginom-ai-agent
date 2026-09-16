#!/usr/bin/env python3
"""Create a small, credential-free client source snapshot for server-side builds."""

import argparse
import gzip
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import tarfile
import tempfile
from pathlib import Path


DIRECTORIES = (
    "client/bin/",
    "client/lib/",
    "client/test/",
    "examples/memory-plugin-shared/lib/",
    "plugins/loginom-dock/",
    "plugins/loginom-dock-hermes/",
    "examples/codex-memory-plugin/",
)
INDIVIDUAL = {
    "client/package.json",
    "client/package-lock.json",
    "client/.node-version",
    "client/README.md",
    "client/INSTALL.md",
    ".agents/plugins/marketplace.json",
    "LICENSE",
    "README_UPSTREAM.md",
    "deploy/loginom-dock/build-client-bundle.py",
    "deploy/loginom-dock/package-client-source.py",
    "deploy/loginom-dock/client-source-inventory.py",
    "deploy/loginom-dock/build-action-catalog.mjs",
    "deploy/loginom-dock/publish-action-catalog.py",
    "executor/capability-abi.json",
    "executor/catalog/actions.json",
    "executor/catalog/selectors.json",
    "executor/catalog/source-index.json",
    "executor/catalog/compatibility.json",
    "executor/schemas/action-catalog.schema.json",
    "executor/schemas/selector-catalog.schema.json",
    "executor/schemas/catalog-manifest.schema.json",
    "executor/schemas/session-manifest.schema.json",
    "executor/schemas/replay-acceptance.schema.json",
    "landing/instructions.mjs",
    "landing/release.json",
    "landing/hero.mjs",
    "landing/hero-cycle.mjs",
    "landing/hero-selection.mjs",
    "landing/flow-interaction.mjs",
    "landing/variants/engine.mjs",
    "landing/variants/clouds.mjs",
    "landing/variants/glyphs.mjs",
    "landing/variants/ribbons.mjs",
    "landing/variants/voids.mjs",
    "landing/variants/voids-geometry.mjs",
    "tools/loginom-acceptance/rename_effect.py",
    "tools/loginom-acceptance/collapse/review-fix/loaded-runtime-sources.json",
    "tools/loginom-acceptance/collapse/variant-contract/observed.json",
}

def is_client_source(name):
    """Shared selection rule for the working tree and committed input inventory."""
    return bool(name) and (name in INDIVIDUAL or name.startswith(DIRECTORIES)) and not any(
        part in {"node_modules", "__pycache__", ".git"} or part.startswith(".env")
        for part in Path(name).parts
    )


def client_source_files(root):
    """Select only build inputs, including data required by isolated client tests."""
    known = (
        subprocess.check_output(
            ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=root
        )
        .decode()
        .split("\0")
    )
    files = []
    for name in sorted(set(known)):
        path = Path(name)
        if not is_client_source(name):
            continue
        if (root / path).is_file() or (root / path).is_symlink():
            files.append(name)
    if "client/lib/hooks.mjs" not in files:
        raise SystemExit("Client sources are excluded by Git rules")
    missing = INDIVIDUAL.difference(files)
    if missing:
        raise SystemExit(
            "Required client build inputs are missing or excluded: " + ", ".join(sorted(missing))
        )
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--commit", default="HEAD")
    parser.add_argument("--require-clean", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    spec = importlib.util.spec_from_file_location("dock_source_inventory", Path(__file__).with_name("client-source-inventory.py"))
    provenance = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(provenance)
    # Resolve provenance before publishing any archive; never infer a commit
    # from an operator-supplied clean/dirty flag.
    try:
        sources = provenance.inventory(root, args.commit)
    except subprocess.CalledProcessError:
        raise SystemExit("A resolvable Git commit is required to package source provenance")
    if args.require_clean and not sources["build_inputs_match_commit"]:
        raise SystemExit("Build inputs do not match the requested source commit")
    files = sources["files"]
    sidecar = Path(str(args.output) + ".manifest.json")
    if args.output.exists() or args.output.is_symlink() or sidecar.exists() or sidecar.is_symlink():
        raise SystemExit("Source archive and manifest outputs must be new paths")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".dock-source-", dir=args.output.parent) as temporary:
        staged = Path(temporary) / "source.tar.gz"
        with (
            staged.open("wb") as stream,
            gzip.GzipFile(filename="", fileobj=stream, mode="wb", mtime=0) as zipped,
            tarfile.open(fileobj=zipped, mode="w|") as tar,
        ):
            for record in files:
                name = record["path"]
                path = root / name
                if path.is_symlink() or path.resolve() != path.absolute():
                    raise ValueError("Source input became a symlink during packaging")
                data = path.read_bytes()
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = 0o755 if path.stat().st_mode & 0o111 else 0o644
                tar.addfile(info, io.BytesIO(data))
        provenance.verify_archive(staged, files)
        if provenance.inventory(root, args.commit) != sources:
            raise ValueError("Source inputs changed during packaging")
        report = {"schema_version": 1, "archive_sha256": provenance.sha(staged.read_bytes()), "source": sources}
        manifest = Path(temporary) / "manifest.json"
        manifest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        os.link(staged, args.output)
        try:
            os.link(manifest, sidecar)
        except OSError:
            args.output.unlink()
            raise
    print(
        json.dumps(
            {
                "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
                "files": len(files),
                "bytes": args.output.stat().st_size,
                "manifest": str(sidecar),
                "source_commit": sources["source_commit"],
                "build_inputs_match_commit": sources["build_inputs_match_commit"],
            }
        )
    )


if __name__ == "__main__":
    main()
