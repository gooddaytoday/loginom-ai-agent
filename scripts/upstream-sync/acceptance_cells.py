#!/usr/bin/env python3
"""The closed case space of the acceptance tools, as data, with an independent model and a generator.

The contract is docs/upstream-sync/acceptance-contract.md; this file is its source. A cell is one file in a real Git
merge: a base commit, the fork's commit, upstream's commit and a merge commit (parents: fork, upstream) whose tree holds
whatever the "resolution" left for that file. Every cell lives under its own directory and has contents no other cell
shares, so Git's rename detection cannot pair files across cells.

  verify-accepted.py   cells = upstream change x fork change x what the merge left. The model states the verdict of a
                       cell by running `git merge --no-commit` (the index route of `prepare`, not the merge-tree route the
                       gate uses) and the identity mapping; it never looks at the gate. A cell needs a decision record when
                       Git leaves its path conflicted (C) or the commit differs from Git's merge (D); otherwise it is ok.
                       Each cell is run on its own: every other cell is recorded, so the exit code and the RESULT line
                       of the run belong to that cell alone.
  catalog-check.py     cells = kind of divergence x where it sits (commit, index, working tree) x described or not.

Usage: acceptance_cells.py [--tools DIR] [--markdown] [--list]
  --tools DIR   run the cells against the tools in DIR (default: this directory); exit 1 if any cell is red
  --markdown    print the contract tables (docs/upstream-sync/acceptance-contract.md embeds them verbatim)
"""
import argparse
import collections
import concurrent.futures
import dataclasses
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
ENV = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1", LC_ALL="C",
           GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@example.invalid", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@example.invalid")
MERGE_CFG = ("-c", "rerere.enabled=false", "-c", "merge.directoryRenames=conflict", "-c", "merge.conflictStyle=merge",
             "-c", "merge.renameLimit=30000", "-c", "diff.renameLimit=30000", "-c", "merge.renormalize=false", "-c", "core.autocrlf=false")
_spec = importlib.util.spec_from_file_location("apply_identity", os.path.join(HERE, "apply-identity.py"))
_identity = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_identity)
identity = _identity.transform


@dataclasses.dataclass(frozen=True)
class Ent:
    """What a path holds in one revision: a text file, a binary file, a symlink or a submodule pointer."""
    kind: str                 # text | bin | link | sub
    data: str
    exe: bool = False

    @property
    def mode(self):
        return {"link": "120000", "sub": "160000"}.get(self.kind) or ("100755" if self.exe else "100644")

    @property
    def blob(self):
        if self.kind == "sub":
            return None
        return (b"\0BIN\0" + self.data.encode() if self.kind == "bin" else self.data.encode())

    @property
    def lines(self):
        return self.data.split("\n")

    def with_mode(self, exe):
        return dataclasses.replace(self, exe=exe)


def body(cid, edits=(), exe=False, extra=()):
    """Twelve lines unique to the cell; `edits` = ((line number, suffix), ...)."""
    suffix = dict(edits)
    lines = [f"{cid} line {i}" + (f" {suffix[i]}" if i in suffix else "") for i in range(1, 13)]
    return Ent("text", "\n".join(lines + list(extra)) + "\n", exe)


def link(cid, tag):
    return Ent("link", f"{cid}-{tag}")


def binary(cid, tag):
    return Ent("bin", f"{cid}-{tag}")


def sub(cid, tag):
    return Ent("sub", hashlib.sha1(f"{cid}-{tag}".encode()).hexdigest())


# ---- scenarios ---------------------------------------------------------------------------------------------------

@dataclasses.dataclass
class Scenario:
    sid: str
    op: str                    # how upstream changed the file: A D M R
    shape: str                 # text bin link sub
    fork: str                  # what the fork did
    b: Ent
    f: Ent
    u: Ent
    m: Ent = None              # the proper combination, when one exists
    layout: str = "same"       # same | upren (upstream renames P to N) | forkren (fork renames P to Q) | both
    added: tuple = ()
    note: str = ""

    @property
    def paths(self):
        d = f"packages/core/src/cells/{self.sid}"
        return {"P": f"{d}/a.ts", "N": f"{d}/b.ts", "Q": f"{d}/c.ts", "M": f"{d}/m.ts"}

    @property
    def target(self):
        return {"same": "P", "upren": "N", "forkren": "Q", "both": "Q"}[self.layout]


