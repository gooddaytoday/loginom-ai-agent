#!/usr/bin/env python3
"""Prepare/check immutable drafts offline. Never executes Loginom or a model."""
import argparse
import hashlib
import json
import pathlib
import sys
import zipfile

sys.dont_write_bytecode = True
from text_import_oracle import compare, parse_source

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREFIX = 'Loginom-Evals/text-import/'
ARCHIVE_SHA = '18f4e8fe6b86517d8d26c646547b7a58c514c9009c07eb378f9e3df2d5fe63ea'
GROUPS = json.loads((ROOT / 'src/text-import-cases.json').read_text())['groups']
IDS = [case for group in GROUPS for case in group['ids']]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(file, data):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def prepare(archive, output):
    if sha(archive.read_bytes()) != ARCHIVE_SHA:
        raise ValueError('source archive SHA256 differs')
    output.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(archive) as source:
        if source.testzip() is not None:
            raise ValueError('ZIP CRC differs')
        inventory = json.loads(source.read(PREFIX + 'file-inventory.json'))
        for entry in inventory['files']:
            raw = source.read(PREFIX + entry['path'])
            if len(raw) != entry['bytes'] or sha(raw) != entry['sha256']:
                raise ValueError('inventory differs: ' + entry['path'])
        manifest = json.loads(source.read(PREFIX + 'manifest.json'))
        selected = {entry['id']: entry for entry in manifest['cases'] if entry['id'] in IDS}
        if set(selected) != set(IDS) or len(IDS) != 58 or len(set(IDS)) != 58:
            raise ValueError('case registry differs')
        cases = []
        for case in IDS:
            entry = selected[case]
            prefix = PREFIX + entry['path'] + '/'
            folder = output / case
            originals = []
            for name in sorted(source.namelist()):
                if not name.startswith(prefix) or name.endswith('/'):
                    continue
                relative = name[len(prefix):]
                if '..' in pathlib.PurePosixPath(relative).parts:
                    raise ValueError('unsafe archive member')
                raw = source.read(name)
                target = folder / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
                originals.append({'path': relative, 'bytes': len(raw), 'sha256': sha(raw)})
            spec = json.loads((folder / 'SPEC.json').read_text())
            if spec['privacy'] != 'synthetic':
                raise ValueError('private case: ' + case)
            changes = []
            for recipe in spec['oracle_recipe']:
                raw = (folder / recipe['input']).read_bytes()
                nested = recipe['parse']['source']
                if nested['bytes'] != len(raw) or nested['sha256'] != sha(raw):
                    changes.append('oracle_recipe source bytes/SHA corrected: ' + recipe['input'])
                    nested.update(bytes=len(raw), sha256=sha(raw))
            diagnostic = not spec['oracle_recipe']
            prompt = (folder / 'TASK.md').read_text()
            if case == 'initial-incomplete-settings':
                prompt = ('# Неполная первичная настройка нового импорта\n\n'
                    'Доставь оригинальный вход один раз, проверь серверные bytes и создай собственный черновик imports.text. '
                    'Передай следующие source/format, намеренно не передавая columns. '
                    'source_path возьми из подтверждённой доставки. Не применяй частичную настройку, '
                    'не выполняй импорт и не продолжай исправлением. Зафиксируй известный отказ и закрытие своего черновика.\n\n'
                    '```json\n' + json.dumps(spec['settings'], ensure_ascii=False, indent=2) + '\n```\n')
                changes.append('removed corrective columns hint and positive lifecycle')
            elif case.endswith('ambiguous-headers'):
                prompt = prompt.split('Работай с оригинальным вложением:')[0]
                prompt += ('\nДоставь оригинальный вход ровно один раз с проверкой bytes/SHA. '
                    'Передай запрос на новый imports.text с заданными полями. Повторный source_name должен '
                    'дать REQUEST_REJECTED на request.validate до создания импорта; '
                    'не создавай узел отдельно, не выполняй импорт и не исправляй запрос.\n')
                changes.append('removed create/execute/save lifecycle from request rejection')
            elif case == 'csv-to-tsv-source-refresh':
                prompt = prompt.replace('Полная правильная конфигурация (для исправляющего/финального шага):',
                    'Конфигурация этапа 1 для base.csv (delimiter=запятая). На этапе 2 для changed.tsv на том же GUID сменить source_path и delimiter=TAB:')
                changes.append('explicit CSV stage 1 and TSV stage 2')
            # Cold verification is owned by the independent checker, outside the model sandbox.
            cold = 'Повторно открой сохранённый пакет в независимом профиле'
            if cold in prompt:
                prompt = prompt.split(cold)[0].rstrip() + '\n\nПередай сохранённый пакет и доказательства проверяющему для независимого cold rerun; не объявляй непроведённую проверку выполненной.\n'
                changes.append('external independent cold handoff clarified')
            (folder / 'TASK.md').write_text(prompt)
            write_json(folder / 'SPEC.json', spec)
            checks = ['input', 'import', 'graph', 'sequence', 'diagnostic' if diagnostic else 'result']
            task = {'id': case, 'title': spec['title'], 'prompt': prompt,
                'inputs': [item['path'] for item in spec['inputs']], 'spec': 'SPEC.md',
                'expected_output': 'Диагностический исход по SPEC.json' if diagnostic else 'Полная типизированная таблица по SPEC.json',
                'checklist': [{'id': item, 'text': 'Текстовый импорт: ' + item, 'required': True} for item in checks],
                'timeout_ms': 900000}
            task['checker_files'] = ['SPEC.json', 'acceptance.json'] + [name for name in spec['expected'] if name.endswith('.json')]
            task.update({'output_mode': 'diagnostic'} if diagnostic else {'reference': 'reference.lgp'})
            write_json(folder / 'task.json', task)
            write_json(folder / 'acceptance.json', {'family': 'text-import', 'case_id': case,
                'spec': 'SPEC.json', 'checks': checks, 'cold_required': not diagnostic,
                'runtime': 'NOT_RUN', 'source_archive_sha256': ARCHIVE_SHA})
            write_json(folder / 'preparation.json', {'source_path': entry['path'], 'source_archive_sha256': ARCHIVE_SHA,
                'original_files': originals, 'adaptations': changes, 'runtime': 'NOT_RUN'})
            cases.append({'id': case, 'card': next(group['card'] for group in GROUPS if case in group['ids']),
                'source_path': entry['path'], 'inputs': spec['inputs'], 'output_mode': 'diagnostic' if diagnostic else 'package'})
        write_json(output / 'manifest.json', {'format': 'text-import-drafts-v1', 'source_archive_sha256': ARCHIVE_SHA,
            'base_sha': '7a45abd845f830610f376e2f21631acc8a48e8b2',
            'cli_sha': '5cd74d8ee5d6125692d953eb327b4d4f833c27a1',
            'agent': {'model': 'openai/gpt-6-luna', 'variant': 'high'}, 'multica_models': 'UNCHANGED',
            'runtime': 'NOT_RUN', 'cases': cases})
    return check(output)


