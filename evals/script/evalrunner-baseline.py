"""Read only the exact owner-approved LAB-55 curated archive, verifying every byte."""
import hashlib
import json
import pathlib
import sys
import tarfile

EXPECTED = 'f3914febcb32f7c1cb087700215a7aa6be2ae42f38c0dd099e41cdfe46b8e932'


def read_baseline(source):
    data = pathlib.Path(source).read_bytes()
    assert len(data) == 1899014 and hashlib.sha256(data).hexdigest() == EXPECTED, 'LAB-55 archive differs'
    with tarfile.open(source, 'r:gz') as archive:
        members = archive.getmembers()
        assert len({m.name for m in members}) == len(members), 'duplicate member'
        assert all(m.isfile() and not m.name.startswith('/') and '..' not in pathlib.PurePosixPath(m.name).parts for m in members), 'unsafe member'
        manifest = json.load(archive.extractfile('delivery-manifest.json'))
        assert manifest['baselineId'] == 'f8c70eb0-88b6-457d-99a0-cd4ccb44d0b9'
        assert len({f['path'] for f in manifest['files']}) == len(manifest['files'])
        assert {m.name for m in members} == {f['path'] for f in manifest['files']} | {'delivery-manifest.json'}
        for record in manifest['files']:
            assert hashlib.sha256(archive.extractfile(record['path']).read()).hexdigest() == record['sha256'], 'baseline member differs'
        baseline = json.load(archive.extractfile('baseline.json'))
        pins = json.load(archive.extractfile('manifest.json'))['pins']
        assert baseline['cleanup'] is True and baseline['released'] is True
        assert baseline['coverage'] == {'expected': 144, 'recorded': 144, 'measured': 144, 'pending': 0, 'unknown': 0}
        assert len(baseline['rows']) == 144
        rows = []
        for row in baseline['rows']:
            assert row['state'] == 'recorded' and row['measured'] is True and row['cleanup'] is True
            summary = json.load(archive.extractfile('measurements/' + row['key'] + '/summary.json'))
            attempt = summary['tasks'][0]['attempts'][0]
            collection, case = row['caseKey'].split(':', 1)
            assert summary['task_ids'] == [case] and len(summary['tasks'][0]['attempts']) == 1
            code = json.load(archive.extractfile('measurements/' + row['key'] + '/code-verdict.json')) if collection == 'node' else None
            if code:
                assert code['code'] in [0, 1] and code['verdict'] == row['verdict']
                passed = code['code'] == 0
            else:
                passed = attempt['status'] == 'completed' and attempt['pass'] is True
                if passed:
                    required = summary['tasks'][0]['rubric_snapshot']['checklist']
                    answers = {item['id']: item['passed'] for item in attempt['checklist']}
                    assert all(answers.get(item['id']) for item in required if item['required'] or item['requires_result_file'])
                    assert attempt['oracle_pass'] is not False and attempt['score'] >= 70
            failures = list(code['failures']) if code else ['checklist:' + item['id'] for item in (attempt['checklist'] or []) if not item['passed']]
            if attempt['status'] != 'completed':
                failures.append('product:' + attempt['status'])
            if attempt['oracle_pass'] is False:
                failures.append('oracle:false')
            rows.append({'caseKey': row['caseKey'], 'round': row['attempt'], 'verdict': 'PASS' if passed else 'FAIL',
                         'status': attempt['status'], 'score': None if code else attempt['score'], 'failures': failures,
                         'durationMs': attempt['duration_ms'], 'tokens': attempt['tokens'],
                         'startedAt': summary['started_at'], 'finishedAt': summary['finished_at']})
        assert len({(r['caseKey'], r['round']) for r in rows}) == 144
        counts = {c: sum(r['verdict'] == 'PASS' for r in rows if r['caseKey'].startswith(c + ':')) for c in ['regular', 'analytic', 'node']}
        assert counts == {'regular': 9, 'analytic': 76, 'node': 10}, counts
        return {'archiveSha256': EXPECTED, 'filesVerified': len(manifest['files']), 'pins': pins, 'rows': rows}


if __name__ == '__main__':
    try:
        print(json.dumps(read_baseline(sys.argv[1]), ensure_ascii=False))
    except Exception as error:
        print('LAB-55 verification failed: ' + str(error), file=sys.stderr)
        raise SystemExit(2)