def scenarios(tag=""):
    out, n = [], [0]

    def add(op, shape, fork, b, f, u, m=None, layout="same", added=(), note=""):
        n[0] += 1
        out.append(Scenario(f"{n[0]:03d}{tag}", op, shape, fork, b, f, u, m, layout, added, note))
        return out[-1]

    def sid():
        return f"{n[0] + 1:03d}{tag}"

    UP = 10, "up"
    FK = 1, "fk"
    # modify, text
    for fork in ("none", "edit", "same", "delete", "chmod", "to-symlink", "rename", "rename+edit"):
        c = sid()
        b, bu = body(c), body(c, [UP])
        up_line = (bu.lines[9],)
        f, m, layout = {
            "none": (b, bu, "same"), "edit": (body(c, [FK]), body(c, [FK, UP]), "same"), "same": (bu, bu, "same"),
            "delete": (None, None, "same"), "chmod": (b.with_mode(True), bu.with_mode(True), "same"),
            "to-symlink": (link(c, "f"), None, "same"), "rename": (b, bu, "forkren"),
            "rename+edit": (body(c, [FK]), body(c, [FK, UP]), "forkren"),
        }[fork]
        add("M", "text", fork, b, f, bu, m, layout, up_line)
    c = sid()
    add("M", "text", "none, upstream line has an OPENCODE_ name", body(c), body(c), body(c, [(10, "OPENCODE_NEW_FLAG")]),
        body(c, [(10, "LOGINOM_AI_AGENT_NEW_FLAG")]), added=(f"{c} line 10 OPENCODE_NEW_FLAG",), note="names")
    c = sid()
    b = body(c, extra=())
    dup = body(c, [UP], extra=[f"{c} push", f"{c} push"])
    add("M", "text", "edit, upstream adds the same line twice", b, body(c, [FK]), dup,
        body(c, [FK, UP], extra=[f"{c} push", f"{c} push"]), added=(f"{c} line 10 up", f"{c} push", f"{c} push"), note="dup")
    c = sid()
    b = body(c)
    without = Ent("text", "".join(l + "\n" for i, l in enumerate(b.lines[:12], 1) if i != 10))
    add("M", "text", "edit, upstream removes a line", b, body(c, [FK]), without,
        Ent("text", "".join(l + "\n" for i, l in enumerate(body(c, [FK]).lines[:12], 1) if i != 10)), note="removal")
    c = sid()
    twice = body(c, extra=[f"{c} push", f"{c} push"])
    once = body(c, extra=[f"{c} push"])
    add("M", "text", "edit, both remove one copy of a repeated line", twice, once, once, body(c), note="removal2")
    c = sid()
    fk = body(c, [FK], extra=[f"{c} push"])
    add("M", "text", "edit, fork already has the line upstream adds", body(c), fk, body(c, [UP], extra=[f"{c} push"]),
        body(c, [FK, UP], extra=[f"{c} push"]), added=(f"{c} line 10 up", f"{c} push"), note="forkline")
    # mode-only change
    for fork in ("none", "edit", "same", "delete"):
        c = sid()
        b, bx = body(c), body(c).with_mode(True)
        f, m = {"none": (b, bx), "edit": (body(c, [FK]), body(c, [FK], exe=True)), "same": (bx, bx), "delete": (None, None)}[fork]
        add("M", "mode", fork, b, f, bx, m)
    # modify, opaque shapes
    for shape, make in (("bin", binary), ("link", link), ("sub", sub)):
        for fork in ("none", "edit", "same", "delete"):
            c = sid()
            b, bu, bf = make(c, "b"), make(c, "u"), make(c, "f")
            add("M", shape, fork, b, {"none": b, "edit": bf, "same": bu, "delete": None}[fork], bu)
    # type change
    for fork in ("none", "edit", "same", "delete"):
        c = sid()
        b, lk = body(c), link(c, "u")
        add("M", "file to symlink", fork, b, {"none": b, "edit": body(c, [FK]), "same": lk, "delete": None}[fork], lk)
    for fork in ("none", "edit", "same", "delete"):
        c = sid()
        lk, tx = link(c, "b"), body(c)
        add("M", "symlink to file", fork, lk, {"none": lk, "edit": link(c, "f"), "same": tx, "delete": None}[fork], tx)
    # delete
    for fork in ("none", "edit", "delete", "chmod", "rename"):
        c = sid()
        b = body(c)
        f, layout = {"none": (b, "same"), "edit": (body(c, [FK]), "same"), "delete": (None, "same"),
                     "chmod": (b.with_mode(True), "same"), "rename": (b, "forkren")}[fork]
        add("D", "text", fork, b, f, None, layout=layout)
    for shape, make in (("bin", binary), ("link", link), ("sub", sub)):
        for fork in ("none", "edit"):
            c = sid()
            b = make(c, "b")
            add("D", shape, fork, b, b if fork == "none" else make(c, "f"), None)
    # add
    for fork in ("none", "same", "different"):
        c = sid()
        u = body(c, [UP])
        f = {"none": None, "same": u, "different": body(c, [FK])}[fork]
        add("A", "text", fork, None, f, u, body(c, [FK, UP]) if fork == "different" else None, added=tuple(u.lines))
    c = sid()
    ud = Ent("text", f"{c} top\n{c} push\n{c} push\n{c} bottom\n")
    add("A", "text", "none, two identical lines", None, None, ud, added=tuple(ud.lines), note="dup")
    c = sid()
    add("A", "text", "none, executable", None, None, body(c).with_mode(True), added=tuple(body(c).lines))
    for shape, make in (("bin", binary), ("link", link), ("sub", sub)):
        for fork in ("none", "same", "different"):
            c = sid()
            u = make(c, "u")
            add("A", shape, fork, None, {"none": None, "same": u, "different": make(c, "f")}[fork], u)
    # rename (pure) and rename with an upstream edit
    for label, edit in (("R", False), ("R+edit", True)):
        for fork in ("none", "edit", "delete", "rename to the same path", "rename elsewhere"):
            c = sid()
            b = body(c)
            u = body(c, [UP]) if edit else b
            added = (u.lines[9],) if edit else ()
            f, m, layout = {
                "none": (b, u, "upren"), "edit": (body(c, [FK]), body(c, [FK] + ([UP] if edit else [])), "upren"),
                "delete": (None, None, "upren"), "rename to the same path": (b, u, "upren"),
                "rename elsewhere": (b, u, "both"),
            }[fork]
            add("R", "text", fork, b, f, u, m, layout, added, note=label)
    for shape, make in (("bin", binary), ("link", link)):
        for fork in ("none", "delete"):
            c = sid()
            b = make(c, "b")
            add("R", shape, fork, b, b if fork == "none" else None, b, layout="upren")
    return out


