#!/usr/bin/env python3
"""Independent proposal from authored inputs; no Loginom result is consumed."""
import csv
import json
import math
import sys
from collections import Counter
from datetime import datetime
from fractions import Fraction
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent.parent / 'fixtures'
FUNCTIONS = {
    'count': ('Count', 'Количество'), 'min': ('Min', 'Минимум'),
    'max': ('Max', 'Максимум'), 'median': ('Median', 'Медиана'),
    'mode': ('Mode', 'Мода'), 'standard_deviation': ('Std', 'Стандартное откл.'),
    'unique_count': ('Uniq', 'Кол-во уникальных'),
    'null_count': ('Null', 'Кол-во пропусков'), 'first': ('First', 'Первый'),
    'last': ('Last', 'Последний'), 'only': ('Only', 'Единственный'),
    'concat': ('Concat', 'Список'),
}
NUMERIC = ['median', 'mode', 'standard_deviation', 'unique_count', 'null_count',
           'first', 'last', 'only', 'concat']
SCALAR = ['count', 'min', 'max', 'mode', 'unique_count', 'null_count',
          'first', 'last', 'only']


def key(value):
    # Explicitly typed equality: Python's False == 0 must not collapse Variant.
    return (type(value).__name__, value)


def order(value):
    # Proposal restricted to this fixture's Boolean/number/ASCII-string domain.
    return ({bool: 0, int: 1, float: 1, str: 2}[type(value)], value)


def aggregate(values, function):
    nonnull = [value for value in values if value is not None]
    distinct = list(dict.fromkeys(key(value) for value in nonnull))
    if function == 'count':
        return len(values)
    if function == 'null_count':
        return len(values) - len(nonnull)
    if function == 'unique_count':
        return len(distinct)
    if not nonnull:
        raise ValueError('Empty/all-NULL aggregation semantics were not observed')
    if function == 'median':
        sorted_values = sorted(nonnull)
        middle = len(sorted_values) // 2
        return float(sorted_values[middle] if len(sorted_values) % 2 else
                     Fraction(sorted_values[middle - 1] + sorted_values[middle], 2))
    if function == 'standard_deviation':
        mean = Fraction(sum(nonnull), len(nonnull))
        variance = sum((Fraction(value) - mean) ** 2 for value in nonnull) / (len(nonnull) - 1)
        return math.sqrt(variance)
    if function == 'mode':
        counts = Counter(key(value) for value in nonnull)
        frequency = max(counts.values())
        return min((value for value in nonnull if counts[key(value)] == frequency), key=order)
    if function in ('min', 'max'):
        return (min if function == 'min' else max)(nonnull, key=order)
    if function == 'first':
        assert values[0] is not None, 'Boundary NULL behavior remains unverified'
        return values[0]
    if function == 'last':
        assert values[-1] is not None, 'Boundary NULL behavior remains unverified'
        return values[-1]
    if function == 'only':
        return nonnull[0] if len(distinct) == 1 else None
    if function == 'concat':
        return ','.join(str(value) for _, value in distinct)
    raise ValueError(function)


def inventory(data, names):
    variables = []
    for column in data['columns']:
        name, datatype = column['name'], column['type']
        if name not in names:
            continue
        functions = NUMERIC if name == 'N' else ['only'] if name == 'K' else SCALAR + (['concat'] if name == 'S' else [])
        values = [row[data['columns'].index(column)] for row in data['rows']]
        for function in functions:
            suffix, label = FUNCTIONS[function]
            output_type = ('integer' if function in ('count', 'unique_count', 'null_count') else
                           'real' if function in ('median', 'standard_deviation') else
                           'string' if function == 'concat' else datatype)
            item = {'name': name if len(functions) == 1 else name + '_' + suffix,
                    'label': name + '|' + label, 'type': output_type,
                    'value': aggregate(values, function)}
            if output_type == 'real':
                item['tolerance'] = {'abs': 1e-12, 'rel': 1e-12}
            variables.append(item)
    return {'output_node_type': 'variables.from_table', 'output_port': 0,
            'port_kind': 'variables', 'ordered': True, 'variables': variables}


def source_code(data):
    def literal(value, datatype):
        if datatype == 'datetime' and value is not None:
            moment = datetime.fromisoformat(value)
            parts = [moment.year, moment.month - 1, moment.day, moment.hour,
                     moment.minute, moment.second, moment.microsecond // 1000]
            while len(parts) > 3 and parts[-1] == 0:
                parts.pop()
            return 'new Date(' + ','.join(map(str, parts)) + ')'
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

    rows = '[' + ','.join('[' + ','.join(literal(value, column['type'])
                          for value, column in zip(row, data['columns'])) + ']'
                          for row in data['rows']) + ']'
    return ('import { OutputTable, DataType } from "builtIn/Data";\n'
            'OutputTable.AssignColumns([...["N","K"].map(Name=>({Name,DataType:DataType.Integer})),{Name:"S",DataType:DataType.String},{Name:"B",DataType:DataType.Boolean},{Name:"D",DataType:DataType.DateTime},{Name:"V",DataType:DataType.Variant}]);\n'
            'for (const row of ' + rows + ') { OutputTable.Append(); ["N","K","S","B","D","V"].forEach((n,i)=>OutputTable.Set(n,row[i])); }')


def check_inputs(data):
    assert [column['name'] for column in data['columns']] == ['N', 'K', 'S', 'B', 'D', 'V']
    assert [column['type'] for column in data['columns']] == ['integer', 'integer', 'string', 'boolean', 'datetime', 'variant']
    assert len(data['rows']) == 5 and all(len(row) == 6 for row in data['rows'])
    with (FIXTURES / 'aggregate-numeric.csv').open(encoding='utf-8', newline='') as stream:
        rows = list(csv.reader(stream))
    assert rows == [['N', 'K']] + [[str(row[0]) if row[0] is not None else '?', str(row[1])] for row in data['rows']]
    with ZipFile(FIXTURES / 'aggregate-source.lgp') as package:
        engines = list(ElementTree.fromstring(package.read('Unit_0/Unit.xml')).iter('Engine'))
        types = [engine.attrib.get('{http://www.w3.org/2001/XMLSchema-instance}type') for engine in engines]
        assert sorted(types) == ['TBGJavaScriptEngine', 'TBGModelVariablesComponentEngine']
        source = next(engine for engine in engines if engine.attrib.get('Code') is not None)
        assert source.attrib['CodeConfigurableColumns'] == 'true'
        assert source.attrib['Code'] == source_code(data), 'Native input source differs from authored inputs'


def main():
    data = json.loads((FIXTURES / 'aggregate-types.json').read_text(encoding='utf-8'))
    check_inputs(data)
    result = {'status': 'proposal_pending_owner_approval',
              'native_subtypes_verified': False,
              'numeric': inventory(data, ['N', 'K']),
              'scalar_types': inventory(data, ['S', 'B', 'D']),
              'variant': inventory(data, ['V']),
              'discovery_combined': inventory(data, ['N', 'K', 'S', 'B', 'D', 'V'])}
    text = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if '--check' in sys.argv:
        assert (HERE / 'expected.json').read_text(encoding='utf-8') == text, 'Expected differs from independent calculation'
        print('oracle: PASS; numeric=10; scalar_types=28; variant=9; combined=47; native Variant subtypes remain unverified')
    else:
        (HERE / 'expected.json').write_text(text, encoding='utf-8')


if __name__ == '__main__':
    main()
