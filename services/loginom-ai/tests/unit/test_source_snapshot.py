import hashlib
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from openviking.parse.parsers.code.code import CodeRepositoryParser
from openviking.parse.parsers.code.source_snapshot import inspect_checkout
from openviking.storage.viking_fs._sync import _SyncMixin
from openviking_cli.utils.config.parser_config import CodeConfig


def commit(path: Path):
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    subprocess.run(["git", "-C", str(path), "add", "."], check=True)
    subprocess.run(
        [
            "git",
            "-C",
            str(path),
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-qm",
            "fixture",
        ],
        check=True,
    )


def test_checkout_manifest_records_revision_and_exact_bytes(tmp_path):
    (tmp_path / ".agents").mkdir()
    data = b"\xff\x00\r\n"
    (tmp_path / ".agents" / "fixture.lgp").write_bytes(data)
    commit(tmp_path)
    (tmp_path / "untracked").write_text("not in revision")
    manifest = inspect_checkout(tmp_path)
    assert len(manifest["commit"]) == 40
    assert manifest["files"] == [
        {
            "path": ".agents/fixture.lgp",
            "mode": "100644",
            "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
    ]


def test_checkout_manifest_fails_for_unhydrated_lfs(tmp_path):
    (tmp_path / "fixture.lgp").write_text(
        "version https://git-lfs.github.com/spec/v1\noid sha256:" + "0" * 64 + "\nsize 42\n"
    )
    commit(tmp_path)
    with pytest.raises(ValueError, match="Unhydrated Git LFS"):
        inspect_checkout(tmp_path)


def test_checkout_records_external_gitlink_without_importing_another_repo(tmp_path):
    (tmp_path / "README.md").write_text("fixture")
    commit(tmp_path)
    revision = inspect_checkout(tmp_path)["commit"]
    subprocess.run(
        [
            "git",
            "-C",
            str(tmp_path),
            "update-index",
            "--add",
            "--cacheinfo",
            "160000",
            revision,
            "ci/common",
        ],
        check=True,
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(tmp_path),
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-qm",
            "gitlink",
        ],
        check=True,
    )
    manifest = inspect_checkout(tmp_path)
    assert manifest["gitlinks"] == [{"path": "ci/common", "mode": "160000", "commit": revision}]
    assert [entry["path"] for entry in manifest["files"]] == ["README.md"]


@pytest.mark.asyncio
async def test_parser_keeps_source_only_fixture_out_of_search_view(tmp_path, monkeypatch):
    (tmp_path / "README.md").write_text("Package reference: fixture.lgp")
    (tmp_path / "fixture.lgp").write_bytes(b"PK\x00\xff")
    commit(tmp_path)

    class Files:
        def __init__(self):
            self.data = {}

        async def mkdir(self, *_args, **_kwargs):
            pass

        async def write_file_bytes(self, uri, data):
            self.data[uri] = data

    fs = Files()
    parser = CodeRepositoryParser()
    monkeypatch.setattr(parser, "_get_viking_fs", lambda: fs)
    monkeypatch.setattr(parser, "_create_temp_uri", lambda: "viking://temp/test")
    monkeypatch.setattr(
        "openviking.parse.parsers.code.code.get_openviking_config",
        lambda: SimpleNamespace(
            code=CodeConfig(preserve_source_files=True, source_only_extensions=[".lgp"])
        ),
    )
    result = await parser.parse(tmp_path)
    root = "viking://temp/test/repository"
    assert root + "/README.md" in fs.data
    assert root + "/fixture.lgp" not in fs.data
    assert fs.data[root + "/.source/fixture.lgp"] == b"PK\x00\xff"
    assert result.meta["source_file_count"] == 2


def test_source_only_extension_configuration_is_validated():
    CodeConfig(source_only_extensions=[".lgp", ".svg"]).validate()
    with pytest.raises(ValueError, match="source_only_extensions"):
        CodeConfig(source_only_extensions=".lgp").validate()


@pytest.mark.asyncio
async def test_refresh_updates_hidden_originals_without_changing_default_sync(tmp_path):
    class LocalTree(_SyncMixin):
        def path(self, uri):
            return tmp_path / uri.removeprefix("viking://")

        async def exists(self, uri, **kwargs):
            return self.path(uri).exists()

        async def ls(self, uri, **kwargs):
            return [{"name": p.name, "isDir": p.is_dir()} for p in self.path(uri).iterdir()]

        async def read_file(self, uri, **kwargs):
            return self.path(uri).read_bytes()

        async def stat(self, uri, **kwargs):
            return {"size": self.path(uri).stat().st_size}

        async def rm(self, uri, **kwargs):
            p = self.path(uri)
            shutil.rmtree(p) if p.is_dir() else p.unlink()

        async def mv(self, source, target, **kwargs):
            shutil.move(self.path(source), self.path(target))

    fs = LocalTree()
    source, target = "viking://temp/source", "viking://resources/target"
    for uri, content in [(source, b"new"), (target, b"old")]:
        path = fs.path(uri) / ".agents"
        path.mkdir(parents=True)
        (path / "SKILL.md").write_bytes(content)
    obsolete = fs.path(target) / ".obsolete"
    obsolete.write_text("removed from revision")
    await fs.sync_tree(source, target)
    assert (fs.path(target) / ".agents/SKILL.md").read_bytes() == b"old"
    assert obsolete.exists()
    await fs.sync_tree(source, target, include_hidden=True)
    assert (fs.path(target) / ".agents/SKILL.md").read_bytes() == b"new"
    assert not obsolete.exists()