# ---- results ------------------------------------------------------------------------------------------------------

RESULTS = ("up", "fork", "base", "merge", "gone", "empty", "lost-line", "dup-lost", "removal-kept", "reorder", "extra", "elsewhere", "old-kept")


def result_for(s, kind):
    """(path -> Ent for the paths of this cell in the merge result, the version of the file the oracle judges, old_left)
    or None when the result kind does not apply to the scenario."""
    p, tgt = s.paths, s.paths[s.target]
    res, ren = {}, s.layout == "upren"
    old = p["P"]

    def put(path, e):
        if e is not None:
            res[path] = e
    if kind == "up":
        put(tgt, s.u)
    elif kind == "fork":
        put(old if s.layout in ("same", "upren") else p["Q"], s.f)
    elif kind == "base":
        if s.b is None or s.b == s.f == s.u:
            return None
        put(old if s.layout in ("same", "upren") else p["Q"], s.b)
    elif kind == "merge":
        if s.m is None or s.m in (s.f, s.u):
            return None
        put(tgt, s.m)
    elif kind == "gone":
        pass
    elif kind == "empty":
        if s.u is None or s.u.kind != "text":
            return None
        put(tgt, Ent("text", "", s.u.exe))
    elif kind == "lost-line":
        src = s.m or (s.u if s.f in (None, s.b) or s.f == s.u else None)
        if src is None or src.kind != "text" or not s.added or s.note in ("dup", "removal", "removal2"):
            return None
        lines = src.data.split("\n")
        drop = next((i for i, l in enumerate(lines) if l == s.added[0] or l.startswith(s.added[0])), None)
        if drop is None:
            return None
        del lines[drop]
        put(tgt, dataclasses.replace(src, data="\n".join(lines)))
    elif kind == "dup-lost":
        src = s.m or (s.u if s.f in (None, s.b) or s.f == s.u else None)
        if s.note != "dup" or src is None:
            return None
        lines = src.data.split("\n")
        del lines[max(i for i, l in enumerate(lines) if l.endswith(" push"))]
        put(tgt, dataclasses.replace(src, data="\n".join(lines)))
    elif kind == "removal-kept":
        if s.note not in ("removal", "removal2"):
            return None
        put(tgt, dataclasses.replace(s.m, data=s.m.data + s.b.lines[9 if s.note == "removal" else 12] + "\n"))
    elif kind == "reorder":
        src = s.m or (s.u if s.f in (None, s.b) else None)
        if src is None or src.kind != "text" or s.note in ("dup", "names", "removal", "removal2"):
            return None
        put(tgt, dataclasses.replace(src, data="".join(l + "\n" for l in reversed(src.data.rstrip("\n").split("\n")))))
    elif kind == "extra":
        if s.op not in ("A", "R") or s.u is None or s.u.kind != "text" or s.f not in (None, s.b) and s.f != s.u:
            return None
        put(tgt, dataclasses.replace(s.u, data=s.u.data + "an extra line\n"))
    elif kind == "elsewhere":
        if s.op not in ("A", "R") or s.u is None or s.layout in ("forkren", "both"):
            return None
        put(p["M"], s.u)
    elif kind == "old-kept":
        if not ren:
            return None
        if s.f == s.b:
            put(tgt, s.u)
            put(old, s.b)
        elif s.f is not None and s.m is not None:
            put(tgt, s.m)
            put(old, s.f)
        else:
            return None
    return res


