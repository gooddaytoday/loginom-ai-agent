#!/usr/bin/env python3
"""Build deterministic, self-contained XML-only LGP inputs from native fixtures.

Run from any directory. The source fixtures provide native port and engine
serialization; no browser session, credentials or external server files are used.
"""
import copy
import csv
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
XSI = '{http://www.w3.org/2001/XMLSchema-instance}type'
ET.register_namespace('xsi', 'http://www.w3.org/2001/XMLSchema-instance')


def build(number):
    case = HERE / f'bh-c{number:02}'
    with (case / 'seed.csv').open(encoding='utf-8', newline='') as stream:
        records = list(csv.DictReader(stream))
    names = list(records[0])
    kinds = ['Integer', 'String', 'String', 'Float'] if number == 6 else ['Integer', 'Integer']
    values = [[int(row[name]) if kind == 'Integer' else float(row[name]) if kind == 'Float' else row[name]
               for name, kind in zip(names, kinds)] for row in records]
    # JavaScript is only fixture input. The oracle independently reads seed.csv.
    code = 'import { OutputTable, DataType } from "builtIn/Data";\n'
    code += 'OutputTable.AssignColumns([' + ','.join(
        '{Name:' + json.dumps(name) + ',DisplayName:' + json.dumps(name) + ',DataType:DataType.' + kind + '}'
        for name, kind in zip(names, kinds)) + ']);\n'
    code += 'for (const row of ' + json.dumps(values, ensure_ascii=False) + ') {\n'
    code += '  OutputTable.Append();\n'
    code += '  ' + json.dumps(names) + '.forEach((name,i) => OutputTable.Set(name,row[i]));\n}\n'
    with ZipFile(REPO / 'packages/loginom-host/test/fixtures/skills-cold/sales.lgp') as source:
        files = {name: source.read(name) for name in source.namelist() if name.endswith('.xml')}
    with ZipFile(REPO / 'docs/node-development/nodes/variables-datatovar/fixtures/aggregate-source.lgp') as source:
        source_node = ET.fromstring(source.read('Unit_0/Unit.xml')).find('./WorkFlow/Nodes/Item')
        assert source_node.find('./Component/Engine').get(XSI) == 'TBGJavaScriptEngine'
    root = ET.fromstring(files['Unit_0/Unit.xml'])
    workflow = root.find('WorkFlow')
    nodes, links = workflow.find('Nodes'), workflow.find('Links')
    old = list(nodes)
    nodes.clear()
    links.clear()
    node = copy.deepcopy(source_node)
    node.set('DisplayName', 'Исходные продажи' if number == 6 else 'Готовый источник')
    node.find('./Component/Engine').set('Code', code)
    nodes.append(node)
    if number == 6:
        sorting, export = old[2], old[3]
        sorting.set('DisplayName', 'Сортировка продаж')
        columns = sorting.find('./Component/InputSockets/Item/Socket/DataSource/ColumnDefs')
        columns.clear()
        ET.SubElement(columns, 'Item', Name='Revenue', DataType='dtFloat', DataKind='dkContinuous',
                      UsageType='utActive', InputColumnInfoName='Revenue')
        sorting.find('./Component/Engine/SortingColumns/Item').set('Name', 'Revenue')
        export.set('DisplayName', 'Итоговые продажи')
        export.find('./Component/Engine').set('FileName', 'sales-ready.csv')
        nodes.extend([sorting, export])
        for index, (source, target) in enumerate([(node, sorting), (sorting, export)]):
            link = ET.SubElement(links, 'Item', Guid=f'54f6c3d9-17c1-4e59-8eab-00000000000{index}')
            ET.SubElement(link, 'SourcePort', NodeGuid=source.get('Guid'), PortGuid=source.find('./OutputPorts/Item').get('Guid'))
            input_port = next(port for port in target.find('InputPorts') if port.get('Name') == 'DataSource')
            ET.SubElement(link, 'TargetPort', NodeGuid=target.get('Guid'), PortGuid=input_port.get('Guid'))
    model_views = root.find('ModelViews')
    if model_views is not None:
        root.remove(model_views)
    files['Unit_0/Unit.xml'] = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    index = ET.fromstring(files['PackageIndex.xml'])
    for element in index.iter():
        element.attrib.pop('BinFile', None)
    files['PackageIndex.xml'] = ET.tostring(index, encoding='utf-8', xml_declaration=True)
    destination = case / 'data' / ('sales-ready.lgp' if number == 6 else 'source-ready.lgp')
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED) as package:
        for name, content in sorted(files.items()):
            entry = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            package.writestr(entry, content)
    print(destination.relative_to(REPO))


if __name__ == '__main__':
    for number in (6, 7):
        build(number)
