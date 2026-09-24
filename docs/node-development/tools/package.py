#!/usr/bin/env python3
"""Package reviewed node documents and verify a separate extracted copy."""
import argparse
import hashlib
import json
import re
import tempfile
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import validate

ROOT = validate.ROOT
REPO = validate.REPO
SUFFIXES = {'.md', '.json', '.py', '.mjs', '.ts', '.sh', '.txt', '.csv', '.patch', '.diff'}
DENIED = {'.git', '.dock', '.env', 'node_modules', '__pycache__', 'profiles'}


def allowed_file(path):
    return path.suffix in SUFFIXES or path.name == '.node-version'


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def collect():
    """Keep paths intact; source attachments are evidence, not an executable bundle."""
    selected = {p.resolve() for p in ROOT.rglob('*')
                if p.is_file() and not p.is_symlink() and allowed_file(p)
                and not any(x in DENIED for x in p.parts)}
    registry = json.loads((ROOT / 'registry.json').read_text())
    provenance = json.loads((ROOT / 'provenance.json').read_text())
    for record in provenance['files'] + provenance.get('related_documents', []):
        selected.add((ROOT / record['path']).resolve())
    references = json.loads((ROOT / provenance['historical_references']).read_text())
    for record in references['references']:
        selected.add((ROOT / record['resolved_path']).resolve())
    external = []
    for evidence in registry['evidence_catalog'].values():
        if evidence.get('path'):
            selected.add((ROOT / evidence['path']).resolve())
    for node in registry['nodes']:
        for key, value in (node.get('handler') or {}).items():
            if key.endswith('source') and isinstance(value, str):
                selected.add((ROOT / value).resolve())
    scanned = set()
    while True:
        pending = sorted(p for p in selected - scanned if p.suffix == '.md')
        if not pending:
            break
        for p in pending:
            scanned.add(p)
            for label, target in validate.links(p):
                if (target.is_relative_to(REPO) and target.is_file()
                        and not target.is_symlink() and allowed_file(target)
                        and not any(x in DENIED for x in target.parts)):
                    selected.add(target)
                else:
                    external.append({'from': str(p.relative_to(REPO)), 'target': label,
                                     'available_at_packaging': target.exists(),
                                     'reason': 'outside_document_bundle_or_unavailable'})
    payload = {}
    for p in sorted(selected):
        if not p.is_relative_to(REPO) or not p.is_file() or p.is_symlink():
            raise ValueError('Unsafe or unavailable attachment: ' + str(p))
        if any(x in DENIED for x in p.parts) or not allowed_file(p):
            raise ValueError('Disallowed attachment: ' + str(p))
        data = p.read_bytes()
        # This exact sentinel tests redaction and is not a parseable private key.
        sentinel = b'-----BEGIN ' + b'OPENSSH PRIVATE KEY-----\\nprivate-control-secret\\n-----END OPENSSH PRIVATE KEY-----'
        screened = data.replace(sentinel, b'NON_KEY_REDACTION_TEST_SENTINEL')
        if re.search(rb'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bsk-[A-Za-z0-9_-]{32,}|\bAKIA[A-Z0-9]{16}\b', screened):
            raise ValueError('Possible secret in ' + str(p))
        payload['loginom-ai-agent/' + p.relative_to(REPO).as_posix()] = data
    payload['external-dependencies.json'] = json_bytes({
        'note': 'Code attachments are reference evidence, not a dependency-complete client. Web Help, Loginom, CLI binaries, OAuth and test infrastructure remain external. Historical documents have adapted navigation; original ZIP remains immutable.',
        'current_links': external,
        'historical_artifacts': json.loads((ROOT / provenance['external_artifacts']).read_text())})
    payload['README.md'] = (
        '# Документация разработки узлов Loginom AI Agent\n\n'
        'Начните с [инструкции](loginom-ai-agent/docs/node-development/README.md).\n\n'
        'Относительная структура нового репозитория сохранена. Исторические документы '
        'адаптированы только для навигации; результаты и версии прежних проверок '
        'не заменяют актуальные правила. Неизменённый исходный ZIP указан в provenance.json. Исходные приложения включены '
        'как доказательства, не как готовая установка. Недоступные и внешние '
        'зависимости перечислены в external-dependencies.json.\n\n'
        'manifest.json содержит исходные ревизии, размеры и SHA256 файлов; '
        'SHA256SUMS включает также manifest.json. Ревизии описывают базу, '
        'содержимое учитывает незакоммиченные документы. Никаких live-прогонов '
        'или новых подтверждений аналитической правильности этот архив не добавляет.\n'
    ).encode()
    manifest = {'schema_version': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
                'repositories': provenance['repositories'],
                'source_policy': provenance['source_policy'],
                'files': [{'path': name, 'bytes': len(data), 'sha256': validate.sha(data)}
                          for name, data in sorted(payload.items())]}
    payload['manifest.json'] = json_bytes(manifest)
    payload['SHA256SUMS'] = ''.join(f'{validate.sha(data)}  {name}\n'
                                  for name, data in sorted(payload.items())).encode()
    return payload, manifest