def build_cells():
    """One cell per (scenario, result kind) that applies. Each cell has its own directory and its own contents."""
    cells, total = [], len(scenarios())
    per_kind = {kind: scenarios(f"-{kind}") for kind in RESULTS}
    for i in range(total):
        for kind in RESULTS:
            s = per_kind[kind][i]
            res = result_for(s, kind)
            if res is not None:
                cells.append({"id": s.sid, "n": i, "s": s, "kind": kind, "res": res})
    return cells


# ---- the merge ----------------------------------------------------------------------------------------------------

def git(repo, *args, stdin=None, env=None, check=True):
    p = subprocess.run(["git", "-C", repo, *args], input=stdin, capture_output=True, env=env or ENV)
    if check and p.returncode:
        raise RuntimeError(f"git {args}: {p.stderr.decode()}")
    return p.stdout.decode().strip()


def write_tree(repo, files):
    """files: path -> Ent. Writes the blobs and the tree; returns the tree id."""
    blobs = {}
    paths = [e for e in files.values() if e.blob is not None]
    if paths:
        shas = subprocess.run(["git", "-C", repo, "hash-object", "-w", "--stdin-paths"], input="".join(
            f"{path}\n" for path in _spill(repo, paths)).encode(), capture_output=True, env=ENV, check=True).stdout.decode().split()
        blobs = {id(e): sha for e, sha in zip(paths, shas)}
    lines = []
    for path, e in sorted(files.items()):
        sha = e.data if e.kind == "sub" else blobs[id(e)]
        lines.append(f"{e.mode} {sha}\t{path}\n")
    index = os.path.join(repo, "cells.index")
    env = dict(ENV, GIT_INDEX_FILE=index)
    if os.path.exists(index):
        os.unlink(index)
    git(repo, "update-index", "--add", "--index-info", stdin="".join(lines).encode(), env=env)
    tree = git(repo, "write-tree", env=env)
    os.unlink(index)
    return tree


def _spill(repo, ents):
    out = []
    for i, e in enumerate(ents):
        path = os.path.join(repo, ".git", f"blob{i}")
        with open(path, "wb") as fh:
            fh.write(e.blob)
        out.append(path)
    return out


