#!/usr/bin/env python3
"""The closed case space of the acceptance tools, as data, with one oracle and one generator.

The contract is docs/upstream-sync/acceptance-contract.md; this file is its source. A cell is one file in a real Git
merge: a base commit, the fork's commit, upstream's commit and a merge commit (parents: fork, upstream) whose tree holds
whatever the "resolution" left for that file. Every cell lives under its own directory and has contents no other cell
shares, so Git's rename detection cannot pair files across cells.

  verify-accepted.py   cells = upstream change x fork change x what the merge left. The oracle `expect` states the verdict
                       from the three versions and the result alone; it never looks at the tool.
  catalog-check.py     cells = kind of divergence x where it sits (commit, index, working tree) x described or not.

Usage: acceptance_cells.py [--tools DIR] [--markdown] [--list]
  --tools DIR   run the cells against the tools in DIR (default: this directory); exit 1 if any cell is red
  --markdown    print the contract tables (docs/upstream-sync/acceptance-contract.md embeds them verbatim)
"""
import argparse
import collections
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


def norm(e):
    return identity(e.data)


def mergeable(*ents):
    return all(e is None or e.kind == "text" for e in ents)


def blank(e):
    return e.kind == "text" and not e.data.strip()


def same(r, u):
    """Equal as versions; text equal after the fork's names are applied to upstream's spelling."""
    if r is None or u is None:
        return r is u
    if r.kind != u.kind or r.mode != u.mode:
        return False
    return norm(r) == norm(u) if u.kind == "text" else r == u


def lacks(r, wanted):
    """Wanted lines (multiset, non-blank, fork names applied) that the text result r does not contain."""
    have = collections.Counter(identity(l) for l in r.lines if l.strip())
    need = collections.Counter(identity(l) for l in wanted if l.strip())
    return sum((need - have).values())


def retained(b, f, u, r):
    """Copies of a line upstream removed that the merged text r still holds, for lines the fork left alone."""
    c = lambda e: collections.Counter(identity(l) for l in e.lines if l.strip())
    cb, cf, cu, cr = c(b), c(f), c(u), c(r)
    return sum(cr[l] - cu[l] for l in cb if cf[l] == cb[l] and cu[l] < cb[l] and cr[l] > cu[l])


# ---- the oracle: the contract in code ---------------------------------------------------------------------------

@dataclasses.dataclass(frozen=True)
class Verdict:
    cat: str = None            # None = ACCEPTED
    allow: str = None          # None | ours | theirs | either: the record that clears it
    warn: bool = False         # accepted, but upstream-added lines are missing: --strict-lines fails it

    def code(self):
        if self.cat is None:
            return "ok*" if self.warn else "ok"
        return CODES[self.cat] + ({"ours": "/o", "theirs": "/t", "either": "/e"}.get(self.allow) or "")


CODES = {"kept-fork": "KF", "took-theirs": "TT", "merged-deleted": "MD", "merged-emptied": "ME", "not-upstream": "NU",
         "added-missing": "AM", "added-truncated": "AT", "renamed-missing": "RM", "renamed-truncated": "RT",
         "deleted-kept": "DK", "deleted-dropped": "DD", "fork-deleted": "FD", "mode-lost": "ML", "neither-side": "NS"}


