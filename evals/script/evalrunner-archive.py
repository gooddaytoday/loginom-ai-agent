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
    files = {'release.json': series / 'release.json'}
    versioned = receipt.get('kind') == 'evalrunner-full-series-release'
    if versioned:
        manifest = json.loads((series / 'manifest.json').read_text())
        expected = 144 if manifest['scope'] == 'full' else 1
        assert receipt['scope'] == manifest['scope'] and receipt['expected'] == receipt['completed'] == expected, 'coverage unconfirmed'
        assert len(manifest['slots']) == len({slot['id'] for slot in manifest['slots']}) == expected, 'slot coverage differs'
        for name in ['manifest.json', 'cli-manifest.json', 'qualification.json', 'summary.json', 'finalizing.json']:
            if (series / name).is_file():
                files[name] = series / name
        for slot in manifest['slots']:
            selected = series / 'slots' / slot['id']
            assert selected.resolve().is_relative_to(series) and not selected.is_symlink(), 'foreign slot'
            child = json.loads((selected / 'release.json').read_text())
            assert child['status'] == 'RELEASED', 'slot release required'
            completion = series / 'completions' / (slot['id'] + '.json')
            assert json.loads(completion.read_text())['model']['status'] == 'VERIFIED', 'model proof required'
            files['completions/' + slot['id'] + '.json'] = completion
            for name in ['manifest.json', 'pins.json', 'release.json']:
                if (selected / name).is_file():
                    files['slots/' + slot['id'] + '/' + name] = selected / name
            run = pathlib.Path(child['runDir']).resolve()
            assert run.is_relative_to(selected), 'foreign run'
            assert digest((run / 'summary.json').read_bytes()) == child['summarySha256'], 'summary changed'
            public_run_files(files, 'slots/' + slot['id'] + '/run/', run)
        if manifest['scope'] == 'full':
            comparison = json.loads((series / 'comparison-receipt.json').read_text())
            assert comparison['releaseSha256'] == digest((series / 'release.json').read_bytes()), 'comparison release changed'
            assert comparison['baselineArchiveSha256'] == 'f3914febcb32f7c1cb087700215a7aa6be2ae42f38c0dd099e41cdfe46b8e932', 'baseline changed'
            assert comparison['jsonSha256'] == digest((series / 'comparison.json').read_bytes()), 'comparison changed'
            assert comparison['markdownSha256'] == digest((series / 'comparison.md').read_bytes()), 'comparison report changed'
            for name in ['comparison.json', 'comparison.md', 'comparison-receipt.json']:
                files[name] = series / name
    else:
        run = pathlib.Path(receipt['runDir']).resolve()
        assert run.is_relative_to(series), 'foreign run'
        assert digest((run / 'summary.json').read_bytes()) == receipt['summarySha256'], 'summary changed'
        if (series / 'pins.json').is_file():
            files['pins.json'] = series / 'pins.json'
        public_run_files(files, 'run/', run)
    write_archive(files, target, 2 if versioned else 1)


def public_run_files(files, prefix, run):
    for name in ['summary.json', 'report.md', 'code-verdict.json', 'code-report.md']:
        if (run / name).is_file():
            files[prefix + name] = run / name
    for p in run.glob('*/[0-9]*/artifact/**/*'):
        if p.is_file() and p.suffix in ['.lgp', '.csv']:
            files[prefix + p.relative_to(run).as_posix()] = p


def write_archive(files, target, version):
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
        data = json.dumps({'kind': 'evalrunner-delivery', 'version': version, 'files': records}, sort_keys=True).encode()
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
        assert manifest['kind'] == 'evalrunner-delivery' and manifest['version'] in [1, 2]
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