def commit(repo, tree, message, *parents):
    args = ["commit-tree", tree, "-m", message]
    for parent in parents:
        args += ["-p", parent]
    return git(repo, *args)


def build_repo(repo, cells):
    """base, fork and upstream commits, a merge commit of the fork and upstream whose tree is the chosen results, and the
    model: Git's own merge of fork and upstream through the index (the route of `prepare`), with the fork's names applied."""
    base, fork, up = {}, {}, {}
    for s in (c["s"] for c in cells):
        p = s.paths
        old = p["P"]
        if s.b is not None:
            base[old] = s.b
        fork_path = p["Q"] if s.layout in ("forkren", "both") else old
        if s.f is not None:
            fork[fork_path] = s.f
        if s.layout in ("upren", "both"):
            if s.u is not None:
                up[p["N"]] = s.u
        elif s.u is not None:
            up[old] = s.u
    git(repo, "init", "-q", "-b", "base")
    t_base, t_fork, t_up = (write_tree(repo, x) for x in (base, fork, up))
    c_base = commit(repo, t_base, "base")
    c_fork = commit(repo, t_fork, "fork", c_base)
    c_up = commit(repo, t_up, "upstream", c_base)
    result = {}
    for c in cells:
        result.update({path: e for path, e in c["res"].items()})
    t_res = write_tree(repo, result)
    c_res = commit(repo, t_res, "merge", c_fork, c_up)
    git(repo, "update-ref", "refs/heads/base", c_res)
    git(repo, "checkout", "-q", "-f", "--detach", c_fork)
    merged = subprocess.run(["git", "-C", repo, *MERGE_CFG, "merge", "--no-commit", "--no-ff", c_up], capture_output=True, text=True, env=ENV)
    clashes = set(re.findall(r"^CONFLICT \(distinct types\): (.+) had different types on each side;", merged.stdout, re.M))
    parked = {f"{path}~{label}" for path in clashes for label in ("HEAD", c_up)}
    expected, conflicts = {}, set()
    fork_entries = ls_tree(repo, c_fork)
    for mode_sha_stage, path in ls_files_stages(repo):
        mode, sha, stage = mode_sha_stage
        if stage != "0":
            conflicts.add(path.rsplit("~", 1)[0] if path in parked else path)
        elif fork_entries.get(path) != (mode, sha) and _identity.wants(path) and mode in ("100644", "100755"):
            text = subprocess.run(["git", "-C", repo, "cat-file", "blob", sha], capture_output=True, env=ENV).stdout
            try:
                mapped = identity(text.decode("utf-8"))
            except UnicodeDecodeError:
                mapped = None
            if mapped is not None and mapped.encode() != text:
                sha = subprocess.run(["git", "-C", repo, "hash-object", "-w", "--stdin"], input=mapped.encode(),
                                     capture_output=True, env=ENV, check=True).stdout.decode().strip()
            expected[path] = (mode, sha)
        else:
            expected[path] = (mode, sha)
    git(repo, "merge", "--abort", check=False)
    git(repo, "checkout", "-q", "-f", "--detach", c_res)
    return Repo(c_fork, c_up, t_res, ls_tree(repo, t_res), expected, conflicts)


Repo = collections.namedtuple("Repo", "fork upstream result_tree result expected conflicts")


def ls_tree(repo, rev):
    out = {}
    for rec in subprocess.run(["git", "-C", repo, "ls-tree", "-r", "-z", rev], capture_output=True, env=ENV, check=True).stdout.split(b"\0"):
        if rec:
            meta, path = rec.split(b"\t", 1)
            mode, _, sha = meta.decode().split()
            out[path.decode()] = (mode, sha)
    return out


def ls_files_stages(repo):
    for rec in subprocess.run(["git", "-C", repo, "ls-files", "-s", "-z"], capture_output=True, env=ENV, check=True).stdout.split(b"\0"):
        if rec:
            meta, path = rec.split(b"\t", 1)
            mode, sha, stage = meta.decode().split()
            yield (mode, sha, stage), path.decode()


