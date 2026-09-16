#!/usr/bin/env python3
"""Prepare inactive, reviewable Codex configuration for Loginom shared memory.

Never installs hooks, grants trust, moves cursors, or writes active configuration.
"""
import argparse
import difflib
import hashlib
import json
import shlex
import tomllib
from pathlib import Path

HOOK_EVENTS = {
    "SessionStart": ("session_start", "clear|startup|resume", 70),
    "UserPromptSubmit": ("user_prompt_submit", "*", 130),
    "Stop": ("stop", "*", 30),
    "PreCompact": ("pre_compact", "*", 60),
    "SessionEnd": ("session_end", "*", 3),
}
WORKSPACES = (
    "node-11-replacement", "node-12-duplicates", "node-13-date-time", "node-14-missing-values"
)


def prepare(root: Path, output: Path, runtime: Path, node: Path, plugin: Path, state: Path, generation: str):
    root = root.resolve(strict=True)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    registry = json.loads((root / ".dock/node-streams-20260912/state.json").read_text())
    lanes = {lane["worktree"]: lane for lane in registry["lanes"]}
    route = {"version": 1, "projects": [{
        "projectRoot": str(root),
        "workspaces": [str(root / ".worktrees" / name) for name in WORKSPACES],
        "stateDir": str(state), "pluginRoot": str(plugin), "generation": generation,
    }]}
    manifest = {"status": "INACTIVE_PREPARATION", "routing": route, "tasks": [],
        "runtime": str(runtime), "node": str(node), "no_trust_granted": True,
        "active_configs_changed": False, "capture_cursors_changed": False,
        "generation": generation, "disablement_method": "project-plugin-disabled",
        "canonical_hooks_path": str(root / '.codex/hooks.json')}
    hooks = {"description": "Shared Loginom Dock memory; exact workspace routing, official scripts", "hooks": {}}
    for event, (_, matcher, timeout) in HOOK_EVENTS.items():
        command = " ".join(shlex.quote(str(x)) for x in (node, runtime / "hook-router.mjs", event))
        hooks["hooks"][event] = [{"matcher": matcher, "hooks": [{
            "type": "command", "command": command, "timeout": timeout,
        }]}]
    for name in WORKSPACES:
        worktree = root / ".worktrees" / name
        if worktree.is_symlink() or worktree.resolve(strict=True) != worktree:
            raise ValueError(f"Workspace must be exact and non-symlinked: {worktree}")
        lane = lanes[str(worktree)]
        source = worktree / ".codex/config.toml"
        original = source.read_text()
        parsed = tomllib.loads(original)
        if "hooks" in parsed or "openviking" in parsed.get("mcp_servers", {}) or \
                "openviking-memory@openviking" in parsed.get("plugins", {}) or (source.parent / "hooks.json").exists():
            raise ValueError(f"Existing project memory/hook configuration requires reconciliation: {worktree}")
        addition = "\n# Prepared shared project memory route; activation requires reviewed hooks.\n"
        addition += "[mcp_servers.openviking]\n"
        addition += "command = " + json.dumps(str(node)) + "\n"
        addition += "args = " + json.dumps([str(runtime / "server.mjs")]) + "\n"
        addition += "enabled = true\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\n"
        # Linked worktrees use the root checkout's hook declarations and state.
        # Plugin enablement remains local, so retire original hooks only here.
        addition += '\n[plugins."openviking-memory@openviking"]\nenabled = false\n'
        updated = original.rstrip() + "\n" + addition
        after = tomllib.loads(updated)
        for key, value in parsed.items():
            if key not in ("mcp_servers", "plugins"):
                assert after[key] == value
        for key, value in parsed.get("mcp_servers", {}).items():
            assert after["mcp_servers"][key] == value
        for key, value in parsed.get("plugins", {}).items():
            assert after["plugins"][key] == value
        target = output / name
        target.mkdir(exist_ok=True, mode=0o700)
        (target / "config.toml.pending").write_text(updated)
        (target / "config.diff").write_text("".join(difflib.unified_diff(
            original.splitlines(True), updated.splitlines(True), fromfile=str(source), tofile=str(source) + " (planned)")))
        manifest["tasks"].append({"node": lane["node"], "thread_id": lane["thread_id"],
            "cwd": str(worktree), "source_config_sha256": hashlib.sha256(original.encode()).hexdigest(),
            "target_config_sha256": hashlib.sha256(updated.encode()).hexdigest(),
            "pending_directory": str(target), "phase_at_preparation": lane["phase"]})
    (output / "hooks.json.pending").write_text(json.dumps(hooks, ensure_ascii=False, indent=2) + "\n")
    (output / "project-memory-routing.json.pending").write_text(json.dumps(route, indent=2) + "\n")
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": manifest["status"], "tasks": len(manifest["tasks"]),
        "output": str(output), "active_configuration_changed": False}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parents[2]
    parser.add_argument("--root", type=Path, default=root)
    parser.add_argument("--output", type=Path, default=root / ".dock/shared-project-memory/rollout-20260913.3")
    parser.add_argument("--runtime", type=Path, default=root / ".dock/shared-project-memory/runtime/20260913.3")
    parser.add_argument("--generation", default="20260913.3")
    parser.add_argument("--node", type=Path, default=Path.home() / ".local/bin/node")
    parser.add_argument("--plugin", type=Path, default=Path.home() / ".codex/plugins/cache/openviking/openviking-memory/0.8.1")
    parser.add_argument("--state", type=Path, default=Path.home() / ".openviking/project-states/loginom-dock")
    args = parser.parse_args()
    prepare(args.root, args.output, args.runtime, args.node, args.plugin, args.state, args.generation)
