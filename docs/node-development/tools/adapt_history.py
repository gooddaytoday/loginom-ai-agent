#!/usr/bin/env python3
"""Adapt the reviewed ZIP's historical documents; never extract runtime over source.

Dry-run by default. The immutable ZIP provides the original bytes and hashes.
Duplicate cleanup is deliberately separate and requires a successful validation.
"""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import posixpath
import re
from urllib.parse import unquote
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
ARCHIVE_PREFIX = 'loginom-ai-agent/docs/node-development/'
OLD_ROOT = re.compile(r'(?:/Users/[^/]+/Git/|~/Git/)loginom-dock/?')
LOCAL_TOKEN = re.compile(r'(?<![\w/.-])(?:\$\{?ROOT\}?/)?(?:\.dock|\.worktrees|client|tools|executor|adapters|docs)/[^\s`\"\'<>|,;()\[\]{}]+')
ABS_TOKEN = re.compile(r'(?:/Users/[^/]+/Git/|~/Git/)loginom-dock(?:/[^\s`\"\'<>|,;()\[\]{}]*)?')
LINK = re.compile(r'\[([^\]\n]+)\]\(([^\n)]+)\)')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative(target, base):
    return Path(os.path.relpath(target, base)).as_posix()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def build(archive_path):
    source_map = json.loads((REPO / 'docs/migration/source-map.json').read_text())['files']
    migration = {x['sourcePath']: x['destination'] for x in source_map
                 if x['sourceRepo'] == 'loginom-dock' and x['disposition'] == 'active'}
    with zipfile.ZipFile(archive_path) as archive:
        original = json.loads(archive.read(ARCHIVE_PREFIX + 'provenance.json'))
        sources = {x['source_path']: archive.read(ARCHIVE_PREFIX + x['path'])
                   for x in original['files']}
    originals = {x['source_path']: x for x in original['files']}
    current = json.loads((ROOT / 'provenance.json').read_text())
    previous = {x['source_path']: x for x in current['files']} if current.get('schema_version') == 2 else {}
    if previous and current['source_archive']['sha256'] != sha(archive_path.read_bytes()):
        raise ValueError('Different original archive')
    for name, data in sources.items():
        if sha(data) != originals[name]['sha256']:
            raise ValueError('Original checksum mismatch: ' + name)
    destinations = {}
    dispositions = {}
    for name, data in sources.items():
        if name in previous:
            destinations[name] = (ROOT / previous[name]['path']).resolve()
            dispositions[name] = previous[name]['disposition']
            continue
        candidate = REPO / migration.get(name, 'services/loginom-ai/' + name)
        same = candidate.is_file() and candidate.read_bytes() == data
        banner_only = (candidate.is_file() and candidate.suffix == '.md' and
                       '\n'.join(candidate.read_text().splitlines()[2:]) + '\n' == data.decode())
        if same or banner_only:
            destinations[name] = candidate
            dispositions[name] = 'reuse_identical' if same else 'reuse_navigation_banner'
        else:
            destinations[name] = ROOT / 'history/supplements' / name
            dispositions[name] = 'preserve_distinct_version' if candidate.exists() else 'add_missing_document'
    external = {}
    historical_references = {}

    def unavailable(name, target):
        normalized = OLD_ROOT.sub('loginom-dock:', target)
        key = 'artifact-' + sha(normalized.encode())[:16]
        entry = external.setdefault(key, {
            'id': key, 'reference': normalized,
            'status': 'not_migrated_or_unavailable', 'resolved_path': None,
            'meaning': 'Исторический материал не включён в новый репозиторий. Наличие и доступность не подтверждены; новый путь не выдумывается.',
            'sources': []})
        if name not in entry['sources']:
            entry['sources'].append(name)
        return key

    def resolve(name, target, markdown_link=False):
        target = unquote(target).strip('<>')
        was_absolute = bool(OLD_ROOT.match(target))
        if OLD_ROOT.match(target):
            target = OLD_ROOT.sub('', target, count=1)
            target = re.sub(r'^\.worktrees/[^/]+/', '', target)
        elif target.startswith('${ROOT}/'):
            target = target[8:]
        elif target.startswith('$ROOT/'):
            target = target[6:]
        if not target:
            return None
        if markdown_link and not was_absolute:
            contextual = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
            if contextual in destinations:
                return destinations[contextual]
            if contextual in migration and (REPO / migration[contextual]).exists():
                return REPO / migration[contextual]
        if target in destinations:
            return destinations[target]
        if target in migration and (REPO / migration[target]).exists():
            return REPO / migration[target]
        if target.startswith(('./', '../')) or '/' not in target:
            candidate = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
            if candidate in destinations:
                return destinations[candidate]
            if candidate in migration and (REPO / migration[candidate]).is_file():
                return REPO / migration[candidate]
        # Markdown relative paths can contain subdirectories without ../.
        candidate = posixpath.normpath(posixpath.join(posixpath.dirname(name), target))
        if candidate in destinations:
            return destinations[candidate]
        if candidate in migration and (REPO / migration[candidate]).is_file():
            return REPO / migration[candidate]
        # An existing new-repository path is already correctly adapted.
        if target.startswith(('packages/', 'services/', 'apps/')) and (REPO / target).is_file():
            return REPO / target
        return None

    writes = {}
    records = []
    for name, data in sources.items():
        dest = destinations[name]
        # The historical catalog is also a live runtime asset: reference, never modify it.
        if dest.is_relative_to(REPO / 'packages'):
            adapted = data
            actions = ['referenced_existing_bytes_without_runtime_change']
        else:
            text = data.decode()
            replacements = Counter()
            tokens = {}

            def protect(value):
                key = f'@@NODEDOCLINK{len(tokens)}@@'
                tokens[key] = value
                return key

            def link(match):
                label, target = match.groups()
                if re.match(r'^[a-zA-Z][\w+.-]*:', target) or target.startswith('#'):
                    return protect(match.group())
                path, sep, anchor = target.partition('#')
                resolved = resolve(name, path, markdown_link=True)
                if resolved is not None:
                    value = relative(resolved, dest.parent) + (sep + anchor if sep else '')
                    replacements['resolved_links'] += 1
                else:
                    key = unavailable(name, target)
                    value = relative(ROOT / 'history/unavailable.md', dest.parent) + '#' + key
                    replacements['classified_links'] += 1
                return protect(f'[{label}]({value})')

            if dest.suffix == '.md':
                text = LINK.sub(link, text)

            def token(match):
                raw = match.group()
                path = raw.rstrip('.:')
                suffix = raw[len(path):]
                resolved = resolve(name, path)
                if resolved is not None:
                    replacements['resolved_paths'] += 1
                    new = relative(resolved, REPO) if resolved != REPO else '.'
                    if dest.suffix == '.json':
                        # A historical pin/hash must stay tied to its original identity.
                        # The current file location is only a separate navigation aid.
                        normalized = OLD_ROOT.sub('loginom-dock:', path)
                        key = 'ref-' + sha(normalized.encode())[:16]
                        item = historical_references.setdefault(key, {
                            'id': key, 'original_reference': normalized,
                            'resolved_path': relative(resolved, ROOT),
                            'resolution_scope': 'navigation_only_not_historical_hash_or_acceptance',
                            'sources': []})
                        if name not in item['sources']:
                            item['sources'].append(name)
                        new = 'historical-ref:' + key
                else:
                    new = 'unavailable:' + unavailable(name, path)
                    replacements['classified_paths'] += 1
                return protect(new + suffix)

            text = ABS_TOKEN.sub(token, text)
            text = LOCAL_TOKEN.sub(token, text)
            for key, value in tokens.items():
                text = text.replace(key, value)
            if dest.suffix == '.json':
                parsed = json.loads(text)
                if isinstance(parsed, dict):
                    parsed['_documentation_adaptation'] = {
                        'historical': True,
                        'source_id': 'source-' + sha(name.encode())[:12],
                        'provenance': relative(ROOT / 'provenance.json', dest.parent),
                        'path_semantics': 'historical-ref identifies the original source; its recorded hash is not the hash of the current resolved_path. unavailable identifies evidence without a confirmed new location.'}
                    text = json.dumps(parsed, ensure_ascii=False, indent=2) + '\n'
            else:
                doc_id = 'source-' + sha(name.encode())[:12]
                notice = (f'> Исторический документ, адаптированный для навигации в Loginom AI Agent. '
                          f'Даты, версии, SHA и результаты относятся к прежним проверкам. '
                          f'Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. '
                          f'Исходник `{doc_id}` и изменения: '
                          f'[происхождение]({relative(ROOT / "provenance.json", dest.parent)}). '
                          f'`unavailable:artifact-*` означает [неперенесённый материал]({relative(ROOT / "history/unavailable.md", dest.parent)}). '
                          f'Актуальная работа: [регламент]({relative(ROOT / "README.md", dest.parent)}).\n\n')
                text = notice + text
            adapted = text.encode()
            actions = [{'type': k, 'count': v} for k, v in sorted(replacements.items())]
        writes[dest] = adapted
        records.append({
            'id': 'source-' + sha(name.encode())[:12],
            'source_repo': 'loginom-dock', 'source_path': name,
            'source_commit': original['repositories']['loginom-dock']['commit'],
            'original_archive_entry': ARCHIVE_PREFIX + originals[name]['path'],
            'source_sha256': sha(data), 'source_bytes': len(data),
            'path': relative(dest, ROOT), 'repo_path': relative(dest, REPO),
            'adapted_sha256': sha(adapted), 'bytes': len(adapted),
            'disposition': dispositions[name], 'transformations': actions})
    external_items = sorted(external.values(), key=lambda x: x['id'])
    report = ['# Неперенесённые исторические материалы', '',
              'Это каталог ссылок, а не очередь восстановления. Материалы не копировались, '
              'их доступность в старой среде не подтверждается. Удалённая диагностика 03–10 '
              'описана в историческом отчёте очистки. Идентификаторы в адаптированных '
              'документах заменяют адреса, которым нет подтверждённого соответствия в новом репозитории.', '',
              '[Машиночитаемый перечень](unavailable.json). Оригинальное написание — '
              'в неизменённом ZIP, указанном в [provenance](../provenance.json).', '']
    for entry in external_items:
        report += [f'<a id="{entry["id"]}"></a>', f'## {entry["id"]}', '',
                   f'- Ссылка источника: `{entry["reference"]}`.',
                   '- Статус: не перенесён или недоступен; путь в новом репозитории отсутствует.',
                   '- Источники: ' + ', '.join('`' + n + '`' for n in entry['sources']) + '.', '']
    writes[ROOT / 'history/unavailable.md'] = '\n'.join(report).encode()
    writes[ROOT / 'history/unavailable.json'] = (json.dumps({'schema_version': 1, 'artifacts': external_items}, ensure_ascii=False, indent=2) + '\n').encode()
    writes[ROOT / 'history/references.json'] = (json.dumps({
        'schema_version': 1,
        'meaning': 'Original logical identities from historical JSON. resolved_path is current navigation only; hashes and acceptance remain historical. Original spelling is recoverable from the immutable ZIP.',
        'references': sorted(historical_references.values(), key=lambda x: x['id'])
    }, ensure_ascii=False, indent=2) + '\n').encode()
    provenance = {
        'schema_version': 2, 'date': '2026-09-24', 'path_base': 'docs/node-development',
        'scope': 'Adapted documentation; historical acceptance and runtime behavior unchanged.',
        'repositories': original['repositories'],
        'source_archive': {'name': archive_path.name, 'sha256': sha(archive_path.read_bytes()),
                           'bytes': archive_path.stat().st_size, 'policy': 'Immutable original, retained outside Git in ~/Backups/loginom-node-development.'},
        'files': records, 'external_artifacts': 'history/unavailable.json',
        'historical_references': 'history/references.json',
        'source_policy': 'source_sha256 hashes original ZIP bytes; adapted_sha256 hashes navigable documentation. No current live acceptance inferred.'}
    return writes, provenance


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    current = json.loads((ROOT / 'provenance.json').read_text())
    if current['schema_version'] != 1:
        raise SystemExit('Already adapted: validate the existing provenance instead of overwriting edits.')
    writes, provenance = build(args.archive)
    if args.apply:
        for path, data in writes.items():
            if path.is_relative_to(REPO / 'packages'):
                if path.read_bytes() != data:
                    raise ValueError('Refusing to change runtime asset')
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        write_json(ROOT / 'provenance.json', provenance)
    print(json.dumps({'applied': args.apply, 'documents': len(provenance['files']),
                      'dispositions': dict(Counter(x['disposition'] for x in provenance['files'])),
                      'external_artifacts': len(json.loads(writes[ROOT / 'history/unavailable.json'])['artifacts'])}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
