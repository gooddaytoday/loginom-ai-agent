"""Apply classified product identifiers; imported upstream/server sources are separate."""

import json
from pathlib import Path
import re
import subprocess


GENERATED = ("packages/client/src/generated/", "packages/client/src/generated-effect/",
             "packages/sdk/js/src/gen/", "packages/sdk/js/src/v2/gen/", "packages/httpapi-codegen/test/generated/")
EXCLUDED = ("services/", "packages/loginom-runtime/", "apps/loginom-site/", "docs/",
            ".github/archived/", "packages/app/vendor/", "script/migration/")
PROVIDER_ENV = {"OPENCODE_API_KEY", "OPENCODE_GO_API_KEY"}


def transform(text, packages):
    # Exact workspace names, not a wildcard rewrite of external npm packages.
    text = re.sub(r"@opencode-ai/[a-zA-Z0-9_-]+", lambda match: packages.get(match[0], match[0]), text)
    text = re.sub(r"\bOPENCODE_[A-Z0-9_]+", lambda match: match[0] if match[0] in PROVIDER_ENV
                  else match[0].replace("OPENCODE_", "LOGINOM_AI_AGENT_", 1), text)
    for source, target in [
        ("packages/opencode", "packages/agent"),
        ("../opencode", "../agent"),
        ("ai.opencode.desktop", "com.loginom.aiagent"),
        ("opencode://", "loginom-ai-agent://"),
        ("@opencode/", "@loginom-ai-agent/"),
        ("opencode.json", "loginom-ai-agent.json"),
        ("opencode.db", "loginom-ai-agent.db"),
        ("opencode.settings", "loginom-ai-agent.settings"),
        ("opencode.updater", "loginom-ai-agent.updater"),
    ]:
        text = text.replace(source, target)
    # The leading dot must be a directory token, not a provider hostname.
    text = re.sub(r"(?<![a-zA-Z0-9])\.opencode(?=[/\\\s\"'`)]|$)", ".loginom-ai-agent", text)
    return text


def main():
    root = Path(__file__).resolve().parents[2]
    filenames = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
    packages = {}
    for name in filenames:
        if not name.endswith("package.json") or not name.startswith("packages/") or name.startswith(EXCLUDED):
            continue
        value = json.loads((root / name).read_text()).get("name", "")
        if value.startswith("@opencode-ai/"):
            packages[value] = value.replace("@opencode-ai/", "@loginom-ai-agent/", 1)
    changed = []
    for name in filenames:
        if not name or name.startswith(EXCLUDED + GENERATED) or name == "bun.lock":
            continue
        path = root / name
        if not path.is_file() or path.is_symlink():
            continue
        try:
            old = path.read_text()
        except UnicodeError:
            continue
        new = transform(old, packages)
        if name.startswith(("packages/app/", "packages/desktop/")):
            # The named OpenCode model providers retain their third-party brand.
            new = re.sub(r"\bOpenCode\b(?! (?:Zen|Go)\b)", "Loginom AI Agent", new)
        if old != new:
            path.write_text(new)
            changed.append(name)
    for source, target in [("packages/opencode", "packages/agent"), (".opencode", ".loginom-ai-agent")]:
        old, new = root / source, root / target
        if old.exists():
            if new.exists():
                raise ValueError("RENAME_DESTINATION_EXISTS")
            old.rename(new)
    config = root / ".loginom-ai-agent/opencode.jsonc"
    if config.exists():
        config.rename(config.with_name("loginom-ai-agent.jsonc"))
    print(json.dumps({"changedFiles": len(changed), "workspaceNames": packages}, ensure_ascii=False))


if __name__ == "__main__":
    main()
