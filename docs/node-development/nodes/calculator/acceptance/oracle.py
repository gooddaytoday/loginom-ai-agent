"""Calculator business oracle, independent of runtime and captured output.

Ported semantics from calculator_goal_contract.py; no Hermes transport or pins.
Generate expectations before the model run. Verify cold result and CLI events
afterward; neither file is model input. Row order is deliberately immaterial.
"""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
COLUMNS = [dict(name=n, label=l, type=t) for n, l, t in [
    ('Id', 'Id', 'integer'), ('Qty', 'Количество', 'integer'),
    ('Revenue', 'Сумма', 'real'), ('Adjusted', 'Сумма', 'real'),
    ('UnitPrice', 'UnitPrice', 'real'), ('Note', 'Комментарий', 'string'),
    ('Moment', 'Дата', 'datetime'), ('Comment', 'Comment', 'string')]]
EXPRESSIONS = [dict(name=n, label=l, type=t, formula=f, replace=r) for n, l, t, f, r in [
    ('Revenue', 'Сумма', 'real', 'Qty * UnitPrice', False),
    ('Adjusted', 'Сумма', 'real', 'Revenue + 0.0001', False),
    ('UnitPrice', 'UnitPrice', 'real', 'UnitPrice * 2', True),
    ('Note', 'Комментарий', 'string', 'If(IsNull(Comment), "missing", Concat(Comment, "!"))', False),
    ('Moment', 'Дата', 'datetime', 'EncodeDate(2024, 2, 29)', False)]]


def need(ok, message):
    if not ok:
        raise ValueError(message)


def expected(package_path='{{PACKAGE_PATH}}'):
    source = ROOT / 'data/sales.csv'
    need(len(source.read_bytes()) == 230, 'source size')
    need(hashlib.sha256(source.read_bytes()).hexdigest() ==
         'f628434c20873f7dd9a8ee142c17af7c0b99f447114fcf60e983f6ed6b357eb3', 'source bytes')
    with source.open(encoding='utf-8', newline='') as stream:
        records = list(csv.DictReader(stream, delimiter=';'))
    rows = []
    for row in records:
        quantity, price = int(row['Quantity']), float(row['UnitPrice'])
        revenue = quantity * price
        comment = None if row['Comment'] == '\\N' else row['Comment']
        rows.append(dict(Id=int(row['Id']), Qty=quantity, Revenue=revenue,
                         Adjusted=revenue + 0.0001, UnitPrice=price * 2,
                         Note='missing' if comment is None else comment + '!',
                         Moment='2024-02-29T00:00:00.000', Comment=comment))
    need(len(rows) == 6 and len({r['Id'] for r in rows}) == 6, 'source rows')
    return dict(package_path=package_path, nodes=[dict(type='imports.text'),
                dict(type='transform.calculator')], output_node_type='transform.calculator',
                columns=COLUMNS, rows=rows)


def verify_table(port, want, execution):
    need(execution.get('status') == 'completed' and execution.get('execution_id'), 'completed execution')
    need(port.get('execution_id') == execution['execution_id'] and port.get('fresh') is True,
         'fresh output bound to execution')
    need(port.get('row_count') == len(want['rows']) and port.get('sample_complete') is True
         and len(port.get('sample', [])) == len(want['rows']), 'complete output')
    need(port.get('precision', {}).get('numbers_verified') is True, 'exact numeric proof')
    need([{k: c[k] for k in ('name', 'label', 'type')} for c in port['schema']] == COLUMNS,
         'column names, labels, types and order')
    unmatched = list(want['rows'])
    for sample in port['sample']:
        need(len(sample) == len(COLUMNS), 'row width')
        actual = {}
        for column, cell in zip(COLUMNS, sample):
            need(cell['type'] == column['type'], 'cell type')
            value = cell['value']
            if cell['is_null']:
                need(value is None, 'null value')
            elif column['type'] == 'integer':
                need(isinstance(value, str) and re.fullmatch(r'-?[0-9]+', value), 'integer representation')
                value = int(value)
            elif column['type'] == 'datetime':
                need(cell.get('precision') == 'millisecond' and
                     cell.get('representation') == 'local_datetime' and
                     cell.get('timezone') == 'unspecified', 'datetime representation')
            actual[column['name']] = value
        need(actual in unmatched, 'unexpected, duplicate or substituted row')
        unmatched.remove(actual)
    need(not unmatched, 'missing row')


