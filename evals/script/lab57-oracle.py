#!/usr/bin/env python3
"""Independent LAB-57 author calculation from TASK and original input bytes."""
import csv
import datetime
import decimal
import hashlib
import io
import json
import pathlib
import re
import sys


def calculate(case):
    prompt = (case / 'TASK.md').read_text(encoding='utf-8')
    settings, columns = [json.loads(block) for block in re.findall(r'```json\n(.*?)\n```', prompt, re.S)]
    names = re.findall(r'приложенный `([^`]+)`', prompt)
    if len(names) != 1:
        raise ValueError('exactly one original input required')
    raw = (case / 'data' / names[0]).read_bytes()
    encoding = {'65001': 'utf-8-sig', '1251': 'cp1251', '1200': 'utf-16'}[settings['source']['encoding']]
    text = raw.decode(encoding, errors='strict')
    source = io.StringIO(''.join(text.splitlines(keepends=True)[settings['source']['rows_to_skip']:]), newline='')
    rows = list(csv.reader(source, delimiter=settings['format']['delimiter'], quotechar=settings['format']['text_qualifier'], strict=True))
    header = rows.pop(0) if settings['source']['first_line_as_title'] else None
    schema = [{key: col[key] for key in ['name', 'label', 'type', 'data_kind']} for col in columns]
    typed = []
    for row in rows:
        if len(row) != len(columns):
            raise ValueError('original field count differs')
        cells = []
        for field, col in zip(row, columns):
            value = field
            if field == settings['format']['null_marker']:
                value = None
            elif col['type'] == 'real':
                value = str(decimal.Decimal(field.replace(settings['format']['decimal_separator'], '.')).normalize())
            elif col['type'] == 'integer':
                value = str(int(field))
            elif col['type'] == 'datetime':
                tokens = settings['format']['date_format'].split('/')
                parts = field.split(settings['format']['date_separator'])
                if len(tokens) != 3 or set(tokens) != {'yyyy', 'mm', 'dd'}:
                    raise ValueError('unsupported assigned date format')
                values = dict(zip(tokens, map(int, parts)))
                value = datetime.datetime(values['yyyy'], values['mm'], values['dd']).isoformat(timespec='milliseconds')
            cells.append({'type': col['type'], 'value': value})
        typed.append(cells)
    return {
        'table': {'schema': schema, 'row_count': len(typed), 'comparison': 'ordered', 'rows': typed},
        'sources': {
            'TASK.md': hashlib.sha256((case / 'TASK.md').read_bytes()).hexdigest(),
            'data/' + names[0]: hashlib.sha256(raw).hexdigest(),
        },
        'source_header': header,
    }


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: lab57-oracle.py INPUTS_ROOT NEW_OUTPUT_DIR')
    root, output = map(pathlib.Path, sys.argv[1:])
    output.mkdir(mode=0o700)
    ids = ['txt-comma-utf8', 'csv-comma-utf8', 'txt-semicolon-cp1251-decimal', 'csv-pipe-multiline', 'tsv-utf8', 'tsv-utf16le']
    for case_id in ids:
        value = calculate(root / case_id)
        (output / (case_id + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': 'CALCULATED', 'cases': ids}))
