"""Produce an exact minimal source archive for a coordinator's VPS build.

Never builds a catalog, publishes, launches a browser, or starts a model.
"""
import argparse
import gzip
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path
from preflight import runtime_pin

ROOT = Path(__file__).resolve().parents[2]
SOURCE = '5a4c46fc3a9eb19c0fb440c19decdd1931df7b82'
VERSION = '2026.09.13-node13-acceptance.1-5a4c46fc-candidate'
ENTRY = 'deploy/loginom-dock/build-action-catalog.mjs'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_files():
    selected = {}
    def add(name):
        name = (ROOT/name).resolve().relative_to(ROOT).as_posix()
        if name in selected:
            return
        data = subprocess.check_output(['git', 'show', SOURCE+':'+name], cwd=ROOT)
        if data != (ROOT/name).read_bytes():
            raise ValueError('Selected source differs from authorized commit: '+name)
        selected[name] = data
        if name.endswith('.mjs'):
            for relative in re.findall(r"(?:from\s*|import\s*)['\"](\.[^'\"]+)['\"]", data.decode()):
                add((Path(name).parent/relative).as_posix())
    add(ENTRY)
    for p in sorted((ROOT/'executor/catalog').glob('*.json')):
        add(p.relative_to(ROOT).as_posix())
    return selected


def archive(files):
    target = io.BytesIO()
    with gzip.GzipFile(fileobj=target, mode='wb', filename='', mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name, data in sorted(files.items()):
                info = tarfile.TarInfo(name); info.size = len(data); info.mode = 0o644
                info.uid = info.gid = info.mtime = 0
                tar.addfile(info, io.BytesIO(data))
    return target.getvalue()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args(); args.output.mkdir(parents=True, exist_ok=True)
    files = source_files(); data = archive(files)
    if data != archive(files):
        raise ValueError('Non-deterministic source archive')
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as tar:
        if {m.name: tar.extractfile(m).read() for m in tar.getmembers()} != files:
            raise ValueError('Archive readback differs')
    runtime = runtime_pin(ROOT)
    if runtime['client_revision'] != '2488fdaa08e4d6da9b7a31fb7598f675a8ad972efd65640b34cbc851feb16e2b':
        raise ValueError('Client runtime changed')
    compatibility = dict(profile_id='loginom-7.4.2-macos-chromium-ru', loginom_build='7.4.2', platform='macos', browser='chromium')
    result = dict(scope='candidate_source_preparation_only', source_commit=SOURCE, proposed_version=VERSION,
        decision='new_candidate_required', existing_candidate_reused=False, model_started=False,
        reason='Historical parallel-pilot candidate is excluded by admission and grants test-1/test-2 as well as test-3.',
        source_archive=dict(path='candidate-source.tar.gz', sha256=sha(data), bytes=len(data)),
        files={name: dict(sha256=sha(value), bytes=len(value), git_blob=subprocess.check_output(['git','rev-parse',SOURCE+':'+name],cwd=ROOT,text=True).strip()) for name,value in sorted(files.items())},
        runtime_source_pin=runtime, compatibility=compatibility, allowed_roots=['/test-3'],
        build_argv=['node',ENTRY,'--out','OUT_NEW_EMPTY','--version',VERSION,'--candidate','--package-root','/test-3','--compatibility','PACKET/compatibility.json'],
        catalog_manifest_uri='viking://resources/loginom-dock/catalogs/executor-preview/releases/'+VERSION+'/manifest.json',
        catalog_manifest_sha256=None, published=False,
        limitations=['Archive contains catalog builder transitive source dependencies and catalog JSON only, not a client release.',
                    'VPS build, staged readback, current environment check and explicit coordinator slot remain required.'])
    for name, value in [('candidate-source.tar.gz',data),('manifest.json',(json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode()),('compatibility.json',(json.dumps(compatibility,indent=2)+'\n').encode())]:
        with (args.output/name).open('xb') as f:
            f.write(value)
    print(json.dumps(dict(passed=True,files=len(files),archive_sha256=sha(data),manifest_sha256=sha((args.output/'manifest.json').read_bytes()),model_started=False)))


if __name__ == '__main__':
    main()
