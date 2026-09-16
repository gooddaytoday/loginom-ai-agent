#!/usr/bin/env python3
"""Publish a reviewed Dock skill ZIP through the existing Skills API."""

import argparse
import hashlib
import json
import os
import uuid
import zipfile
import yaml
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--admin", type=Path, required=True)
    parser.add_argument("--endpoint", default="http://127.0.0.1:1933")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    credential = json.loads(args.admin.read_text())
    key = credential["user_key"]
    root = "viking://agent/skills/loginom-automation"
    archive = args.archive.read_bytes()
    with zipfile.ZipFile(args.archive) as package:
        original_main = package.read("SKILL.md").decode("utf-8")
        expected = {
            name: hashlib.sha256(package.read(name)).hexdigest()
            for name in package.namelist()
            if not name.endswith("/")
        }
    assert "SKILL.md" in expected

    def request(path, data=None, method=None, content_type="application/json"):
        req = Request(
            args.endpoint.rstrip("/") + path,
            data=data,
            method=method,
            headers={"Authorization": "Bearer " + key, "Content-Type": content_type},
        )
        with urlopen(req, timeout=360) as response:
            return json.load(response)["result"]

    query = urlencode({"target_uri": root, "include_integrity": "true"})
    path = "/api/v1/skills/loginom-automation?" + query
    try:
        previous = request(path)
    except HTTPError as error:
        if error.code != 404:
            raise SystemExit(f"Skill preflight failed (HTTP {error.code})") from None
        previous = None
    def matches(installed):
        if not installed:
            return False
        actual = {entry["path"]: entry["sha256"] for entry in installed["files"] if not entry["is_dir"]}
        # Native SkillLoader serializes YAML and strips outer body whitespace.
        # Verify header values and the entire body, not serialized YAML layout.
        def definition(text):
            _, header, body = text.split("---", 2)
            return yaml.safe_load(header), body.strip()
        return definition(original_main) == definition(installed["content"]) and all(
            actual.get(name) == digest for name, digest in expected.items() if name != "SKILL.md"
        )

    if matches(previous):
        report = {"uri": root, "revision": previous["revision"], "unchanged": True,
                  "package_sha256": hashlib.sha256(archive).hexdigest(),
                  "verified_source_files": len(expected), "manifest_entries": len(previous["files"])}
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))
        return
    boundary = "dock-" + uuid.uuid4().hex
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
        'filename="loginom-automation.zip"\r\nContent-Type: application/zip\r\n\r\n'
    ).encode() + archive + f"\r\n--{boundary}--\r\n".encode()
    upload = request(
        "/api/v1/resources/temp_upload", body, "POST", f"multipart/form-data; boundary={boundary}"
    )
    payload = {
        "temp_file_id": upload["temp_file_id"],
        "target_uri": root,
        "source_metadata": {
            "type": "loginom-dock",
            "path": "skills/loginom-automation",
            "package_sha256": hashlib.sha256(archive).hexdigest(),
            "upstream_commit": "51ce567d1e7c168f87277bc24fa48c522e333356",
            "upstream_uri": "viking://resources/loginom-dock/sources/ai-skills/.source/.agents/skills/loginom-automation",
        },
    }
    if previous is None:
        payload.update(wait=True, timeout=300)
    request(
        "/api/v1/skills/loginom-automation" if previous else "/api/v1/skills",
        json.dumps(payload).encode(),
        "PUT" if previous else "POST",
    )
    installed = request(path)
    assert matches(installed), "Published skill differs from reviewed content"
    report = {
        "uri": root,
        "revision": installed["revision"],
        "previous_revision": previous["revision"] if previous else None,
        "package_sha256": hashlib.sha256(archive).hexdigest(),
        "verified_source_files": len(expected),
        "manifest_entries": len(installed["files"]),
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except HTTPError as error:
        raise SystemExit(f"Skill publication failed (HTTP {error.code})") from None