def verify_cold(result, package_path):
    need(result['status'] == 'PASS' and result['path'] == package_path and
         result['settingsReapplied'] is False, 'cold package persistence')
    need(result['cleanup'] == dict(package_closed=True, logged_out=True), 'cold cleanup')
    node, execution = result['node'], result['execution']
    need(all(node.get(k) for k in ('document_id', 'workflow_id', 'node_id')), 'cold node identity')
    need(execution.get('verified') is True and execution.get('owner_verified') is True, 'owned cold execution')
    need(len(result['output']['ports']) == 1, 'one output')
    verify_table(result['output']['ports'][0], expected(package_path), execution)


def tokens(formula):
    return re.findall(r'"(?:[^"]|"")*"|\S', formula)


def verify_events(events, package_path):
    calls, replies = [], {}
    seen = set()
    for event in events:
        if event.get('type') != 'tool_use':
            continue
        part = event['part']
        if part['state']['status'] != 'completed' or part['id'] in seen:
            continue
        seen.add(part['id'])
        raw = part['state'].get('output')
        reply = json.loads(raw) if isinstance(raw, str) else raw
        calls.append((part['tool'], part['state']['input'], reply))
        if isinstance(reply, dict) and reply.get('state') == 'settled':
            replies[reply['operation_id']] = reply
    calculators = [(i, r) for tool, i, direct in calls
                   if tool == 'loginom_dock_node_apply' and i.get('target', {}).get('type') == 'transform.calculator'
                   for r in [replies.get(i['operation_id'], direct)]
                   if isinstance(r, dict) and r.get('status') == 'SUCCEEDED']
    need(calculators, 'successful calculator apply')
    request, reply = calculators[-1]
    need(request['mode'] == 'expression' and reply['cleanup_complete'] is True, 'calculator mode and cleanup')
    observed = reply['configuration']['readback']
    need(observed['node'] == reply['node'] and observed['values_are'] == 'observed_ui_values', 'observed owned configuration')
    need(len(observed['expressions']) == len(EXPRESSIONS), 'expression inventory')
    for got, want in zip(observed['expressions'], EXPRESSIONS):
        need(all(got[k] == want[k] for k in ('name', 'label', 'type', 'replace')) and
             tokens(got['formula']) == tokens(want['formula']), 'expression semantics')
    input_mapping, output_mapping = observed['input_mapping'], observed['output_mapping']
    need(input_mapping['autosync'] is False and output_mapping['autosync'] is False, 'mapping autosync')
    need([(f['source_name'], f['name'], f['label']) for f in input_mapping['fields']] ==
         [('Id', 'Id', 'Id'), ('Region', 'Region', 'Region'), ('Quantity', 'Qty', 'Количество'),
          ('UnitPrice', 'UnitPrice', 'UnitPrice'), ('Comment', 'Comment', 'Comment')], 'input mapping')
    need([f['name'] for f in output_mapping['fields'] if not f['excluded']] ==
         [c['name'] for c in COLUMNS] and
         [f['name'] for f in output_mapping['fields'] if f['excluded']] == ['Region'], 'output mapping')
    verify_table(reply['output']['ports'][0], expected(package_path), reply['execution'])
    imports = [r for tool, i, direct in calls
               if tool == 'loginom_dock_node_apply' and i.get('target', {}).get('type') == 'imports.text'
               for r in [replies.get(i['operation_id'], direct)]
               if isinstance(r, dict) and r.get('status') == 'SUCCEEDED']
    need(len(imports) == 1 and request['inputs'][0]['source'] == imports[0]['node'], 'owned import connection')
    need(imports[0]['node']['document_id'] == reply['node']['document_id'] and
         imports[0]['node']['workflow_id'] == reply['node']['workflow_id'], 'same workflow')
    saves = [i for tool, i, r in calls if tool == 'loginom_dock_action_run' and
             i.get('action_key') in ('package.save_as', 'package.save_checkpoint') and
             isinstance(r, dict) and r.get('status') == 'SUCCEEDED' and
             i.get('parameters', {}).get('path') == package_path]
    need(saves, 'final package saved')
    return dict(node=reply['node'], execution_id=reply['execution']['execution_id'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--package-path', default='{{PACKAGE_PATH}}')
    parser.add_argument('--cold', type=Path)
    parser.add_argument('--events', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.cold or args.events:
        proof = {}
        if args.cold:
            verify_cold(json.loads(args.cold.read_text()), args.package_path)
            proof['cold'] = 'PASS'
        if args.events:
            proof['cli'] = verify_events([json.loads(line) for line in args.events.read_text().splitlines() if line], args.package_path)
        result = dict(status='PASS', proof=proof)
    else:
        result = expected(args.package_path)
    (args.output or ROOT / 'expected.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
