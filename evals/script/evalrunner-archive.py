"""Curated standalone evidence delivery; no environment, history, or raw tool logs."""
import hashlib
import io
import json
import pathlib
import sys
import tarfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def create(series, target):
    series = pathlib.Path(series).resolve()
    receipt = json.loads((series / 'release.json').read_text())
    assert receipt['status'] == 'RELEASED', 'release required'
    assert receipt.get('evidence'), 'raw evidence required'
    for record in receipt['evidence']:
        source = series / record['path']
        assert source.resolve().is_relative_to(series) and not source.is_symlink(), 'unsafe evidence'
        assert digest(source.read_bytes()) == record['sha256'], 'raw evidence changed'
    run = pathlib.Path(receipt['runDir']).resolve()
    assert run.is_relative_to(series), 'foreign run'
    assert digest((run / 'summary.json').read_bytes()) == receipt['summarySha256'], 'summary changed'
    files = {'release.json': series / 'release.json'}
    if (series / 'pins.json').is_file():
        files['pins.json'] = series / 'pins.json'
    for name in ['summary.json', 'report.md', 'code-verdict.json', 'code-report.md']:
        if (run / name).is_file():
            files['run/' + name] = run / name
    for p in run.glob('*/[0-9]*/artifact/**/*'):
        if p.is_file() and p.suffix in ['.lgp', '.csv']:
            files['run/' + p.relative_to(run).as_posix()] = p
    records = []
    with tarfile.open(target, 'w:gz') as archive:
        for name, source in sorted(files.items()):
            assert source.is_file() and not source.is_symlink(), 'unsafe evidence'
            data = source.read_bytes()
            records.append({'path': name, 'size': len(data), 'sha256': digest(data)})
            member = tarfile.TarInfo(name)
            member.mode = 0o600
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
        data = json.dumps({'kind': 'evalrunner-delivery', 'version': 1, 'files': records}, sort_keys=True).encode()
        member = tarfile.TarInfo('delivery-manifest.json')
        member.mode = 0o600
        member.size = len(data)
        archive.addfile(member, io.BytesIO(data))
    pathlib.Path(target).chmod(0o600)
    print(json.dumps({'archive': str(target), 'sha256': digest(pathlib.Path(target).read_bytes()), 'files': len(records)}))


def verify(source, expected):
    assert digest(pathlib.Path(source).read_bytes()) == expected, 'archive hash changed'
    with tarfile.open(source, 'r:gz') as archive:
        members = archive.getmembers()
        assert all(m.isfile() and not m.name.startswith('/') and '..' not in pathlib.PurePosixPath(m.name).parts for m in members), 'unsafe member'
        assert len({m.name for m in members}) == len(members), 'duplicate member'
        manifest = json.load(archive.extractfile('delivery-manifest.json'))
        assert manifest['kind'] == 'evalrunner-delivery' and manifest['version'] == 1
        assert sorted(m.name for m in members) == sorted([r['path'] for r in manifest['files']] + ['delivery-manifest.json'])
        for record in manifest['files']:
            data = archive.extractfile(record['path']).read()
            assert len(data) == record['size'] and digest(data) == record['sha256'], 'member changed'
        print(json.dumps({'status': 'VERIFIED', 'files': [r['path'] for r in manifest['files']]}))


if __name__ == '__main__':
    if sys.argv[1] == 'create':
        create(*sys.argv[2:])
    elif sys.argv[1] == 'verify':
        verify(*sys.argv[2:])
    else:
        raise SystemExit('expected create|verify')
