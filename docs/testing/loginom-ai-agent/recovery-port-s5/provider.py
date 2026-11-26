"""Local OpenAI-compatible fixture for one assigned LAB-2037 controlled arm."""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import time

PROMPT = "Создай и сохрани новый пустой пакет Loginom без аналитических узлов по адресу"
READY = "Ответь одним словом READY. Не вызывай инструменты и не изменяй файлы или Loginom."
STOP = "The recovery attempt still needs a decision."
END = "The scenario ended. Use the saved package to verify the result."
ADV = "Browser recovery for operation "
ADVICE = " is still active and holds the Loginom page. Continue this step with the browser tools and call dock_browser_recovery finish with what you did, or call dock_browser_recovery stop if no justified next action remains. Ending the turn again stops the attempt."


def content(message):
    value = message.get("content")
    if isinstance(value, str):
        return value
    return "\n".join(part["text"] for part in value or [] if isinstance(part, dict) and isinstance(part.get("text"), str))


def sha(value):
    return hashlib.sha256(value).hexdigest()


class Scenario:
    def __init__(self):
        self.package = None
        self.phase = "skill"
        self.pending = None
        self.op = None
        self.reply_cache = {}

    def decide(self, body, facts):
        messages = body["messages"]
        joined = "\n".join(content(m) for m in messages if m.get("role") == "user")
        system = "\n".join(content(m) for m in messages if m.get("role") == "system")
        if "Generate a title for this conversation" in system or any("Generate a title for this conversation" in content(m) for m in messages):
            facts["kind"] = "title"
            return "S5 mechanics", None
        if READY in joined and PROMPT not in joined:
            facts["kind"] = "admission-preflight"
            return "READY", None
        paths = re.findall(re.escape(PROMPT) + r" `(/[^\s`]+/eval-[^\s`/]+\.lgp)`", joined)
        if len(paths) != 1 or self.package not in (None, paths[0]):
            raise ValueError("assignment_path_missing_or_changed")
        self.package = paths[0]
        self.op = "s5-save-" + sha(self.package.encode())[:16]
        facts.update(kind="measurement", phase=self.phase, operation=self.op, package_sha256=sha(self.package.encode()),
                     current_reminders_in_history=joined.count(ADV + self.op + ADVICE),
                     other_or_malformed_in_history=joined.count(ADV) - joined.count(ADV + self.op + ADVICE))
        if self.pending:
            seen = [m for m in messages if m.get("role") == "tool" and m.get("tool_call_id") == self.pending]
            if len(seen) != 1:
                raise ValueError("last_tool_call_result_missing")
            visible = content(seen[0])
            facts.update(result_for=self.pending, model_visible_result_sha256=sha(visible.encode()),
                         model_visible_truncation_hint="output was truncated" in visible)
        if self.phase == "after_stop":
            stops = [i for i, m in enumerate(messages) if m.get("role") == "assistant" and STOP == content(m).strip()]
            if len(stops) != 1:
                raise ValueError("stop_boundary_unconfirmed")
            fresh = [content(m) for m in messages[stops[0] + 1:] if m.get("role") == "user"]
            all_recovery = sum(x.count(ADV) for x in fresh)
            own = sum(x.count(ADV + self.op + ADVICE) for x in fresh)
            facts.update(next_post=True, fresh_user_messages=len(fresh), current_reminders=own, other_or_malformed_reminders=all_recovery-own)
            if own != 1 or all_recovery != 1:
                self.phase = "ended"
                return "The next request had no single matching reminder.", None
            self.phase = "snapshot"
        if self.phase == "ordinary_stop":
            self.phase = "after_stop"
            self.pending = None
            facts["ordinary_stop"] = True
            return STOP, None
        if self.phase in ("end", "ended"):
            self.pending = None
            self.phase = "ended"
            return END, None
        operations = {
            "skill": ("skill", {"name": "loginom-automation"}, "prepare"),
            "prepare": ("loginom_dock_prepare", {"intent": "new_draft", "operation_id": "s5-new-draft"}, "save"),
            "save": ("loginom_dock_action_run", {"action_key": "package.save_checkpoint", "operation_id": self.op, "parameters": {"path": self.package, "conflict_policy": "fail"}}, "start"),
            "start": ("loginom_dock_browser_recovery", {"action": "start", "operation_id": self.op}, "repeat"),
            "repeat": ("loginom_dock_browser_recovery", {"action": "start", "operation_id": self.op}, "ordinary_stop"),
            "snapshot": ("loginom_browser_snapshot", {"depth": 2}, "finish"),
            "finish": ("loginom_dock_browser_recovery", {"action": "finish", "operation_id": self.op, "actions_performed": ["Requested a read-only snapshot of the current page."]}, "end"),
        }
        name, args, next_phase = operations[self.phase]
        if name not in {t.get("function", {}).get("name") for t in body.get("tools", [])}:
            raise ValueError("tool_not_advertised_" + name)
        self.pending = "s5_" + self.phase + "_" + self.op[8:]
        self.phase = next_phase
        facts.update(sent_tool=name, sent_call=self.pending)
        return None, {"id": self.pending, "type": "function", "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)}}


def serve(port, out):
    scenario = Scenario()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            if self.path != "/v1/chat/completions" or not secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer s5-local-fixture-only"):
                self.send_error(404)
                return
            facts = {"time_ns": time.time_ns()}
            try:
                n = int(self.headers["Content-Length"])
                if not 0 < n <= 16 * 1024 * 1024:
                    raise ValueError("invalid_request_size")
                raw = self.rfile.read(n)
                key = sha(raw)
                body = json.loads(raw)
                facts.update(request_sha256=key, phase_before=scenario.phase, message_count=len(body["messages"]))
                if key in scenario.reply_cache:
                    facts["duplicate_http_request"] = True
                    text, call = scenario.reply_cache[key]
                else:
                    text, call = scenario.decide(body, facts)
                    scenario.reply_cache[key] = (text, call)
                reason = "tool_calls" if call else "stop"
                delta = {"tool_calls": [dict(call, index=0)]} if call else {"content": text}
                base = dict(id="chatcmpl-s5-" + key[:10], model=body["model"], created=int(time.time()))
                if body.get("stream"):
                    chunks = [dict(base, object="chat.completion.chunk", choices=[dict(index=0, delta=d, finish_reason=r)]) for d,r in [(delta,None),({},reason)]]
                    reply = ("".join("data: " + json.dumps(c) + "\n\n" for c in chunks) + "data: [DONE]\n\n").encode()
                    ctype = "text/event-stream"
                else:
                    message = {"role": "assistant", **({"tool_calls": [call]} if call else {"content": text})}
                    reply = json.dumps(dict(base, object="chat.completion", choices=[dict(index=0, message=message, finish_reason=reason)])).encode()
                    ctype = "application/json"
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(reply)))
                self.end_headers()
                self.wfile.write(reply)
            except (TypeError, KeyError, ValueError, OSError) as err:
                code = str(err) if isinstance(err, ValueError) and re.fullmatch("[a-zA-Z0-9_]+", str(err)) else type(err).__name__
                facts["error"] = code
                self.send_error(422, "Invalid fixture request")
            finally:
                with out.open("a", encoding="utf-8") as f:
                    f.write(json.dumps(facts) + "\n")
                    f.flush()
                    os.fsync(f.fileno())
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(server.server_port, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    with args.out.open("x"):
        pass
    serve(args.port, args.out)
