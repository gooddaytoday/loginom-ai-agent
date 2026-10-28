#!/usr/bin/env python3
"""Runs the command blocks of docs/upstream-sync/procedure.md verbatim, in order, from the root of a clean clone.

A block is a fenced code block whose info string holds `doc-test` and `step=<name>`. Blocks marked `doc-test:manual` are
steps a person does (resolving conflicts); the runner replaces them with the --resolve command. A block that still holds a
placeholder (`<...>`) or an optional `[--flag ...]` cannot run verbatim and fails the test: the document must be executable.
The blocks before a manual step share one shell. A person's manual work ends that shell, so the blocks after it run in a new
shell that starts from the exported environment and the `env` block only: everything else must come from the files the
document's own blocks wrote (`$OUT/pins.env`).

Usage: doctest_procedure.py --src CLEAN_CLONE --out NEW_EMPTY_DIR --log FILE [--resolve CMD] [--through STEP] [--doc FILE]
  --through STEP   stop after the block with step=STEP (default: accepted)
Environment passes through; the document's own variables (FORK_URL, UPSTREAM_URL, TAG, CHECK_SKIP) steer it.
Exit code: the shell's, or 2 when the document is not executable.
"""
import argparse
import os
import re
import subprocess
import sys

sys.dont_write_bytecode = True
FENCE = re.compile(r"^```(\w+)\s+(.*doc-test.*)$")


def blocks(doc):
    out, lines, i = [], doc.split("\n"), 0
    while i < len(lines):
        m = FENCE.match(lines[i])
        if m:
            start, info, body = i + 1, m.group(2), []
            i += 1
            while not lines[i].startswith("```"):
                body.append(lines[i]); i += 1
            step = re.search(r"step=(\S+)", info)
            out.append({"line": start, "step": step.group(1) if step else "?", "manual": "doc-test:manual" in info, "text": "\n".join(body)})
        i += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../docs/upstream-sync/procedure.md"))
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--resolve")
    ap.add_argument("--through", default="accepted")
    a = ap.parse_args()
    found = blocks(open(a.doc, encoding="utf-8").read())
    if not found:
        print("no doc-test blocks in the document", file=sys.stderr)
        return 2
    header = ["set -euo pipefail", f'export OUT={a.out!r}']
    env_block = next((b["text"] for b in found if b["step"] == "env" and not b["manual"]), "")
    segments, script, steps = [], list(header), []
    for b in found:
        if not b["manual"]:
            bad = re.findall(r"<[A-Za-z][^>\s]*>|\[--[^\]]*\]", b["text"])
            if bad:
                print(f"{a.doc}:{b['line']}: step {b['step']} is not executable as written: {bad}", file=sys.stderr)
                return 2
        script.append(f"echo '### step={b['step']} (procedure.md:{b['line']}){' [manual: --resolve]' if b['manual'] else ''}'")
        if b["manual"]:
            if not a.resolve:
                print("the document has a manual step and no --resolve command was given", file=sys.stderr)
                return 2
            script.append(a.resolve)
            segments.append(script)
            script = [*header, env_block, '[ ! -f "$OUT/doc-test.env" ] || . "$OUT/doc-test.env"']
        else:
            script.append(b["text"])
        steps.append(b["step"])
        if b["step"] == a.through:
            break
    else:
        print(f"no block with step={a.through}", file=sys.stderr)
        return 2
    segments.append(script)
    env = dict(os.environ)
    for key, value in (("GIT_AUTHOR_NAME", "doc-test"), ("GIT_AUTHOR_EMAIL", "doc-test@example.invalid"),
                       ("GIT_COMMITTER_NAME", "doc-test"), ("GIT_COMMITTER_EMAIL", "doc-test@example.invalid")):
        env.setdefault(key, value)
    with open(a.log, "w", encoding="utf-8") as log:
        log.write("steps: " + " ".join(steps) + "\n")
        log.flush()
        for segment in segments:
            p = subprocess.run(["bash", "-c", "\n".join(segment)], cwd=a.src, env=env, stdout=log, stderr=subprocess.STDOUT)
            log.flush()
            if p.returncode:
                break
    print(f"procedure doc-test: steps {' '.join(steps)}; exit {p.returncode}; log {a.log}")
    return p.returncode


if __name__ == "__main__":
    sys.exit(main())
