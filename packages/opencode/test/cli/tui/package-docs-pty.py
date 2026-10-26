"""Linux native TUI acceptance; scripted provider tests mechanics, not model routing.

Run from packages/agent with --binary /absolute/CLI and a new --artifacts directory.
Python is the external test driver; the product executes the shipped Node scripts.
"""

import argparse
import hashlib
import fcntl
import json
import os
import pathlib
import pty
import re
import select
import shutil
import signal
import sqlite3
import struct
import subprocess
import sys
import tempfile
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def processes(root_pid, observed):
    """Observe only this CLI's descendants; start ticks protect against PID reuse."""
    snapshot = {}
    for directory in pathlib.Path("/proc").iterdir():
        if not directory.name.isdigit():
            continue
        try:
            fields = (directory / "stat").read_text().rsplit(")", 1)[1].split()
            snapshot[int(directory.name)] = (int(fields[1]), fields[19])
        except (FileNotFoundError, ProcessLookupError):
            continue
    owned = {root_pid}
    while True:
        children = {pid for pid, (parent, _) in snapshot.items() if parent in owned}
        if children <= owned:
            break
        owned.update(children)
    for pid in owned:
        if pid not in snapshot:
            continue
        directory = pathlib.Path("/proc", str(pid))
        try:
            command = (directory / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")
        except (FileNotFoundError, ProcessLookupError):
            continue
        key = (pid, snapshot[pid][1])
        if command or key not in observed:
            observed[key] = command
    return snapshot


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", type=pathlib.Path, required=True)
    parser.add_argument("--artifacts", type=pathlib.Path, required=True)
    input_kind = parser.add_mutually_exclusive_group(required=True)
    input_kind.add_argument("--attachment", choices=["paste", "mention"])
    input_kind.add_argument("--text-permission", choices=["allow", "deny"])
    parser.add_argument("--reserved-diagnostics", choices=["skills", "commands"])
    parser.add_argument("--modified-skill", action="store_true")
    parser.add_argument("--full-report", action="store_true")
    parser.add_argument("--slash", action="store_true")
    args = parser.parse_args()
    assert sys.platform == "linux", "This acceptance driver requires Linux /proc and PTY"
    assert args.binary.is_absolute() and args.binary.is_file()
    assert args.artifacts.is_absolute()
    assert not args.full_report or (args.attachment and not args.modified_skill), "Full report requires an intact bundle and attachment"
    assert not args.slash or (args.attachment and not args.modified_skill), "Slash requires an intact bundle and attachment"
    args.artifacts.mkdir(mode=0o700)  # Never reuse another run's profile or results.
    # Discovery walks ancestors outside git. Keep the workspace outside the user's home.
    with tempfile.TemporaryDirectory(prefix="loginom-package-docs-pty-", dir="/tmp") as temporary:
        workspace = pathlib.Path(temporary)
        (args.artifacts / "roots.json").write_text(json.dumps({"workspace": str(workspace)}))
        try:
            run(args, workspace)
        finally:
            shutil.copytree(workspace, args.artifacts / "workspace", ignore=shutil.ignore_patterns(".test-bundle"))


def run(args, workspace):
    mode = args.attachment if args.attachment else "text-" + args.text_permission
    repo = pathlib.Path(__file__).resolve().parents[5]
    fixtures = repo / "packages/loginom-host/test/fixtures/package-docs"
    lgp = workspace / ("Сценарий PTY.LGP" if mode == "paste" else "sample.LGP")
    if mode.startswith("text-"):
        source = args.artifacts / "input"
        source.mkdir(mode=0o700)
        lgp = source / "Исходный сценарий.LGP"
    shutil.copyfile(fixtures / "demo.lgp", lgp)
    original = hashlib.sha256(lgp.read_bytes()).hexdigest()
    reserved = ["package-docs", "loginom-automation", "package_docs"]
    if args.reserved_diagnostics == "skills":
        for name in reserved:
            directory = workspace / ".agents/skills" / name
            directory.mkdir(parents=True)
            (directory / "SKILL.md").write_text(
                f"---\nname: {name}\ndescription: UNTRUSTED replacement.\n---\n\nUNTRUSTED BODY\n")
    home = args.artifacts / "home"
    home.mkdir(mode=0o700)
    profile = args.artifacts / "profile"
    profile.mkdir(mode=0o700)
    env = dict(os.environ, LOGINOM_AI_AGENT_PURE="1", LOGINOM_AI_AGENT_CLI_PROFILE=str(profile),
        TERM="xterm-256color", PATH="/nonexistent", HOME=str(home), XDG_CONFIG_HOME=str(home / "config"), XDG_DATA_HOME=str(home / "data"), XDG_CACHE_HOME=str(home / "cache"), XDG_STATE_HOME=str(home / "state"))
    env.pop("DISPLAY", None)
    if args.modified_skill:
        assert args.attachment and args.reserved_diagnostics == "skills", "Damage case requires attachment and reserved external copies"
        bundle = workspace / ".test-bundle"
        subprocess.run(["/usr/bin/cp", "--reflink=auto", "-a", str(args.binary.parent.parent / "resources/loginom"), str(bundle)], check=True)
        skill = bundle / "skills/package-docs/SKILL.md"
        skill.write_text(skill.read_text() + "\nMODIFIED PRODUCT SKILL\n")
        shutil.copyfile(skill, args.artifacts / "modified-SKILL.md")
        env["LOGINOM_AI_AGENT_CLI_BUNDLE"] = str(bundle)
    # Initialize profile metadata through the public CLI before adding model configuration.
    initialized = subprocess.run([str(args.binary), "loginom", "status", "--format", "json"],
        cwd=workspace, env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=30)
    (args.artifacts / "initial-status.stdout").write_bytes(initialized.stdout)
    (args.artifacts / "initial-status.stderr").write_bytes(initialized.stderr)
    assert initialized.returncode == 0, initialized.stderr.decode(errors="replace")
    requests = []
    finished = threading.Event()

    class Provider(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append(body)
            title = "Generate a title for this conversation" in json.dumps(body)
            extracted = any(
                message.get("role") == "tool" and message.get("tool_call_id") == "extract"
                for message in body.get("messages", [])
            )
            activated = any(
                message.get("role") == "tool" and message.get("tool_call_id") == "activate"
                for message in body.get("messages", [])
            )
            docs = any(tool["function"]["name"] == "package_docs_run" for tool in body.get("tools", []))
            activation_failed = activated and not docs
            delta = {"content": "PTY docs title" if title else "Skill недоступен." if activation_failed else "Структура извлечена."}
            finish = "stop"
            if not title and not extracted and not activation_failed:
                delta = {"tool_calls": [{"index": 0, "id": "extract" if docs else "activate", "type": "function",
                    "function": {"name": "package_docs_run" if docs else "skill",
                        "arguments": json.dumps({"operation": "extract", "lgp": str(lgp)} if docs else {"name": "package-docs"})}}]}
                finish = "tool-calls"
            emitted = any(message.get("tool_call_id") == "emit" for message in body.get("messages", []))
            if not title and extracted and args.full_report:
                responses = {message["tool_call_id"]: message.get("content", "")
                    for message in body.get("messages", []) if message.get("role") == "tool"}
                action = None
                if "skeleton" not in responses:
                    action = ("skeleton", "package_docs_run", {"operation": "skeleton", "lgp": str(lgp)})
                elif "draft" not in responses:
                    action = ("draft", "read", {"filePath": json.loads(responses["skeleton"])["report"]})
                elif "fill" not in responses:
                    draft = "\n".join(re.findall(r"^\d+: (.*)$", responses["draft"], re.M))
                    assert "PLACEHOLDER_PACKAGE_DESCRIPTION" in draft, "Read must return the generated draft"
                    content = draft.replace("PLACEHOLDER_PACKAGE_DESCRIPTION",
                        "Бизнес-назначение не указано. Источник читает data.lgd и передаёт таблицу Калькулятору. Формулы не указаны; результат выполнения неизвестен.").replace("PLACEHOLDER_MODULE_1_DESCRIPTION",
                        "Общая структура: Источник → Калькулятор. Источник настроен на файл data.lgd. Формулы Калькулятора не указаны. Описание подмоделей: подмодели отсутствуют.")
                    action = ("fill", "write", {"filePath": json.loads(responses["skeleton"])["report"], "content": content})
                elif "emit" not in responses:
                    action = ("emit", "package_docs_run", {"operation": "emit", "lgp": str(lgp), "format": "pdf"})
                if action:
                    delta = {"tool_calls": [{"index": 0, "id": action[0], "type": "function",
                        "function": {"name": action[1], "arguments": json.dumps(action[2])}}]}
                    finish = "tool-calls"
                else:
                    receipt = json.loads(responses["emit"])
                    assert pathlib.Path(receipt["output"]).is_file(), "Emit must return an existing report"
                    delta = {"content": "Отчёт опубликован: " + receipt["output"]}
            chunks = [{"id": "pty-docs", "object": "chat.completion.chunk", "choices": [
                {"index": 0, "delta": value, "finish_reason": reason}]} for value, reason in [(delta, None), ({}, finish)]]
            data = ("".join("data: " + json.dumps(chunk) + "\n\n" for chunk in chunks) + "data: [DONE]\n\n").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            if not title and (activation_failed or (emitted if args.full_report else extracted)):
                finished.set()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    config = {"model": "test/test-model", "formatter": False, "lsp": False,
        "permission": {"skill": "allow", "edit": "allow", "read": "ask", "external_directory": "ask"},
        "provider": {"test": {"name": "Test", "id": "test", "env": [], "npm": "@ai-sdk/openai-compatible",
            "models": {"test-model": {"id": "test-model", "name": "Test Model", "attachment": False,
                "reasoning": False, "temperature": False, "tool_call": True, "release_date": "2025-01-01",
                "limit": {"context": 100000, "output": 10000}, "cost": {"input": 0, "output": 0}, "options": {}}},
            "options": {"apiKey": "test-key", "baseURL": f"http://127.0.0.1:{server.server_port}/v1"}}}}
    if args.reserved_diagnostics == "commands":
        config["command"] = {name: {"template": "UNTRUSTED replacement command"} for name in reserved}
    configuration = profile / "config/loginom-ai-agent.json"
    configuration.write_text(json.dumps(config))
    configuration.chmod(0o600)
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 35, 120, 0, 0))
    child = subprocess.Popen([str(args.binary), str(workspace), "--headless", "--model", "test/test-model"],
        cwd=workspace, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    output = bytearray()
    observed = {}
    actions = []
    step = "setup"
    offset = 0
    forced = False
    deadline = time.monotonic() + 90

    def send(data, next_step):
        nonlocal offset, step
        os.write(master, data)
        actions.append({"step": next_step, "at": time.monotonic()})
        offset = len(output)
        step = next_step

    try:
        while child.poll() is None and time.monotonic() < deadline:
            processes(child.pid, observed)
            if select.select([master], [], [], 0.05)[0]:
                try:
                    chunk = os.read(master, 65536)
                except OSError:
                    # Renderer closure precedes backend/Host cleanup and process exit.
                    try:
                        child.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        pass
                    break
                output.extend(chunk)
                if b"\x1b[6n" in chunk:
                    os.write(master, b"\x1b[1;1R")
                if b"\x1b[c" in chunk:
                    os.write(master, b"\x1b[?1;2c")
            # Synchronize keystrokes with rendered state, not arbitrary sleeps.
            rendered = re.sub(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))", "", output[offset:].decode(errors="replace"))
            if step == "setup" and "Настроить Loginom сейчас?" in rendered:
                send(b"\r", "ready")  # The public wizard defaults to continuing without setup.
            elif step == "ready" and "Ask anything" in rendered:
                if args.slash:
                    send(b"/package-docs ", "slash-prefixed")
                elif mode.startswith("text-"):
                    send(f"Напиши документацию по локальному пакету {lgp}\r".encode(), "submitted")
                elif mode == "paste":
                    send(b"\x1b[200~" + str(lgp).encode() + b"\x1b[201~", "attached")
                else:
                    send(b"@sample", "autocomplete")
            elif step == "slash-prefixed" and "/package-docs" in rendered:
                if mode == "paste":
                    send(b"\x1b[200~" + str(lgp).encode() + b"\x1b[201~", "attached")
                else:
                    send(b"@sample", "autocomplete")
            elif step == "autocomplete" and lgp.name in rendered:
                send(b"\r", "attached")
            elif step == "attached" and ("[Loginom 1]" if mode == "paste" else "@" + lgp.name) in rendered:
                send(" Напиши документацию по приложенному пакету\r".encode(), "submitted")
            elif step == "submitted" and mode.startswith("text-") and "Access external directory" in rendered and "Allow once" in rendered:
                send(b"\x1b" if mode == "text-deny" else b"\r", "rejected" if mode == "text-deny" else "read")
            elif step == "read" and "Read " in rendered and "Path: " in rendered and lgp.name in rendered:
                (args.artifacts / "read-view.txt").write_text(rendered)
                send(b"\r", "submitted")
            elif step == "submitted" and args.full_report and "Read " in rendered and "Path: " in rendered and "report.md" in rendered:
                send(b"\r", "submitted")
            elif step == "rejected":
                database = profile / "data/loginom-ai-agent.db"
                if database.exists():
                    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as db:
                        parts = [json.loads(row[0]) for row in db.execute("select data from part")]
                    if any(part.get("type") == "tool" and part.get("tool") == "package_docs_run" and part.get("state", {}).get("status") == "error" for part in parts):
                        send(b"\x04", "exit")
            elif step == "submitted" and finished.is_set() and ("Skill недоступен." if args.modified_skill else "Отчёт опубликован:" if args.full_report else "Структура извлечена.") in rendered:
                send(b"\x04", "exit")
        forced = child.poll() is None
    finally:
        if child.poll() is None:
            forced = True
            os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
        os.close(master)
        server.shutdown()
        server.server_close()
        (args.artifacts / "terminal.txt").write_bytes(output)
        (args.artifacts / "provider.json").write_text(json.dumps(requests, ensure_ascii=False))
        (args.artifacts / "actions.json").write_text(json.dumps(actions))
        (args.artifacts / "processes.json").write_text(json.dumps([
            {"pid": pid, "startTicks": ticks, "command": command} for (pid, ticks), command in observed.items()]))

    snapshot = processes(child.pid, {})
    alive = [pid for pid, ticks in observed if pid in snapshot and snapshot[pid][1] == ticks]
    chromium = [command for command in observed.values() if re.search(r"chrom(e|ium)|/browsers/", command)]
    structures = list(workspace.glob(".work/package-docs/*/structure.json"))
    catalogs = [[tool["function"]["name"] for tool in body.get("tools", [])] for body in requests]
    # Standalone has no export command. Read-only persisted evidence complements public provider/output assertions.
    parts = []
    database = profile / "data/loginom-ai-agent.db"
    if database.exists():
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as db:
            parts = [json.loads(row[0]) for row in db.execute("select data from part")]
    files = [part for part in parts if part.get("type") == "file"]
    command_activation = next((part.get("metadata", {}).get("skill_activation") for part in parts
        if part.get("type") == "text" and part.get("metadata", {}).get("skill_activation")), None)
    terminal_plain = re.sub(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))", "", output.decode(errors="replace"))
    (args.artifacts / "terminal-plain.txt").write_text(terminal_plain)
    warnings = re.findall(r"Ignored external (skill|command) '([^']+)'", terminal_plain)
    result = {"binary": str(args.binary), "attachment": mode, "inputSha256": original, "code": child.returncode,
        "forced": forced, "step": step, "guard": (profile / ".writer").exists(), "alive": alive,
        "chromiumObserved": chromium, "catalogs": catalogs, "structures": [str(p) for p in structures],
        "files": files, "systemNodePythonUnavailable": True, "readPermission": "ask",
        "reservedDiagnostics": args.reserved_diagnostics, "modifiedSkill": args.modified_skill, "visibleWarnings": warnings,
        "reports": [str(p) for p in workspace.glob("*.lgp_report.pdf")], "fullReport": args.full_report,
        "slash": args.slash, "commandActivation": command_activation,
        "toolErrors": [part["state"]["error"] for part in parts if part.get("type") == "tool" and part.get("state", {}).get("status") == "error"]}
    (args.artifacts / "result.json").write_text(json.dumps(result, ensure_ascii=False))
    print(json.dumps(result, ensure_ascii=False))
    assert child.returncode == 0 and not forced and step == "exit", "TUI must exit normally after the rendered result"
    assert not result["guard"] and not alive and not chromium
    assert hashlib.sha256(lgp.read_bytes()).hexdigest() == original
    first = next(body for body in requests if body.get("tools"))
    if args.slash:
        assert any(tool["function"]["name"] == "package_docs_run" for tool in first["tools"]), "Native slash must apply docs before the first provider turn"
    system = "\n".join(message["content"] for message in first["messages"]
        if message.get("role") == "system" and isinstance(message.get("content"), str))
    discovered = re.findall(r"<skill>\s*<name>(.*?)</name>.*?<location>(.*?)</location>\s*</skill>", system, re.S)
    expected_names = ["customize-opencode"] if args.modified_skill else ["customize-opencode", "loginom-automation", "package-docs"]
    assert sorted(name for name, _ in discovered) == expected_names, "Workspace must expose only trusted, valid skills"
    assert "UNTRUSTED" not in system, "External reserved skill must not enter the model catalog"
    if args.reserved_diagnostics:
        expected = "skill" if args.reserved_diagnostics == "skills" else "command"
        assert any(kind == expected and name in reserved for kind, name in warnings), f"Ignored {expected} diagnostic must be visible in the native TUI"
    bundled = args.binary.parent.parent / "resources/loginom/skills"
    for name, location in discovered:
        if name != "customize-opencode":
            assert location == str(bundled / name / "SKILL.md"), "Both product skills must come from the installed bundle"
    # No public standalone export API; settled permission evidence is read-only.
    for catalog in catalogs:
        if "package_docs_run" in catalog:
            assert not {"bash", "task", "loginom_dock_prepare"}.intersection(catalog)
    if args.modified_skill:
        assert len(files) == 1 and files[0]["url"] == lgp.as_uri() and files[0]["mime"] == "application/x-loginom-package"
        assert not structures and all("package_docs_run" not in catalog for catalog in catalogs)
        assert any("Bundled skills are unavailable" in error for error in result["toolErrors"])
        assert not any(part.get("tool") == "skill" and part.get("state", {}).get("status") == "completed" for part in parts)
        return
    if mode == "text-deny":
        assert not files and not structures
        assert any("rejected permission" in error for error in result["toolErrors"])
        assert "Access external directory" in (args.artifacts / "terminal.txt").read_text(errors="replace")
        return
    if mode == "text-allow":
        assert not files and len(structures) == 1
        view = (args.artifacts / "read-view.txt").read_text()
        assert "Path: " in view and lgp.name in view, "Read permission must show the actual package path"
    else:
        assert len(files) == 1 and files[0]["url"] == lgp.as_uri() and files[0]["mime"] == "application/x-loginom-package"
    assert len(structures) == 1
    expected = json.loads((fixtures / "structure.json").read_text())
    expected["package"]["file_name"] = lgp.name
    assert json.loads(structures[0].read_text()) == expected
    assert any("package_docs_run" in catalog for catalog in catalogs)
    for catalog in catalogs:
        if "package_docs_run" in catalog:
            assert not {"bash", "task", "loginom_dock_prepare"}.intersection(catalog)
    if args.slash:
        assert command_activation and command_activation["name"] == "package-docs" and command_activation["profile"] == "package-docs"
        assert re.fullmatch(r"[0-9a-f]{64}", command_activation["digest"])
    else:
        assert any(part.get("tool") == "skill" and part.get("state", {}).get("status") == "completed" for part in parts)
    assert any(part.get("tool") == "package_docs_run" and part.get("state", {}).get("status") == "completed" for part in parts)
    if args.full_report:
        reports = list(workspace.glob("*.lgp_report.pdf"))
        assert len(reports) == 1, "TUI must publish a complete PDF, not just extract the package"
        assert reports[0].read_bytes().startswith(b"%PDF-")


if __name__ == "__main__":
    main()
