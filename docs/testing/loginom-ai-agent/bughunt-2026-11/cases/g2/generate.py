#!/usr/bin/env python3
"""Create the standalone JS package for G2 from the repository's native LGP."""
import argparse
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[5]
SOURCE = REPO / 'docs/node-development/nodes/variables-datatovar/fixtures/aggregate-source.lgp'
XSI = 'http://www.w3.org/2001/XMLSchema-instance'
CODE = '''import { OutputTable, DataType } from "builtIn/Data";
OutputTable.AssignColumns([{Name: "Seed", DataType: DataType.Integer}]);
OutputTable.Append();
OutputTable.Set("Seed", 17);
'''


def package_files():
    ET.register_namespace('xsi', XSI)
    with ZipFile(SOURCE) as package:
        files = {entry: package.read(entry) for entry in package.namelist() if entry.endswith('.xml')}
    unit = ET.fromstring(files['Unit_0/Unit.xml'])
    nodes = unit.findall('./WorkFlow/Nodes/Item')
    if len(nodes) != 1 or unit.findall('./WorkFlow/Links/Item'):
        raise ValueError('Source must have exactly one disconnected node')
    node = nodes[0]
    engine = node.find('./Component/Engine')
    if engine.get(f'{{{XSI}}}type') != 'TBGJavaScriptEngine':
        raise ValueError('Source must contain a native JavaScript engine')
    node.set('DisplayName', 'Расчёт JS')
    node.set('GenerateNodeTitle', 'false')
    engine.set('Code', CODE)
    index = ET.fromstring(files['PackageIndex.xml'])
    for entry in index.iter():
        entry.attrib.pop('BinFile', None)
    files['PackageIndex.xml'] = ET.tostring(index, encoding='utf-8', xml_declaration=True)
    files['Unit_0/Unit.xml'] = ET.tostring(unit, encoding='utf-8', xml_declaration=True)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.out / 'script-ready.lgp', 'w') as package:
        for name, content in sorted(package_files().items()):
            entry = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            package.writestr(entry, content)


if __name__ == '__main__':
    main()