def check(output):
    manifest = json.loads((output / 'manifest.json').read_text())
    if [item['id'] for item in manifest['cases']] != IDS:
        raise ValueError('manifest case identities differ')
    if set(p.name for p in output.iterdir() if p.is_dir()) != set(IDS):
        raise ValueError('unexpected case directories')
    inputs = 0
    for case in IDS:
        folder = output / case
        spec = json.loads((folder / 'SPEC.json').read_text())
        task = json.loads((folder / 'task.json').read_text())
        prep = json.loads((folder / 'preparation.json').read_text())
        if spec['id'] != case or task['id'] != case or spec['privacy'] != 'synthetic':
            raise ValueError('case identity/privacy differs: ' + case)
        if (folder / 'reference.lgp').exists():
            raise ValueError('draft contains a reference: ' + case)
        if task['prompt'] != (folder / 'TASK.md').read_text() or task['inputs'] != [i['path'] for i in spec['inputs']]:
            raise ValueError('prompt/inputs differ: ' + case)
        for item in spec['inputs']:
            raw = (folder / item['path']).read_bytes()
            original = next(i for i in prep['original_files'] if i['path'] == item['path'])
            if len(raw) != item['bytes'] or sha(raw) != item['sha256'] or item['sha256'] != original['sha256']:
                raise ValueError('input bytes differ: ' + case)
            inputs += 1
        for recipe in spec['oracle_recipe']:
            raw = (folder / recipe['input']).read_bytes()
            nested = recipe['parse']['source']
            if len(raw) != nested['bytes'] or sha(raw) != nested['sha256']:
                raise ValueError('nested source differs: ' + case)
            compare(json.loads((folder / recipe['expected']).read_text()), parse_source(raw, recipe['parse']))
    return {'cases': len(IDS), 'inputs': inputs, 'references': 0, 'runtime': 'NOT_RUN'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=pathlib.Path)
    parser.add_argument('--out', type=pathlib.Path)
    parser.add_argument('--check', type=pathlib.Path)
    args = parser.parse_args()
    try:
        if args.check:
            result = check(args.check)
        elif args.archive and args.out:
            result = prepare(args.archive, args.out)
        else:
            raise ValueError('use --archive ZIP --out NEW_DIR or --check DIR')
        print(json.dumps(result))
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        print(json.dumps({'status': 'ERROR', 'reason': str(error)}))
        sys.exit(2)
