"""Independent byte oracle: fixed business rows, Python's standard codecs/CSV.

No runtime receipt or implementation-derived value supplies expected bytes.
"""
import argparse
import csv
import io
from pathlib import Path


def expected_bytes(encoding):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, delimiter=';', lineterminator='\r\n')
    writer.writerows([
        ['Код', 'Текст', 'Сумма'],
        ['1', 'Привет; мир', '1.25'],
        ['2', 'Он сказал "да"', '-2.5'],
        ['3', 'Ёжик', '0'],
    ])
    return stream.getvalue().encode(encoding)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--csv', type=Path, required=True)
    parser.add_argument('--encoding', choices=['cp1251', 'utf-8'], required=True)
    args = parser.parse_args()
    actual = args.csv.read_bytes()
    expected = expected_bytes(args.encoding)
    if actual != expected:
        offset = next((i for i, (a, b) in enumerate(zip(actual, expected)) if a != b), min(len(actual), len(expected)))
        raise SystemExit(f'FAIL byte offset={offset}, actual_bytes={len(actual)}, expected_bytes={len(expected)}')
    print(f'PASS {args.encoding}: {len(actual)} exact bytes, Cyrillic labels/values, semicolon, CRLF, no BOM')
