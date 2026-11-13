"""Independent FS tables and bytes from the approved stage-zero fixtures.

The browser downloads an ordinary Files ZIP. Actual values never generate the
expected table; duplicate, extra, missing and unsafe archive entries fail.
"""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent


def files(case, execution=2):
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
    if case == 'errors':
        return {'keep.txt': b'KEEP'}
    raise ValueError(case)


def expected(case):
    if case == 'paths':
        return {'nodes': [{'type': 'programming.javascript'}, {'type': 'exports.text'}], 'outputs': [
            {'output_node_type': 'export_input', 'export_destination': 'paths-' + stage + '.csv', 'ordered': True,
             'columns': [{'name': 'Exists', 'label_any': True, 'type': 'boolean'},
                         {'name': 'Text', 'label_any': True, 'type': 'string'}],
             'rows': [{'Exists': present, 'Text': 'LAB1549_SIDE' if present else None}]}
            for stage, present in [('unsaved', False), ('saved', True), ('missing', False), ('sidecar', True)]]}
    data = files(case)
    names = sorted(data) if case == 'write' else list(data)
    if case == 'errors':
        columns = [('Case', 'string'), ('Outcome', 'string'), ('Text', 'string')]
        rows = [{'Case': 'exclusive', 'Outcome': 'exists', 'Text': 'KEEP'},
                {'Case': 'missing', 'Outcome': 'missing', 'Text': None},
                {'Case': 'permission', 'Outcome': 'denied', 'Text': None}]
    elif case == 'effects':
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


def verify_archive(case, archive, folder, execution=2):
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


def verify_paths_archive(archive, folder, phase, sidecar):
    assert sidecar.endswith('-sidecar.txt') and '/' not in sidecar
    with ZipFile(archive) as zipped:
        entries = zipped.infolist()
        assert len({e.filename for e in entries}) == len(entries), 'Duplicate path archive entries'
        assert all(not e.filename.startswith('/') and '..' not in e.filename.split('/') for e in entries)
        assert not any((e.external_attr >> 16) & 0o170000 == 0o120000 for e in entries), 'Archive symlink'
        prefix = folder + '/'
        assert all(e.filename.startswith(prefix) for e in entries), 'Foreign archive root'
        actual = {e.filename.removeprefix(prefix): zipped.read(e) for e in entries if not e.is_dir()}
        wanted = {'original/' + sidecar: b'LAB1549_SIDE'}
        if phase in ['sidecar', 'warm', 'cold']:
            wanted['moved/' + sidecar] = b'LAB1549_SIDE'
        package = None if phase == 'fixtures' else ('original/' if phase == 'saved' else 'moved/') + 'paths.lgp'
        allowed = {'original/paths.~lgp', 'moved/paths.~lgp'}
        if package:
            assert actual.get(package), 'Saved or moved package missing/empty'
            allowed.add(package)
        assert {name: data for name, data in actual.items() if name not in allowed} == wanted, 'Paths/sidecar inventory or bytes differ'
        assert {e.filename for e in entries if e.is_dir()} == {prefix, prefix + 'original/', prefix + 'moved/'}, 'Path directories differ'


def verify_error_files(keep, inventory):
    assert keep.read_bytes() == b'KEEP', 'Exclusive create overwrote the protected file'
    entries = json.loads(inventory.read_text())
    assert len(entries) == 2, 'Error fixture inventory changed'
    assert {(e['name'], e['kind'], e['bytes']) for e in entries} == {
        ('keep.txt', 'file', 4), ('denied.txt', 'file', 6)}, 'Error fixture metadata changed'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=['read', 'write', 'operations', 'effects', 'paths', 'errors'], required=True)
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--folder')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--execution', type=int, choices=[2, 3], default=2)
    parser.add_argument('--phase', choices=['fixtures', 'saved', 'moved', 'sidecar', 'warm', 'cold'], default='warm')
    parser.add_argument('--sidecar')
    parser.add_argument('--keep-file', type=Path)
    parser.add_argument('--inventory', type=Path)
    args = parser.parse_args()
    if args.check:
        assert json.loads((HERE / ('js-fs-' + args.case) / 'expected.json').read_text()) == expected(args.case)
    if args.keep_file:
        assert args.case == 'errors' and args.inventory
        verify_error_files(args.keep_file, args.inventory)
        print('PASS independent protected-file bytes and complete native inventory')
    elif args.archive:
        assert args.folder
        if args.case == 'paths':
            verify_paths_archive(args.archive, args.folder, args.phase, args.sidecar)
        else:
            verify_archive(args.case, args.archive, args.folder, args.execution)
        print('PASS independent downloaded bytes and complete directory inventory')
    elif not args.check:
        print(json.dumps(expected(args.case), ensure_ascii=False, indent=2))
