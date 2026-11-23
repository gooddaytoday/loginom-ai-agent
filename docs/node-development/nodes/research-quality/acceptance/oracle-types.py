#!/usr/bin/env python3
"""Independent proposed typed Quality expected: CSV, Gregorian calendar, Fraction.

Never reads Loginom, package XML, runtime code or actual output. Reuses only the
independent arithmetic oracle next to this file. Variant subtypes are proposals
to confirm in phase 1; two-decimal UI strings do not establish native tags.
--check regenerates expected-types.json in memory and fails on drift.
"""
import argparse
import csv
import importlib.util
import json
import sys
from datetime import date
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # No __pycache__ next to the kit.
_spec = importlib.util.spec_from_file_location('quality_oracle', ROOT / 'oracle.py')
_oracle = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_oracle)
SUMMARY, statistics = _oracle.SUMMARY, _oracle.statistics
FIELDS = [('RowID', 'integer', 'Непрерывный'), ('Flag', 'boolean', 'Дискретный'),
          ('Stamp', 'datetime', 'Непрерывный'), ('Code', 'integer', 'Дискретный'),
          ('Measure', 'real', 'Дискретный'), ('Text', 'string', 'Дискретный')]
LABELS = dict(integer='Целый', real='Вещественный', string='Строковый',
              boolean='Логический', datetime='Дата/Время')


def expected():
    with (ROOT.parent / 'fixtures/types.csv').open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        assert reader.fieldnames == [name for name, _, _ in FIELDS]
        raw = list(reader)
    rows = [{name: None if row[name] == '?' else row[name] == 'true' if kind == 'boolean'
             else row[name] + 'T00:00:00.000' if kind == 'datetime'
             else row[name] if kind == 'string' else int(row[name]) if kind == 'integer'
             else float(row[name]) for name, kind, _ in FIELDS} for row in raw]
    columns = [dict(name=name, type=kind, label_any=True) for name, kind, _ in FIELDS]
    outputs = [dict(output_node_type='research.quality', output_port=port, ordered=True,
                    column_order='exact', columns=columns, rows=rows if port in (0, 3) else [])
               for port in range(4)]
    summary = []
    for index, (name, kind, data_kind) in enumerate(FIELDS):
        values = [None if row[name] == '?' else row[name] if kind == 'string'
                  else row[name] == 'true' if kind == 'boolean'
                  else Fraction((date.fromisoformat(row[name]) - date(1899, 12, 30)).days)
                  if kind == 'datetime' else Fraction(row[name]) for row in raw]
        stat = statistics(values, 'string' if kind in ('string', 'boolean') else 'real')
        valid = [value for value in values if value is not None]
        avg = Fraction(sum(valid), len(valid)) if kind == 'boolean' else stat['avg']
        moda = dict(cell_type=kind if kind in ('string', 'boolean') else 'real',
                    value=stat['mode'] if kind in ('string', 'boolean') else float(stat['mode']))
        summary.append(dict(zip([name for name, _, _ in SUMMARY],
                                [index + 1, name, LABELS[kind], data_kind, stat['nulls'],
                                 len(stat['out']), len(stat['extr']),
                                 None if avg is None else float(avg), moda,
                                 None if stat['median'] is None else float(stat['median'])])))
    outputs.append(dict(output_node_type='research.quality', output_port=4, ordered=True,
                        column_order='exact', columns=[
                            dict(name=name, label=label, type=kind,
                                 **({'tolerance': dict(abs=1e-9, rel=1e-12)} if kind == 'real' else {}))
                            for name, label, kind in SUMMARY], rows=summary))
    return dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type=kind) for kind in
                ['imports.text', 'research.quality', 'exports.text']], outputs=outputs)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='compare committed expected-types.json')
    args = parser.parse_args()
    result = expected()
    summary = result['outputs'][4]['rows']
    assert summary[1]['Col7'] == float(Fraction(4, 7)) and summary[1]['Col9'] is None
    assert summary[2]['Col7'] == float(Fraction(322185, 7))
    assert summary[3]['Col8'] == dict(cell_type='real', value=1.375)
    text = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if args.check:
        assert (ROOT / 'expected-types.json').read_text(encoding='utf-8') == text, 'expected-types.json'
        print('OK: expected-types.json matches')
    else:
        print(text, end='')
