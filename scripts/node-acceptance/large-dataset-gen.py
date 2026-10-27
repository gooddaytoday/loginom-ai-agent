#!/usr/bin/env python3
"""Deterministic streaming text fixture generator; typed oracle never goes to a model.

Output and manifest must be outside Git. --min-bytes rounds up to a whole record.
Examples: --min-bytes 1000000000 --encoding cp1251 --delimiter ';'
          --boundary 32 --type-change-fraction .96
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import random


def generate(args):
    rng = random.Random(args.seed)
    regions = ('Север', 'Юг', 'Восток', 'Запад')
    eol = '\r\n' if args.line_endings == 'CRLF' else '\n'
    decimal = ',' if args.delimiter == ';' else '.'
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, delimiter=args.delimiter, lineterminator=eol, quoting=csv.QUOTE_MINIMAL)
    sha = hashlib.sha256()
    size, rows, physical_line = 0, 0, 1
    totals = {r: 0 for r in regions}
    counts = {r: 0 for r in regions}
    nulls = 0
    violation = None
    minimum = args.min_bytes or (2 ** args.boundary + 1024 ** 2 if args.boundary else 0)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('wb') as file:
        def emit(values):
            nonlocal size, physical_line
            stream.seek(0)
            stream.truncate(0)
            writer.writerow(values)
            text = stream.getvalue()
            data = text.encode(args.encoding, errors='strict')
            file.write(data)
            sha.update(data)
            size += len(data)
            # csv's quoted multiline fields use the configured EOL as well.
            physical_line += text.count('\n')

        if args.bom:
            data = b'\xef\xbb\xbf'
            file.write(data)
            sha.update(data)
            size += len(data)
        for _ in range(args.rows_to_skip):
            emit(['generated preamble'])
        if not args.no_header:
            emit(['region', 'amount', 'note'])
        while (rows < args.rows if args.rows is not None else size < minimum):
            rows += 1
            region = regions[rng.randrange(len(regions))]
            minor = rng.randrange(1, 1000001)
            null = rows % 101 == 0
            change = args.type_change_fraction is not None and violation is None and (
                rows > args.rows * args.type_change_fraction if args.rows is not None
                else size >= minimum * args.type_change_fraction)
            # Oracle is updated from these typed values BEFORE serialization.
            typed_amount = None if null else ('TYPE_CHANGE' if change else minor)
            counts[region] += 1
            if typed_amount is None:
                nulls += 1
            elif isinstance(typed_amount, int):
                totals[region] += typed_amount
            else:
                violation = {'logical_record': rows, 'physical_line': physical_line, 'byte_offset': size,
                             'column': 2, 'expected_type': 'real', 'example': typed_amount}
            amount = 'NULL' if typed_amount is None else (typed_amount if isinstance(typed_amount, str)
                     else f'{typed_amount // 100}{decimal}{typed_amount % 100:02d}')
            note = 'доставка'
            if rows % 13 == 0:
                note += ' "срочно"'
            if rows % 17 == 0:
                note += eol + 'вторая строка'
            note += ' ' + 'x' * args.padding
            emit([region, amount, note])
    manifest = {
        'version': 1, 'seed': args.seed, 'bytes': size, 'sha256': sha.hexdigest(), 'records': rows,
        'encoding': args.encoding, 'bom': args.bom, 'delimiter': args.delimiter,
        'decimal_separator': decimal, 'line_endings': args.line_endings,
        'rows_to_skip': args.rows_to_skip, 'first_line_as_title': not args.no_header, 'null_marker': 'NULL',
        'types': ['string', 'real', 'string'], 'columns': ['region', 'amount', 'note'],
        'sums_minor_by_region': totals, 'records_by_region': counts, 'nulls': nulls,
        'first_violation': violation,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True, help='Private oracle; never attach to the model')
    size = parser.add_mutually_exclusive_group(required=True)
    size.add_argument('--rows', type=int)
    size.add_argument('--min-bytes', type=int)
    size.add_argument('--boundary', type=int, choices=[31, 32], help='2^N + 1 MiB minimum')
    parser.add_argument('--seed', type=int, default=1)
    parser.add_argument('--encoding', choices=['utf-8', 'cp1251'], default='utf-8')
    parser.add_argument('--delimiter', choices=[';', ','], default=';')
    parser.add_argument('--line-endings', choices=['LF', 'CRLF'], default='LF')
    parser.add_argument('--bom', action='store_true')
    parser.add_argument('--rows-to-skip', type=int, default=0)
    parser.add_argument('--no-header', action='store_true')
    parser.add_argument('--type-change-fraction', type=float)
    parser.add_argument('--padding', type=int, default=384)
    args = parser.parse_args()
    if (args.rows is not None and args.rows < 1) or (args.min_bytes is not None and args.min_bytes < 1):
        parser.error('rows/min-bytes must be positive')
    if args.padding < 0 or args.rows_to_skip < 0:
        parser.error('padding/rows-to-skip must be nonnegative')
    if args.type_change_fraction is not None and not 0 < args.type_change_fraction < 1:
        parser.error('type-change-fraction must be between 0 and 1')
    if args.bom and args.encoding != 'utf-8':
        parser.error('BOM is available only for UTF-8')
    if args.output.resolve() == args.manifest.resolve():
        parser.error('output and manifest must be different')
    generate(args)


if __name__ == '__main__':
    main()
