"""Proposed byte oracle; independent of Loginom. No runtime or runner imports."""
import argparse
import csv
from decimal import Decimal, ROUND_HALF_EVEN
import json
from pathlib import Path

ROOT = Path(__file__).parent


def expected_bytes(case):
    expected = json.loads((ROOT / 'expected.json').read_text(encoding='utf-8'))
    spec = expected['cases'][case]
    with (ROOT.parent.parent / 'fixtures' / spec['fixture']).open(encoding='utf-8', newline='') as stream:
        rows = list(csv.reader(stream))
    assert rows.pop(0) == spec['columns'], 'FIXTURE_COLUMNS'
    if case == 'number-format':
        rows = [[r[0], *(str(Decimal(v).quantize(Decimal('0.01'), rounding=ROUND_HALF_EVEN)) for v in r[1:])] for r in rows]
    if case == 'fixed-width':
        widths = [max(len(row[i]) for row in [spec['columns'], *rows]) for i in range(len(spec['columns']))]
        assert widths == spec['widths'], 'FIXED_WIDTHS'
        lines = [' '.join(v.ljust(widths[i]) if i == 0 else v.rjust(widths[i]) for i, v in enumerate(row)) for row in [spec['columns'], *rows]]
    else:
        lines = [';'.join(row) for row in [spec['columns'], *rows]]
    text = '\r\n'.join(lines) + '\r\n'
    assert text == spec['text'], 'EXPECTED_TEXT_DRIFT'
    bom = {'utf-16-le': b'\xff\xfe', 'utf-16-be': b'\xfe\xff'}.get(spec['codec'], b'') if spec['bom'] else b''
    return bom + text.encode(spec['codec'], errors='strict')


def check(case, data):
    if data != expected_bytes(case):
        raise ValueError('FULL_FILE_BYTES_DIFFER')


def self_check():
    cases = json.loads((ROOT / 'expected.json').read_text(encoding='utf-8'))['cases']
    for case in cases:
        data = expected_bytes(case)
        check(case, data)
        for damaged in [data[:-1], data + b' ', data.replace(b'0', b'1', 1)]:
            if damaged == data:
                continue
            try:
                check(case, damaged)
            except ValueError:
                continue
            raise AssertionError('ORACLE_ACCEPTED_MUTATION')
    assert Decimal('1234.567').quantize(Decimal('0.01')) == Decimal('1234.57')
    assert Decimal('-12.344').quantize(Decimal('0.01')) == Decimal('-12.34')
    print('PASS: proposed text expectations and negative byte checks')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--self-check', action='store_true')
    p.add_argument('--case')
    p.add_argument('--file', type=Path)
    args = p.parse_args()
    if args.self_check:
        self_check()
    else:
        if not args.case or not args.file:
            p.error('--case and --file required')
        check(args.case, args.file.read_bytes())
        print('PASS: exact exported bytes')
