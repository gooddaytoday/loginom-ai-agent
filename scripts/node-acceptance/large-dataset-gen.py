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
import zipfile
from xml.sax.saxutils import escape


def generate(args):
    if args.format == 'xlsx':
        return generate_xlsx(args)
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


def generate_xlsx(args):
    """Write each ZIP member through ZipFile.open, without a worksheet in RAM."""
    rng = random.Random(args.seed)
    regions = ('Север', 'Юг', 'Восток', 'Запад')
    names = ['region', 'amount', 'date', 'note', 'quantity', 'active', 'code', 'extra'][:args.columns]
    types = ['string', 'real', 'datetime', 'string', 'integer', 'integer', 'string', 'string'][:args.columns]
    totals = {r: 0 for r in regions}
    counts = {r: 0 for r in regions}
    nulls, violation = 0, None
    rows = args.rows
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    relns = 'http://schemas.openxmlformats.org/package/2006/relationships'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Fixed ZIP timestamps make a seed byte-for-byte reproducible.
    with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as book:
        def part(name, content):
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            with book.open(info, 'w', force_zip64=True) as f:
                f.write(content.encode('utf-8'))
        part('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
             '<Default Extension="xml" ContentType="application/xml"/>'
             '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
             '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
             '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
             '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
        part('_rels/.rels', f'<Relationships xmlns="{relns}"><Relationship Id="w" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        part('xl/workbook.xml', f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="{int(args.date_system == "1904")}"/><sheets><sheet name="Sales" sheetId="1" r:id="s"/></sheets></workbook>')
        part('xl/_rels/workbook.xml.rels', f'<Relationships xmlns="{relns}">' + ''.join(
            f'<Relationship Id="{id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{kind}" Target="{path}"/>'
            for id, kind, path in [('s', 'worksheet', 'worksheets/sheet1.xml'), ('t', 'sharedStrings', 'sharedStrings.xml'), ('f', 'styles', 'styles.xml')]) + '</Relationships>')
        part('xl/sharedStrings.xml', f'<sst xmlns="{ns}" count="{rows}" uniqueCount="4">' + ''.join(f'<si><t>{r}</t></si>' for r in regions) + '</sst>')
        part('xl/styles.xml', f'<styleSheet xmlns="{ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>'
             '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="4" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>')
        def inline(col, row, value):
            return f'<c r="{col}{row}" t="inlineStr"><is><t xml:space="preserve">{escape(value)}</t></is></c>'
        info = zipfile.ZipInfo('xl/worksheets/sheet1.xml', (2020, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        with book.open(info, 'w', force_zip64=True) as f:
            def emit(text): f.write(text.encode('utf-8'))
            emit(f'<worksheet xmlns="{ns}"><dimension ref="A1:{chr(64 + args.columns)}{rows + int(not args.no_header)}"/><sheetData>')
            if not args.no_header:
                emit('<row r="1">' + ''.join(inline(chr(65+i), 1, name) for i, name in enumerate(names)) + '</row>')
            for logical in range(1, rows + 1):
                row = logical + int(not args.no_header)
                region_index = rng.randrange(4)
                region = regions[region_index]
                minor = rng.randrange(1, 1000001)
                null = logical % 101 == 0
                change = args.columns >= 2 and args.type_change_fraction is not None and violation is None and logical > rows * args.type_change_fraction
                counts[region] += 1
                if args.columns >= 2:
                    if null: nulls += 1
                    elif change:
                        violation = {'sheet': 'Sales', 'row': row, 'logical_record': logical, 'column': 2, 'expected_type': 'real', 'example': 'TYPE_CHANGE'}
                    else: totals[region] += minor
                cells = [f'<c r="A{row}" t="s"><v>{region_index}</v></c>']
                if args.columns >= 2 and not null:
                    cells.append(inline('B', row, 'TYPE_CHANGE') if change else f'<c r="B{row}" s="1"><v>{minor // 100}.{minor % 100:02d}</v></c>')
                if args.columns >= 3:
                    serial = 45000 + logical % 365 - (1462 if args.date_system == '1904' else 0)
                    cells.append(f'<c r="C{row}" s="2"><v>{serial}</v></c>')
                if args.columns >= 4: cells.append(inline('D', row, 'доставка ' + 'x' * args.padding))
                if args.columns >= 5: cells.append(f'<c r="E{row}"><v>{logical % 10}</v></c>')
                if args.columns >= 6: cells.append(f'<c r="F{row}"><v>{logical % 2}</v></c>')
                if args.columns >= 7: cells.append(inline('G', row, f'R{logical}'))
                if args.columns >= 8: cells.append(inline('H', row, 'текст'))
                emit(f'<row r="{row}">' + ''.join(cells) + '</row>')
            emit('</sheetData></worksheet>')
    sha = hashlib.sha256()
    with args.output.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): sha.update(block)
    manifest = {'version': 1, 'format': 'xlsx', 'seed': args.seed, 'bytes': args.output.stat().st_size, 'sha256': sha.hexdigest(),
                'records': rows, 'sheet_name': 'Sales', 'date_system': args.date_system, 'columns': names, 'types': types,
                'header_rows': int(not args.no_header), 'blank_rows': 'import', 'nulls': nulls, 'first_violation': violation,
                'sums_minor_by_region': totals, 'records_by_region': counts}
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
    parser.add_argument('--format', choices=['csv', 'xlsx'], default='csv')
    parser.add_argument('--columns', type=int, choices=range(1, 9), default=4)
    parser.add_argument('--date-system', choices=['1900', '1904'], default='1900')
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
    if args.format == 'xlsx' and (args.rows is None or args.rows > 1048575 or args.rows_to_skip):
        parser.error('XLSX requires --rows <=1048575 and rows-to-skip=0')
    generate(args)


if __name__ == '__main__':
    main()
