"""Independent FS tables and bytes from the approved stage-zero fixtures.

The browser downloads an ordinary Files ZIP. Actual values never generate the
expected table; duplicate, extra, missing and unsafe archive entries fail.
"""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent


def files(case, execution=1):
    if case == 'read':
        return {name: (HERE / 'fixtures' / name).read_bytes()
                for name in ['utf8.txt', 'utf16le.txt', 'cp1251.txt', 'bytes.bin']}
    if case == 'write':
        return {'report.txt': 'Привет, Ёж\n42\n€'.encode('utf8'),
                'utf16le.txt': 'Ёж'.encode('utf-16le'),
                'utf16bom.txt': b'\xff\xfe' + 'Ёж'.encode('utf-16le'),
                'cp1251.txt': 'Ёж'.encode('cp1251'), 'bytes.bin': bytes([0, 1, 127, 128, 255])}
    if case == 'operations':
        return {'source.bin': bytes([0, 1, 127, 128, 255]),
                'archive/final.bin': bytes([0, 1, 127]),
                'patched.bin': bytes([65, 1, 0, 0, 0])}
    if case == 'effects':
        return {'source.bin': bytes([0, 1, 127, 128, 255]), 'clone-force.bin': b'',
                'ledger.txt': b'run\n' * execution}
    raise ValueError(case)


def expected(case):
    data = files(case)
    names = sorted(data) if case == 'write' else list(data)
    if case == 'effects':
        columns = [('Case', 'string'), ('Outcome', 'string'), ('DestinationBytes', 'integer')]
        rows = [{'Case': 'clone_force', 'Outcome': 'failed', 'DestinationBytes': 0}]
    elif case == 'read':
        columns = [('FileName', 'string'), ('ByteCount', 'integer'), ('Text', 'string'), ('Hex', 'string')]
        codecs = {'utf8.txt': 'utf8', 'utf16le.txt': 'utf-16le', 'cp1251.txt': 'cp1251'}
        rows = [{'FileName': name, 'ByteCount': len(data[name]),
                 'Text': data[name].decode(codecs[name]) if name in codecs else None,
                 'Hex': None if name in codecs else data[name].hex()} for name in names]
    else:
        columns = [('FileName', 'string'), ('ByteCount', 'integer'), ('Hex', 'string')]
        rows = [{'FileName': name, 'ByteCount': len(data[name]), 'Hex': data[name].hex()} for name in names]
    return {'nodes': [{'type': 'programming.javascript'}, {'type': 'exports.text'}],
            'outputs': [{'output_node_type': 'export_input', 'export_destination': 'fs-' + case + '.csv',
                         'ordered': True, 'columns': [{'name': name, 'label_any': True, 'type': kind}
                                                     for name, kind in columns], 'rows': rows}]}


def verify_archive(case, archive, folder, execution=1):
    wanted = files(case, execution)
    directories = {folder + '/'}
    for name in wanted:
        path = Path(name).parent
        while str(path) != '.':
            directories.add(folder + '/' + path.as_posix() + '/')
            path = path.parent
    with ZipFile(archive) as zipped:
        entries = zipped.infolist()
        names = [e.filename for e in entries]
        assert len(set(names)) == len(names), 'Duplicate archive entries'
        assert all(not n.startswith('/') and '..' not in n.split('/') for n in names), 'Unsafe archive path'
        assert not any((e.external_attr >> 16) & 0o170000 == 0o120000 for e in entries), 'Archive symlink'
        actual = {e.filename: zipped.read(e) for e in entries if not e.is_dir()}
        assert actual == {folder + '/' + name: data for name, data in wanted.items()}, 'File bytes/inventory differ'
        assert {e.filename for e in entries if e.is_dir()} == directories, 'Directory inventory differs'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=['read', 'write', 'operations', 'effects'], required=True)
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--folder')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--execution', type=int, choices=[1, 2], default=1)
    args = parser.parse_args()
    if args.check:
        assert json.loads((HERE / ('js-fs-' + args.case) / 'expected.json').read_text()) == expected(args.case)
    if args.archive:
        assert args.folder
        verify_archive(args.case, args.archive, args.folder, args.execution)
        print('PASS independent downloaded bytes and complete directory inventory')
    elif not args.check:
        print(json.dumps(expected(args.case), ensure_ascii=False, indent=2))
