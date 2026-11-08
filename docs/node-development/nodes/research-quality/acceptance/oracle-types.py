#!/usr/bin/env python3
"""Independent proposed typed Quality expected: CSV, Gregorian calendar, Fraction.

Never reads Loginom, package XML, runtime code or actual output. Reuses only the
independent arithmetic oracle next to this file. Variant subtypes are proposals
to confirm in phase 1; two-decimal UI strings do not establish native tags.
"""
import csv
import json
from datetime import date
from fractions import Fraction
from pathlib import Path

from oracle import SUMMARY, statistics

ROOT = Path(__file__).resolve().parent
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
    result = expected()
    summary = result['outputs'][4]['rows']
    assert summary[1]['Col7'] == float(Fraction(4, 7)) and summary[1]['Col9'] is None
    assert summary[2]['Col7'] == float(Fraction(322185, 7))
    assert summary[3]['Col8'] == dict(cell_type='real', value=1.375)
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
