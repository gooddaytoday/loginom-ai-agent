#!/usr/bin/env python3
"""The oracle of the acceptance gate: what Git's own merge of the fork and an upstream commit produces.

The oracle is a mechanical function of two commits. It is `git merge-tree --write-tree` with the settings of
`sync-upstream.sh prepare` (strategy ort, no rerere, directory renames as conflicts, rename limit 30000, no renormalization,
an isolated Git configuration), followed by apply-identity on every file the merge changed relative to the fork (the same
set `apply-identity.py --since FORK` covers during a resolution). No heuristics: the same two commits give the same tree.

  oracle(repo, fork, upstream) -> Oracle(tree, entries, conflicts)
    entries    path -> (mode, blob): the oracle tree. A conflicted path holds Git's conflict-marker text (or, for
               modify/delete, the surviving side) and is never compared byte for byte: it always needs a decision.
    conflicts  path -> kind, from the stages Git leaves: content, add/add, modified-by-fork/deleted-by-upstream, ...
               When file types clash Git parks the sides at `path~<label>`; both names count as the conflict at `path`.
    parked     the names Git parked that way: not paths of the product, never compared

Usage: merge_oracle.py --repo DIR --fork SHA --upstream SHA [--print-tree | --print-conflicts]
"""
import argparse
import dataclasses
import importlib.util
import os
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("apply_identity", os.path.join(HERE, "apply-identity.py"))
_identity = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_identity)

ENV = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1", LC_ALL="C", GIT_TERMINAL_PROMPT="0",
           GIT_AUTHOR_NAME="upstream-sync", GIT_AUTHOR_EMAIL="upstream-sync@example.invalid",
           GIT_COMMITTER_NAME="upstream-sync", GIT_COMMITTER_EMAIL="upstream-sync@example.invalid")
for _var in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "TZ"):
    ENV.pop(_var, None)
MERGE_CFG = ("-c", "rerere.enabled=false", "-c", "merge.directoryRenames=conflict", "-c", "merge.conflictStyle=merge",
             "-c", "merge.renameLimit=30000", "-c", "diff.renameLimit=30000", "-c", "merge.renormalize=false",
             "-c", "core.autocrlf=false", "-c", "core.safecrlf=false", "-c", "core.ignorecase=false", "-c", "core.fsmonitor=false",
             "-c", "core.hooksPath=/dev/null", "-c", "gc.auto=0")
REGULAR = ("100644", "100755")
CONFLICT_KINDS = {
    frozenset("123"): "content",
    frozenset("12"): "modified by the fork, deleted by upstream",
    frozenset("13"): "deleted by the fork, modified by upstream",
    frozenset("23"): "added by both",
    frozenset("2"): "added by the fork in a conflict",
    frozenset("3"): "added by upstream in a conflict",
}


@dataclasses.dataclass(frozen=True)
class Oracle:
    tree: str
    entries: dict
    conflicts: dict
    parked: frozenset


def git(repo, *args, stdin=None, env=ENV, ok=(0,)):
    p = subprocess.run(["git", "-C", repo, *args], input=stdin, capture_output=True, env=env)
    if p.returncode not in ok:
        raise RuntimeError(f"git {' '.join(args)}: {p.stderr.decode(errors='replace').strip()}")
    return p.returncode, p.stdout


def tree_entries(repo, rev):
    out = {}
    for rec in git(repo, "ls-tree", "-r", "-z", rev)[1].split(b"\0"):
        if rec:
            meta, path = rec.split(b"\t", 1)
            mode, _, sha = meta.decode().split()
            out[path.decode()] = (mode, sha)
    return out


def write_tree(repo, entries):
    with tempfile.TemporaryDirectory(prefix="oracle-index.") as tmp:
        env = dict(ENV, GIT_INDEX_FILE=os.path.join(tmp, "index"))
        lines = "".join(f"{mode} {sha}\t{path}\n" for path, (mode, sha) in sorted(entries.items()))
        git(repo, "update-index", "--add", "--index-info", stdin=lines.encode(), env=env)
        return git(repo, "write-tree", env=env)[1].decode().strip()