def verify(zip_path, destination):
    """Reject unsafe names and compare the exact inventory, bytes and checksums."""
    with zipfile.ZipFile(zip_path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate archive entries')
        for name in names:
            if Path(name).is_absolute() or '..' in Path(name).parts:
                raise ValueError('Unsafe archive entry')
        if archive.testzip() is not None:
            raise ValueError('ZIP integrity check failed')
        archive.extractall(destination)
    manifest = json.loads((destination / 'manifest.json').read_text())
    expected = {item['path'] for item in manifest['files']} | {'manifest.json', 'SHA256SUMS'}
    actual = {p.relative_to(destination).as_posix() for p in destination.rglob('*') if p.is_file()}
    if actual != expected:
        raise ValueError('Extracted inventory differs')
    for item in manifest['files']:
        data = (destination / item['path']).read_bytes()
        if len(data) != item['bytes'] or validate.sha(data) != item['sha256']:
            raise ValueError('Extracted content differs: ' + item['path'])
    checksums = {}
    for line in (destination / 'SHA256SUMS').read_text().splitlines():
        digest, name = line.split('  ', 1)
        if name in checksums:
            raise ValueError('Duplicate checksum entry')
        checksums[name] = digest
    if set(checksums) != expected - {'SHA256SUMS'}:
        raise ValueError('Checksum inventory differs')
    for name, digest in checksums.items():
        if validate.sha((destination / name).read_bytes()) != digest:
            raise ValueError('Checksum mismatch: ' + name)
    return len(actual)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-root', type=Path,
                        default=Path.home() / 'Backups/loginom-node-development')
    args = parser.parse_args()
    result = validate.check()
    if result['errors']:
        raise SystemExit(json.dumps(result, ensure_ascii=False, indent=2))
    payload, manifest = collect()
    repos = manifest['repositories']
    name = (datetime.now().strftime('%Y%m%d-%H%M%S') + '-agent-' +
            repos['loginom-ai-agent']['commit'][:8] + '-dock-' +
            repos['loginom-dock']['commit'][:8])
    args.output_root.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix=name + '-', dir=args.output_root))
    archive_path = output / (name + '.zip')
    with zipfile.ZipFile(archive_path, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for path, data in sorted(payload.items()):
            archive.writestr(path, data)
    restored = output / 'restored'
    restored.mkdir()
    count = verify(archive_path, restored)
    restored_check = subprocess.run(
        [sys.executable, '-B', str(restored / 'loginom-ai-agent/docs/node-development/tools/validate.py')],
        capture_output=True, text=True)
    if restored_check.returncode:
        raise ValueError('Restored documentation validation failed: ' + restored_check.stdout + restored_check.stderr)
    restored_validation = json.loads(restored_check.stdout)
    with archive_path.open('rb') as stream:
        checksum = hashlib.file_digest(stream, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else validate.sha(stream.read())
    archive_path.with_suffix('.zip.sha256').write_text(checksum + '  ' + archive_path.name + '\n')
    report = {'status': 'PASS', 'archive': str(archive_path), 'sha256': checksum,
              'restored': str(restored), 'files_verified': count,
              'payload_bytes': sum(len(x) for x in payload.values()),
              'zip_bytes': archive_path.stat().st_size, 'documentation_validation': result,
              'restored_documentation_validation': restored_validation}
    (output / 'verification.json').write_bytes(json_bytes(report))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
