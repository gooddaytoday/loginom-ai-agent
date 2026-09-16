"""Prepare, hash and dry-check selected R2 changes; never apply them."""
import argparse
import difflib
import hashlib
import json
import re
import subprocess
from pathlib import Path

SOURCE = 'a63586fe096f4fd7f17f346c391834d3e34bdaa4'
FILES = [f'client/lib/{name}.mjs' for name in ['node-apply', 'node-execution-evidence',
    'node-execution-procedure', 'node-operation-runner', 'node-process-context', 'node-result-schema']]
FILES += ['client/lib/node-contracts.d.ts']
FILES += [f'client/test/{name}.test.mjs' for name in ['node-apply', 'node-execution-evidence',
    'node-execution-focus', 'node-operation-failure']]


def git(*args, check=True):
    return subprocess.run(['git', *args], capture_output=True, check=check)


def blob(revision, path):
    result = git('rev-parse', '--verify', revision + ':' + path, check=False)
    return result.stdout.decode().strip() if result.returncode == 0 else None


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main(directory):
    target = git('rev-parse', 'HEAD').stdout.decode().strip()
    if git('diff', 'HEAD', '--', *FILES).stdout:
        raise SystemExit('Commit relevant target source files before freezing the transfer base')
    directory.mkdir(parents=True, exist_ok=True)
    chunks, source_chunks, files = [], [], []
    for path in FILES:
        original = git('diff', SOURCE + '^', SOURCE, '--', path).stdout.decode()
        selected = original
        if path.endswith('node-result-schema.mjs'):
            before = git('show', SOURCE + '^:' + path).stdout.decode()
            after = git('show', SOURCE + ':' + path).stdout.decode()
            old = before[before.index('const execution='):before.index('const receipt=')]
            new = after[after.index('const execution='):after.index('const receipt=')]
            selected_after = before.replace(old, new, 1).replace("'local_node_stopped'),", "'local_node_stopped','local_node_failed'),", 1)
            selected = f'diff --git a/{path} b/{path}\n' + ''.join(difflib.unified_diff(
                before.splitlines(keepends=True), selected_after.splitlines(keepends=True),
                fromfile='a/' + path, tofile='b/' + path))
            if 'missingValues' in ''.join(line for line in selected.splitlines() if line.startswith('+')):
                raise SystemExit('Unrelated missing-values schema entered the selected patch')
        source_selected = selected
        source_chunks.append(source_selected)
        if path in ('client/lib/node-contracts.d.ts', 'client/test/node-apply.test.mjs'):
            before_target = git('show', target + ':' + path).stdout.decode()
            after_target = before_target
            # Preserve node13 additions in context; transfer only the exact source edits.
            changes = [line for line in source_selected.splitlines(keepends=True)
                       if line[:1] in ('+', '-') and not line.startswith(('+++', '---'))]
            if path.endswith('.d.ts'):
                groups = re.findall(r'(?m)^-(?!-).*\n(?:^\+.*\n)+', source_selected)
                for group in groups:
                    lines = group.splitlines(keepends=True)
                    old, new = lines[0][1:], ''.join(line[1:] for line in lines[1:])
                    if after_target.count(old) != 1:
                        raise SystemExit('Target contract replacement is not unique')
                    after_target = after_target.replace(old, new, 1)
            else:
                removed = [line[1:] for line in changes if line.startswith('-')]
                added = [line[1:] for line in changes if line.startswith('+')]
                if len(removed) != 1 or after_target.count(removed[0]) != 1:
                    raise SystemExit('Target test assertion replacement is not unique')
                after_target = after_target.replace(removed[0], added[0], 1)
                after_target += ''.join(added[1:])
            selected = f'diff --git a/{path} b/{path}\n' + ''.join(difflib.unified_diff(
                before_target.splitlines(keepends=True), after_target.splitlines(keepends=True),
                fromfile='a/' + path, tofile='b/' + path))
            transferred = [line for line in selected.splitlines(keepends=True)
                           if line[:1] in ('+', '-') and not line.startswith(('+++', '---'))]
            if changes != transferred:
                raise SystemExit('Context adaptation altered source change payload: ' + path)
        chunks.append(selected)
        files.append(dict(path=path, source_parent_blob=blob(SOURCE + '^', path), source_blob=blob(SOURCE, path),
            target_blob=blob(target, path), original_diff_sha256=sha(original.encode()),
            source_selected_diff_sha256=sha(source_selected.encode()), selected_diff_sha256=sha(selected.encode()),
            source_selected_hunks=[dict(header=h.splitlines()[0], sha256=sha(h.encode()))
                for h in re.findall(r'(?ms)^@@ .*?(?=^@@ |\Z)', source_selected)],
            hunks=[dict(header=h.splitlines()[0], sha256=sha(h.encode()))
                   for h in re.findall(r'(?ms)^@@ .*?(?=^@@ |\Z)', selected)]))
    patch = ''.join(chunks).encode()
    patch_path = directory / 'terminal-failure.patch'
    patch_path.write_bytes(patch)
    source_patch = ''.join(source_chunks).encode()
    (directory / 'source-selected.patch').write_bytes(source_patch)
    before = {p: sha(Path(p).read_bytes()) if Path(p).exists() else None for p in FILES}
    result = git('apply', '--check', str(patch_path), check=False)
    after = {p: sha(Path(p).read_bytes()) if Path(p).exists() else None for p in FILES}
    if before != after:
        raise SystemExit('Dry check unexpectedly changed target files')
    manifest = dict(source_commit=SOURCE, source_parent=git('rev-parse', SOURCE + '^').stdout.decode().strip(),
        target_commit=target, patch_sha256=sha(patch), source_selected_patch_sha256=sha(source_patch), files=files,
        applicability=dict(command='git apply --check terminal-failure.patch', exit_code=result.returncode,
            stdout=result.stdout.decode(), stderr=result.stderr.decode(), working_files_unchanged=True),
        applied=False, transfer_authorized=False,
        exclusions=['missing_values configuration schema/readback test', 'input_mapping recovery', 'new node14 target-placement fix'])
    (directory / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(source=SOURCE, target=target, patch_sha256=manifest['patch_sha256'],
        applicable=result.returncode == 0, files=len(files), applied=False), indent=2))
    if result.returncode:
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    main(parser.parse_args().directory)