def merge_tree(repo, fork, upstream):
    """-> (tree id, {conflicted path: kind}, parked names). Exit code 1 of merge-tree means conflicts, not failure."""
    rc, out = git(repo, *MERGE_CFG, "merge-tree", "--write-tree", "-z", fork, upstream, ok=(0, 1))
    tree, _, rest = out.partition(b"\0")
    records = [r.decode() for r in rest.split(b"\0")]
    end = records.index("") if "" in records else len(records)
    stages = {}
    for rec in records[:end]:
        meta, path = rec.split("\t", 1)
        stages.setdefault(path, set()).add(meta.split()[2])
    if bool(stages) != bool(rc):
        raise RuntimeError(f"merge-tree exit code {rc} does not match its conflict list ({len(stages)} paths)")
    parked = parked_names(records[end + 1:], (fork, upstream))
    merged = {}
    for path, found in stages.items():
        merged.setdefault(parked.get(path, path), set()).update(found)
    clash = set(parked.values())
    kinds = {path: "file types clash" if path in clash else CONFLICT_KINDS.get(frozenset(found), "conflict")
             for path, found in merged.items()}
    return tree.decode(), kinds, frozenset(parked)


def parked_names(messages, labels):
    """{parked name: path} from the messages of merge-tree -z: count, paths, type, text. Only a `distinct types` text parks a
    name, at `path~<label>`; a name of that shape that Git did not park is an ordinary path."""
    out, i = {}, 0
    while i < len(messages) and messages[i].isdigit():
        count = int(messages[i])
        paths, text = messages[i + 1:i + 1 + count], messages[i + 2 + count]
        if text.startswith("CONFLICT (distinct types)"):
            out.update({p: q for p in paths for q in paths if any(p == f"{q}~{label}" for label in labels)})
        i += count + 3
    return out


def blob_text(repo, sha):
    try:
        return git(repo, "cat-file", "blob", sha)[1].decode("utf-8")
    except UnicodeDecodeError:
        return None


def read_blobs(repo, shas):
    """{sha: bytes} through one `git cat-file --batch`."""
    shas = sorted(set(shas))
    p = subprocess.run(["git", "-C", repo, "cat-file", "--batch"], input="".join(f"{s}\n" for s in shas).encode(), capture_output=True, env=ENV, check=True)
    out, pos = {}, 0
    for sha in shas:
        end = p.stdout.index(b"\n", pos)
        size = int(p.stdout[pos:end].split()[2])
        out[sha] = p.stdout[end + 1:end + 1 + size]
        pos = end + 1 + size + 1
    return out


def apply_identity(repo, entries, fork_entries):
    """The fork's external names on every regular text file the merge changed relative to the fork."""
    changed = {path: e for path, e in entries.items() if e[0] in REGULAR and fork_entries.get(path) != e and _identity.wants(path)}
    blobs = read_blobs(repo, [sha for _, sha in changed.values()])
    mapped = {}
    for path, (mode, sha) in changed.items():
        try:
            text = blobs[sha].decode("utf-8")
        except UnicodeDecodeError:
            continue
        if _identity.transform(text) != text:
            mapped[path] = (mode, _identity.transform(text))
    out = dict(entries)
    if mapped:
        with tempfile.TemporaryDirectory(prefix="oracle-blobs.") as tmp:
            names = []
            for i, (path, (mode, text)) in enumerate(sorted(mapped.items())):
                names.append((path, mode, os.path.join(tmp, str(i))))
                with open(names[-1][2], "wb") as fh:
                    fh.write(text.encode())
            shas = git(repo, "hash-object", "-w", "--stdin-paths", stdin="".join(f"{n[2]}\n" for n in names).encode())[1].decode().split()
        for (path, mode, _), sha in zip(names, shas):
            out[path] = (mode, sha)
    return out


def oracle(repo, fork, upstream):
    tree, conflicts, parked = merge_tree(repo, fork, upstream)
    entries = apply_identity(repo, tree_entries(repo, tree), tree_entries(repo, fork))
    return Oracle(write_tree(repo, entries), entries, conflicts, parked)


def main():
    ap = argparse.ArgumentParser()
    for key in ("repo", "fork", "upstream"):
        ap.add_argument("--" + key, required=True)
    ap.add_argument("--print-tree", action="store_true")
    ap.add_argument("--print-conflicts", action="store_true")
    a = ap.parse_args()
    o = oracle(a.repo, a.fork, a.upstream)
    if a.print_conflicts:
        for path, kind in sorted(o.conflicts.items()):
            print(f"{path}\t{kind}")
    else:
        print(o.tree)


if __name__ == "__main__":
    main()
