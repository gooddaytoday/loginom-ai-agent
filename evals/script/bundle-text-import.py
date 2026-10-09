#!/usr/bin/env python3
"""Reproducible, allowlisted assignments; never delivers checker-side files."""
import argparse
import hashlib
import json
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
args = argparse.ArgumentParser()
args.add_argument('--out', type=pathlib.Path, required=True)
out = args.parse_args().out
out.mkdir(mode=0o700)
registry = json.loads((root / 'src/text-import-cases.json').read_text())
groups = []
for group in registry['groups']:
    files = {}
    for case_id in group['ids']:
        case = root / 'drafts/text-import' / case_id
        task = json.loads((case / 'task.json').read_text())
        spec = json.loads((case / 'SPEC.json').read_text())
        files[case_id + '/TASK.md'] = (case / 'TASK.md').read_bytes()
        for name in task['inputs']:
            relative = pathlib.PurePosixPath(name)
            assert not relative.is_absolute() and '..' not in relative.parts and relative.parts[0] == 'data'
            data = (case / name).read_bytes()
            expected = next(item for item in spec['inputs'] if item['path'] == name)
            assert len(data) == expected['bytes'] and hashlib.sha256(data).hexdigest() == expected['sha256']
            files[case_id + '/' + name] = data
    manifest = {'version': 1, 'card': group['card'], 'ids': group['ids'], 'scope': 'INPUTS_ONLY', 'runtime': 'NOT_RUN',
        'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in sorted(files.items())]}
    files['manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    name = f"text-import-card-{group['card']}-inputs.zip"
    with zipfile.ZipFile(out / name, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for entry, data in sorted(files.items()):
            info = zipfile.ZipInfo(entry, (2026, 10, 9, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compresslevel=9)
    data = (out / name).read_bytes()
    groups.append({'card': group['card'], 'ids': group['ids'], 'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
(out / 'manifest.json').write_text(json.dumps({'version': 1, 'runtime': 'NOT_RUN', 'groups': groups}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'groups': len(groups), 'cases': sum(len(group['ids']) for group in groups), 'runtime': 'NOT_RUN'}))