@dataclasses.dataclass(frozen=True)
class Verdict:
    """What a cell needs from the gate: nothing (ok), or a decision record for a conflicted path (C) or a deviating path (D)."""
    needs: tuple = ()          # ((category, path), ...)

    def code(self):
        cats = {c for c, _ in self.needs}
        return "C" if "conflict" in cats else "D" if cats else "ok"


def verdict_of(model, sid):
    prefix = f"packages/core/src/cells/{sid}/"
    needs = [("conflict", p) for p in model.conflicts if p.startswith(prefix)]
    for path in set(model.result) | set(model.expected):
        if path.startswith(prefix) and path not in model.conflicts and model.result.get(path) != model.expected.get(path):
            needs.append(("deviation", path))
    return Verdict(tuple(sorted(needs)))


def judged_cells(repo, keep=None):
    cells = [c for c in build_cells() if keep is None or keep(c)]
    model = build_repo(repo, cells)
    for c in cells:
        c["verdict"] = verdict_of(model, c["s"].sid)
    return cells, model


# ---- running the gate -------------------------------------------------------------------------------------------------

FAIL = re.compile(r"^- FAIL (\S+): (\S+) — ")


def merge_with(repo, model, paths):
    """A merge commit of the cells' results that carries a decision record for each of `paths`."""
    entries = dict(model.result)
    if paths:
        doc = {"format": 1, "decisions": [{"path": p, "rule": "PROCEDURE-2", "reason": "contract cell"} for p in sorted(paths)]}
        blob = subprocess.run(["git", "-C", repo, "hash-object", "-w", "--stdin"], input=json.dumps(doc).encode(), capture_output=True,
                              env=ENV, check=True).stdout.decode().strip()
        entries["docs/upstream-sync/merge-decisions.json"] = ("100644", blob)
    lines = "".join(f"{mode} {sha}\t{path}\n" for path, (mode, sha) in sorted(entries.items()))
    index = tempfile.mktemp(prefix="cells.index.", dir=os.path.join(repo, ".git"))
    env = dict(ENV, GIT_INDEX_FILE=index)
    git(repo, "update-index", "--add", "--index-info", stdin=lines.encode(), env=env)
    tree = git(repo, "write-tree", env=env)
    os.unlink(index)
    return commit(repo, tree, "merge", model.fork, model.upstream)


def run_gate(tools, repo, model, paths):
    """-> (exit code, {(category, path)}, whether the RESULT line says ACCEPTED/REJECTED, output)."""
    merged = merge_with(repo, model, paths)
    p = subprocess.run([sys.executable, "-I", os.path.join(tools, "verify-accepted.py"), "--repo", repo, "--fork", model.fork,
                        "--upstream", model.upstream, "--merge", merged], capture_output=True, text=True, env=ENV)
    fails = {(m.group(1), m.group(2)) for m in map(FAIL.match, p.stdout.split("\n")) if m}
    verdict = "ACCEPTED" if "RESULT: ACCEPTED" in p.stdout else "REJECTED" if "RESULT: REJECTED" in p.stdout else None
    return p.returncode, fails, verdict, p.stdout + p.stderr


def evaluate_verify(tools, keep=None):
    with tempfile.TemporaryDirectory(prefix="acceptance-cells.") as repo:
        cells, model = judged_cells(repo, keep)
        every = {p for c in cells for _, p in c["verdict"].needs}
        plain = run_gate(tools, repo, model, set())
        recorded = run_gate(tools, repo, model, every)
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(2, os.cpu_count() or 2)) as pool:
            alone = {c["id"]: pool.submit(run_gate, tools, repo, model, every - {p for _, p in c["verdict"].needs})
                     for c in cells if c["verdict"].needs}
            alone = {sid: f.result() for sid, f in alone.items()}
    results = []
    for c in cells:
        v, s = c["verdict"], c["s"]
        want = set(v.needs)
        prefix = f"packages/core/src/cells/{s.sid}/"
        problems = []
        got = {f for f in plain[1] if f[1].startswith(prefix)}
        if got != want:
            problems.append(f"all unrecorded: want {sorted(want) or 'no FAIL'}, got {sorted(got) or 'no FAIL'}")
        if recorded[0] != 0 or recorded[2] != "ACCEPTED" or recorded[1]:
            problems.append(f"all recorded: exit {recorded[0]}, verdict {recorded[2]}, FAIL lines {len(recorded[1])}; want exit 0, ACCEPTED, none")
        if want:
            rc, fails, verdict, _ = alone[s.sid]
            if rc != 1 or verdict != "REJECTED" or fails != want:
                problems.append(f"alone unrecorded: exit {rc}, verdict {verdict}, FAIL {sorted(fails)}; want exit 1, REJECTED, {sorted(want)}")
        results.append({"id": c["id"], "scenario": s, "kind": c["kind"], "verdict": v, "problems": problems})
    return results, {"plain": plain, "recorded": recorded}