def expect(b, f, u, r, op, added=(), old_left=False, fork_moved=False):
    """Verdict for one file. b, f, u, r: base, fork, upstream and result versions of the file (None = absent).
    op: how upstream changed it (A add, D delete, M modify, R rename); added: the lines upstream added;
    old_left: upstream renamed the file and the result still holds the old path;
    fork_moved: the fork renamed the file (its content may be unchanged)."""
    if u is None and fork_moved and f == b:               # upstream deletes what the fork moved: the fork's move is a change
        return Verdict("deleted-dropped", "theirs") if r is None else Verdict("deleted-kept", "ours")
    if f == b or f == u and op in ("A", "R", "D"):        # the fork holds nothing the result could lose
        if u is None:
            return Verdict("deleted-kept") if r is not None else Verdict()
        if old_left:
            return Verdict("deleted-kept")
        if op in ("A", "R"):
            ok = r is not None and r.kind == u.kind and r.mode == u.mode and (
                lacks(r, u.lines) == 0 if u.kind == "text" else r == u)
            if ok:
                return Verdict()
            if op == "R":
                return Verdict("renamed-missing") if r is None else Verdict("renamed-truncated", "either")
            return Verdict("added-missing" if r is None else "added-truncated", "either")
        return Verdict() if same(r, u) else Verdict("not-upstream")
    if f == u:                                            # both made the same change: the result must keep it
        if r is None:
            return Verdict("merged-deleted", "theirs")
        if blank(r) and not blank(u):
            return Verdict("merged-emptied", "theirs")
        return Verdict() if same(r, u) else Verdict("not-upstream")
    if u is None:                                         # upstream deleted what the fork changed: the owner decides
        return Verdict("deleted-dropped", "theirs") if r is None else Verdict("deleted-kept", "ours")
    if f is None:                                         # the fork deleted what upstream changed: the owner decides
        return Verdict("fork-deleted", "ours" if r is None else "theirs")
    if r is None:
        return Verdict("merged-deleted", "theirs")
    if r == f:
        return Verdict("kept-fork", "ours")
    if r == u:
        return Verdict("took-theirs", "theirs")
    if blank(r) and not blank(f) and not blank(u):
        return Verdict("merged-emptied", "theirs")
    if not mergeable(b, f, u):
        return Verdict("neither-side")
    want_exe = u.exe if b is not None and u.exe != b.exe else f.exe
    if r.kind != "text" or r.exe != want_exe:
        return Verdict("mode-lost", "either")
    return Verdict(warn=lacks(r, added) > 0 or b is not None and retained(b, f, u, r) > 0)


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
        d = f"cells/{self.sid}"
        return {"P": f"{d}/a", "N": f"{d}/b", "Q": f"{d}/c"}

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
        if src is None or src.kind != "text" or not s.added or s.note in ("dup", "removal"):
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
        if s.note != "removal":
            return None
        put(tgt, dataclasses.replace(s.m, data=s.m.data + s.b.lines[9] + "\n"))
    elif kind == "reorder":
        src = s.m or (s.u if s.f in (None, s.b) else None)
        if src is None or src.kind != "text" or s.note in ("dup", "names", "removal"):
            return None
        put(tgt, dataclasses.replace(src, data="".join(l + "\n" for l in reversed(src.data.rstrip("\n").split("\n")))))
    elif kind == "extra":
        if s.op not in ("A", "R") or s.u is None or s.u.kind != "text" or s.f not in (None, s.b) and s.f != s.u:
            return None
        put(tgt, dataclasses.replace(s.u, data=s.u.data + "an extra line\n"))
    elif kind == "elsewhere":
        if s.op not in ("A", "R") or s.u is None or s.layout in ("forkren", "both"):
            return None
        put(tgt + ".moved", s.u)
    elif kind == "old-kept":
        if not ren or s.f != s.b:
            return None
        put(tgt, s.u)
        put(old, s.b)
    return res


def judged(s, kind, res):
    """The version of the file the oracle compares: the result at the file's current path, else at its old path."""
    p = s.paths
    tgt = res.get(p[s.target])
    if tgt is None and s.layout == "upren":
        tgt = res.get(p["P"])
    if tgt is None and s.f in (None, s.b, s.u):
        tgt = res.get(p[s.target] + ".moved")
    return tgt


def build_cells():
    """One cell per (scenario, result kind) that applies. Each cell has its own directory and its own contents."""
    cells, total = [], len(scenarios())
    per_kind = {kind: scenarios(f"-{kind}") for kind in RESULTS}
    for i in range(total):
        for kind in RESULTS:
            s = per_kind[kind][i]
            res = result_for(s, kind)
            if res is None:
                continue
            r = judged(s, kind, res)
            old_left = s.layout == "upren" and s.paths["P"] in res
            v = expect(s.b, s.f, s.u, r, s.op, s.added, old_left, s.layout == "forkren")
            cells.append({"id": s.sid, "n": i, "s": s, "kind": kind, "res": res, "verdict": v})
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
    """base, fork and upstream commits and a merge commit of the fork and upstream whose tree is the chosen results."""
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
    c_res = commit(repo, write_tree(repo, result), "merge", c_fork, c_up)
    git(repo, "update-ref", "refs/heads/base", c_res)
    git(repo, "checkout", "-q", "-f", "--detach", c_fork)
    merge = subprocess.run(["git", "-C", repo, "-c", "rerere.enabled=false", "merge", "--no-commit", "--no-ff", c_up],
                           capture_output=True, env=ENV)
    unmerged = len(set(git(repo, "diff", "--name-only", "--diff-filter=U", check=False).split("\n")) - {""})
    git(repo, "merge", "--abort", check=False)
    git(repo, "checkout", "-q", "-f", "--detach", c_res)
    return c_base, c_fork, c_up, unmerged


