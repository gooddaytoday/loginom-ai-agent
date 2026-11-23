#!/usr/bin/env python3
"""Independent ordered concatenation and suffix allocation; no Loginom imports."""
import json
import re
import hashlib
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
source = json.loads((HERE.parent / 'fixtures/inputs.json').read_text(encoding='utf-8'))


def check_fixture():
    """Audit only the input template; expected outputs still come from JSON."""
    fixtures = HERE.parent / 'fixtures'
    manifest = json.loads((fixtures / 'manifest.json').read_text(encoding='utf-8'))
    for name, metadata in manifest['files'].items():
        data = (fixtures / name).read_bytes()
        assert len(data) == metadata['bytes'], name
        assert hashlib.sha256(data).hexdigest() == metadata['sha256'], name
    with zipfile.ZipFile(fixtures / 'source.lgp') as package:
        root = ET.fromstring(package.read('Unit_0/Unit.xml'))
        assert len(ET.fromstring(package.read('References.xml'))) == 0
        assert len(ET.fromstring(package.read('Variables.xml')).find('Elements')) == 0
    nodes = root.findall('./WorkFlow/Nodes/Item')
    assert len(nodes) == 2, 'input template must contain exactly two sources'
    assert len(root.find('./WorkFlow/Links')) == 0, 'input template must have no result or links'
    native_types = {'integer':'dtInteger', 'real':'dtFloat', 'string':'dtString', 'boolean':'dtBoolean'}
    for side, node in zip(('left', 'right'), nodes):
        assert node.attrib['Guid'] == manifest['sources'][side]['node_id']
        assert manifest['sources'][side]['output_port'] == 0
        assert manifest['sources'][side]['port_kind'] == 'variables'
        assert len(node.findall('./OutputPorts/Item')) == 1
        assert node.find('./Component/OutputSockets/Item/Socket').attrib['{http://www.w3.org/2001/XMLSchema-instance}type'] == 'TBGDerivedVariablesOutputSocket'
        assert node.find('./Component/Engine').attrib['{http://www.w3.org/2001/XMLSchema-instance}type'] == 'TBGCalcVariables'
        expressions = node.findall('./Component/Engine/Expressions/Item')
        assert len(expressions) == len(source[side])
        for expression, field in zip(expressions, source[side]):
            props = expression.attrib
            assert (props['Name'], props['DisplayName'], props['DataType']) == (
                field['name'], field['label'], native_types[field['type']])
            formula = props['Expression']
            value = {'NULL':None, 'TRUE':True, 'FALSE':False}[formula] if formula in ('NULL','TRUE','FALSE') else json.loads(formula)
            assert type(value) is type(field['value']) and value == field['value'], (side, field['name'])


def output(updated=False):
    result = []
    used = set()
    for side in ('left', 'right'):
        for field in source[side]:
            item = dict(field)
            if updated and side == source['update']['source'] and field['name'] == source['update']['name']:
                item['value'] = source['update']['value']
            name = field['name']
            while name in used:
                match = re.fullmatch(r'(.*?)(\d+)', name)
                name = match[1] + str(int(match[2]) + 1) if match else name + '_1'
            item['name'] = name
            used.add(name)
            if field['type'] == 'real':
                item['tolerance'] = {'abs': 1e-12, 'rel': 1e-12}
            result.append(item)
    return {'output_node_type': 'variables.column_union', 'output_port': 0,
            'port_kind': 'variables', 'ordered': True, 'variables': result}


expected = {'status': 'proposal_pending_criteria_and_W1',
            'initial': output(), 'updated': output(True)}
text = json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
if __name__ == '__main__':
    import sys
    if '--check' in sys.argv:
        check_fixture()
        assert (HERE / 'expected.json').read_text(encoding='utf-8') == text, 'expected differs from oracle'
        print('oracle: PASS')
    else:
        (HERE / 'expected.json').write_text(text, encoding='utf-8')