# ---- catalog-check ---------------------------------------------------------------------------------------------

CATALOG_KINDS = ("edit", "chmod", "delete", "rename", "rename+edit", "file to symlink", "symlink to file", "retarget symlink",
                 "edit binary", "empty the file", "fork adds a file")
CATALOG_WHERE = ("committed", "staged", "worktree")


def catalog_cells():
    return [{"id": f"{k}|{w}|{d}", "kind": k, "where": w, "described": d}
            for k in CATALOG_KINDS for w in CATALOG_WHERE for d in (True, False)]


def catalog_expect(kind, described):
    """-> (exit code, divergent files the tool must count). Fork-added files are out of scope; describing one is stale."""
    if kind == "fork adds a file":
        return (1, 1) if described else (0, 1)
    return (0, 2) if described else (1, 2)


def run_catalog_cell(tools, cell):
    kind, where, described = cell["kind"], cell["where"], cell["described"]
    with tempfile.TemporaryDirectory(prefix="catalog-cell.") as repo:
        def w(path, data, mode=None, binary=False):
            full = os.path.join(repo, path)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            if os.path.lexists(full):
                os.unlink(full)
            open(full, "wb" if binary else "w").write(data)
            if mode:
                os.chmod(full, mode)

        git(repo, "init", "-q", "-b", "main")
        text = "".join(f"line {i}\n" for i in range(1, 13))
        w("anchor.txt", text); w("sub/x.txt", text); w("sub/bin.dat", b"\0BIN\0one", binary=True)
        w("sub/h.sh", text, 0o644); os.symlink("target-one", os.path.join(repo, "sub/l"))
        git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "upstream")
        upstream = git(repo, "rev-parse", "HEAD")
        w("anchor.txt", text + "fork anchor\n")

        def edit():
            if kind == "edit": w("sub/x.txt", text.replace("line 5", "line 5 fork"))
            elif kind == "chmod": os.chmod(os.path.join(repo, "sub/h.sh"), 0o755)
            elif kind == "delete": os.unlink(os.path.join(repo, "sub/x.txt"))
            elif kind == "rename": os.rename(os.path.join(repo, "sub/x.txt"), os.path.join(repo, "sub/y.txt"))
            elif kind == "rename+edit":
                os.unlink(os.path.join(repo, "sub/x.txt")); w("sub/y.txt", text.replace("line 5", "line 5 fork"))
            elif kind == "file to symlink":
                os.unlink(os.path.join(repo, "sub/x.txt")); os.symlink("elsewhere", os.path.join(repo, "sub/x.txt"))
            elif kind == "symlink to file": os.unlink(os.path.join(repo, "sub/l")); w("sub/l", "now a file\n")
            elif kind == "retarget symlink": os.unlink(os.path.join(repo, "sub/l")); os.symlink("target-two", os.path.join(repo, "sub/l"))
            elif kind == "edit binary": w("sub/bin.dat", b"\0BIN\0two", binary=True)
            elif kind == "empty the file": w("sub/x.txt", "")
            elif kind == "fork adds a file": w("sub/new.txt", "fork only\n")
        edit()
        if where == "committed":
            git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "fork")
        elif where == "staged":
            git(repo, "add", "-A")
        covered = {"edit": "sub/x.txt", "chmod": "sub/h.sh", "delete": "sub/x.txt", "rename": "sub/y.txt", "rename+edit": "sub/y.txt",
                   "file to symlink": "sub/x.txt", "symlink to file": "sub/l", "retarget symlink": "sub/l", "edit binary": "sub/bin.dat",
                   "empty the file": "sub/x.txt", "fork adds a file": "sub/new.txt"}[kind]
        entries = [{"id": "CAT-01", "paths": ["anchor.txt"]}]
        if described:
            entries.append({"id": "CAT-02", "paths": [covered]})
        os.makedirs(os.path.join(repo, "docs/upstream-sync"), exist_ok=True)
        json.dump({"against": upstream, "entries": entries}, open(os.path.join(repo, "docs/upstream-sync/catalog.json"), "w"))
        open(os.path.join(repo, "docs/upstream-sync/catalog.md"), "w").write("".join(f"## {e['id']} x\n" for e in entries))
        if where == "committed":
            git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "catalog")
        p = subprocess.run([sys.executable, "-I", os.path.join(tools, "catalog-check.py"), "--repo", repo, "--against", upstream],
                           capture_output=True, text=True, env=ENV)
        m = re.search(r"(\d+) divergent upstream files", p.stdout)
        return p.returncode, int(m.group(1)) if m else None, p.stderr.strip()