# ---- running verify-accepted ----------------------------------------------------------------------------------

LINE = re.compile(r"^- (?:FAIL|DECISION) (\S+): (\S+) — ")
WARN = re.compile(r"^- (\S+): \d+/\d+ lines")


def run_verify(tools, repo, shas, ours=(), theirs=(), strict=False):
    """-> (exit code, {cell directory: set of categories}, set of cell directories with a line warning)."""
    with tempfile.TemporaryDirectory() as tmp:
        cmd = [sys.executable, "-I", os.path.join(tools, "verify-accepted.py"), "--repo", repo,
               "--base", shas[0], "--fork", shas[1], "--upstream", shas[2]]
        for flag, paths in (("--allow-ours", ours), ("--allow-theirs", theirs)):
            if paths:
                f = os.path.join(tmp, flag[2:])
                open(f, "w").write("".join(f"{p}  # contract cell\n" for p in sorted(paths)))
                cmd += [flag, f]
        if strict:
            cmd.append("--strict-lines")
        p = subprocess.run(cmd, capture_output=True, text=True, env=ENV)
    cats, warns = collections.defaultdict(set), set()
    for line in p.stdout.split("\n"):
        m = LINE.match(line)
        if m:
            cats[cell_dir(m.group(2))].add(m.group(1))
        m = WARN.match(line)
        if m:
            warns.add(cell_dir(m.group(1)))
    return p.returncode, cats, warns, p.stdout + p.stderr


def cell_dir(path):
    m = re.match(r"cells/([^/]+)/", path)
    return m.group(1) if m else path


def evaluate_verify(tools):
    cells = build_cells()
    with tempfile.TemporaryDirectory(prefix="acceptance-cells.") as repo:
        shas = build_repo(repo, cells)[:3]
        decide = {"ours": set(), "theirs": set(), "either": set()}
        swapped = {"ours": set(), "theirs": set(), "either": set()}
        for c in cells:
            v = c["verdict"]
            if v.allow:
                for path in {p for p in c["s"].paths.values() if p.startswith("cells/")}:
                    decide[v.allow].add(path)
        right_ours = decide["ours"] | decide["either"]
        right_theirs = decide["theirs"]
        wrong_ours = decide["theirs"]
        wrong_theirs = decide["ours"] | decide["either"]
        runs = {
            "plain": run_verify(tools, repo, shas),
            "strict": run_verify(tools, repo, shas, strict=True),
            "recorded": run_verify(tools, repo, shas, right_ours, right_theirs),
            "wrong-side": run_verify(tools, repo, shas, wrong_ours, wrong_theirs),
        }
    results = []
    for c in cells:
        v, s = c["verdict"], c["s"]
        d = s.sid
        want_cats = {v.cat} if v.cat else set()
        got = {name: (r[1].get(d, set()), d in r[2]) for name, r in runs.items()}
        problems = []
        if got["plain"][0] != want_cats:
            problems.append(f"plain: want {sorted(want_cats) or 'ACCEPTED'}, got {sorted(got['plain'][0]) or 'ACCEPTED'}")
        if v.cat is None and got["plain"][1] != v.warn:
            problems.append(f"plain: line warning {'expected' if v.warn else 'not expected'}")
        strict_cats = got["strict"][0]
        if strict_cats != want_cats:
            problems.append(f"strict: want {sorted(want_cats) or 'ACCEPTED'}, got {sorted(strict_cats) or 'ACCEPTED'}")
        if v.cat is None and v.warn and not got["strict"][1]:
            problems.append("strict: the missing upstream lines were not reported")
        if v.allow:
            if got["recorded"][0]:
                problems.append(f"recorded: a decision for {d} did not clear {sorted(got['recorded'][0])}")
            wrong_clears = v.allow == "either"
            if v.allow != "either" and got["wrong-side"][0] != want_cats:
                problems.append(f"wrong-side: a decision on the other side changed {sorted(want_cats)} to {sorted(got['wrong-side'][0]) or 'ACCEPTED'}")
            if wrong_clears and got["wrong-side"][0]:
                problems.append("wrong-side: 'either' file did not clear it")
        results.append({"id": c["id"], "scenario": s, "kind": c["kind"], "verdict": v, "problems": problems})
    return results, runs


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
    cells = build_cells()
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
    cells = build_cells()
    if a.list:
        for c in cells:
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
