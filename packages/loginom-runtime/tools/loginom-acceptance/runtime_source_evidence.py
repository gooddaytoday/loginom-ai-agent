"""Check session source inventory against the current checkout before accepting a run."""
from hashlib import sha256
from pathlib import Path


def verify_runtime_sources(session, base):
    base = Path(base).resolve()
    manifest = session.get('clientSourceManifest', [])
    paths = [e.get('path') for e in manifest]
    required = {'./' + str(p.relative_to(base)).replace('\\', '/') for p in base.rglob('*')
                if p.is_file() and (p.name.endswith('.mjs') or p.name.endswith('.d.ts'))}
    if not manifest or None in paths or len(set(paths)) != len(paths) or paths != sorted(paths) or not required.issubset(paths):
        return {'passed': False, 'failures': ['runtime_inventory_incomplete']}
    digest = sha256()
    failures = []
    root = base.parent.parent
    for entry in manifest:
        path = (base / entry['path']).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            failures.append('runtime_source_outside_checkout')
            continue
        content = path.read_bytes()
        if sha256(content).hexdigest() != entry.get('sha256'):
            failures.append('runtime_source_changed:' + entry['path'])
        digest.update((entry['path'] + '\0').encode())
        digest.update(content)
    if digest.hexdigest() != session.get('clientRevision'):
        failures.append('runtime_revision_mismatch')
    return {'passed': not failures, 'failures': failures, 'files_verified': len(manifest), 'runtime_revision': digest.hexdigest()}