def evaluate_catalog(tools):
    results = []
    for c in catalog_cells():
        want_rc, want_n = catalog_expect(c["kind"], c["described"])
        rc, n, err = run_catalog_cell(tools, c)
        problems = []
        if rc != want_rc:
            problems.append(f"exit {rc}, want {want_rc}" + (f" ({err.splitlines()[0][:90]})" if err else ""))
        if rc == 0 and n != want_n:
            problems.append(f"counted {n} divergent files, want {want_n}")
        results.append({"id": c["id"], "problems": problems})
    return results


# ---- the contract tables ------------------------------------------------------------------------------------------

def markdown():
    with tempfile.TemporaryDirectory(prefix="acceptance-cells.") as repo:
        cells, _ = judged_cells(repo)
    by = collections.defaultdict(dict)
    for c in cells:
        by[c["n"] + 1][c["kind"]] = c["verdict"]
    scs = {i: s for i, s in enumerate(scenarios(), 1)}
    out = ["| # | Upstream | File | Fork | " + " | ".join(RESULTS) + " |", "|---|---|---|---|" + "---|" * len(RESULTS)]
    for sid, s in scs.items():
        row = [by[sid][k].code() if k in by[sid] else "·" for k in RESULTS]
        out.append(f"| {sid:03d} | {s.op} | {s.shape} | {s.fork} | " + " | ".join(row) + " |")
    out += ["", "| Kind of divergence (exit code: described / undescribed) | committed | staged | worktree |", "|---|---|---|---|"]
    for k in CATALOG_KINDS:
        verdict = f"{catalog_expect(k, True)[0]} / {catalog_expect(k, False)[0]}"
        out.append(f"| {k} | " + " | ".join([verdict] * len(CATALOG_WHERE)) + " |")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tools", default=HERE)
    ap.add_argument("--markdown", action="store_true")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.markdown:
        print(markdown(), end="")
        return 0
    if a.list:
        with tempfile.TemporaryDirectory(prefix="acceptance-cells.") as repo:
            for c in judged_cells(repo)[0]:
                print(c["id"], c["s"].op, c["s"].shape, c["s"].fork, c["kind"], c["verdict"].code())
        return 0
    verify, runs = evaluate_verify(a.tools)
    catalog = evaluate_catalog(a.tools)
    red_v = [r for r in verify if r["problems"]]
    red_c = [r for r in catalog if r["problems"]]
    print(f"verify-accepted: {len(verify)} cells, {len(red_v)} red")
    for r in red_v:
        s = r["scenario"]
        print(f"  RED {r['id']} [{s.op} {s.shape}; fork: {s.fork}; result: {r['kind']}] expected {r['verdict'].code()}: " + "; ".join(r["problems"]))
    print(f"catalog-check: {len(catalog)} cells, {len(red_c)} red")
    for r in red_c:
        print(f"  RED {r['id']}: " + "; ".join(r["problems"]))
    print(f"TOTAL {len(verify) + len(catalog)} cells, {len(red_v) + len(red_c)} red")
    return 1 if red_v or red_c else 0


if __name__ == "__main__":
    sys.exit(main())
