"""Audit native downloaded CSV bytes against independently computed input rows."""
import csv
import hashlib
import io
import re
from pathlib import PurePosixPath

from audit_sales_scenario import require
from audit_corpus_tables import compare_rows


def audit_exported_csv(run, plan, expected, evidence):
    nodes = {n['id']: n for n in plan['expected_graph']['nodes']}
    checked = {}
    for operation in plan['model_operations_for_review']:
        node = operation['node_id']
        if nodes[node]['type'] != 'exports.text':
            continue
        p, op = operation['parameters'], operation['operation_id']
        require(p.get('delimiter', ',') == ',' and p.get('decimal_separator', '.') == '.'
                and p.get('header', 'names') == 'names' and p.get('text_qualifier', '"') == '"'
                and p.get('encoding', 'UTF-8') == 'UTF-8', 'CSV format needs explicit independent review')
        links = [e for e in plan['expected_graph']['links'] if e['target'] == node]
        require(len(links) == 1 and links[0]['input'] == 0, 'Export source binding differs')
        sources = [o for o in plan['outputs'] if o['node_id'] == links[0]['source'] and o['port'] == links[0]['output']]
        require(len(sources) == 1, 'Unique fully audited export source required')
        wanted = expected['tables'][sources[0]['name']]
        replies = [t['result'] for t in evidence['tools'] if isinstance(t.get('result'), dict)
                   and t['result'].get('operation_id') == op and t['result'].get('status') == 'SUCCEEDED']
        require(replies and all(r == replies[0] for r in replies), 'Unambiguous completed export required')
        result = replies[0]
        artifacts = result['output']['file_artifacts']
        require(len(artifacts) == 1 and result['node']['node_id'] == node, 'Export receipt node differs')
        artifact = artifacts[0]
        require(artifact['destination'] == p['destination'] and artifact['execution_id'] == result['execution']['execution_id']
                and re.fullmatch(r'[0-9a-f-]{36}', artifact['artifact_id']), 'Export receipt identity differs')
        downloads = [e for e in evidence['events'] if e.get('phase') == 'export_file_download_completed'
                     and e.get('operation_id') == op and e.get('id') == artifact['verification_id']]
        require(len(downloads) == 1, 'Unique native download evidence required')
        event = downloads[0]
        outcome = event['outcome']; output = outcome['output']; binding = output['output_binding']
        require(outcome['status'] == 'SUCCEEDED' and outcome['cleanup_complete'] is True
                and output['download_completed'] is True and output['artifact_id'] == artifact['artifact_id']
                and binding['node_id'] == node and binding['destination'] == p['destination']
                and binding['execution_id'] == artifact['execution_id'], 'Native download binding differs')
        require(re.fullmatch(r'[0-9a-f-]{36}', event['session_id']), 'Invalid session ID')
        base = run/'private/dock-state/sessions'/event['session_id']/'artifacts/input'/('output-'+artifact['artifact_id'])
        path = base/PurePosixPath(p['destination']).name
        require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(run.resolve()), 'Owned downloaded file required')
        data = path.read_bytes()
        require(len(data) == artifact['bytes'] and hashlib.sha256(data).hexdigest() == artifact['sha256'], 'Export bytes/hash differ')
        reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig')), strict=True)
        require(reader.fieldnames == list(wanted['fields']), 'Export header/order differs')
        rows = list(reader)
        require(all(None not in row and all(v is not None for v in row.values()) for row in rows), 'Malformed CSV row')
        require(all(kind in ('integer', 'real', 'string') for kind in wanted['fields'].values()), 'CSV type needs independent parser')
        checked[op] = dict(status='PASS', destination=p['destination'], sha256=artifact['sha256'],
                           native_download_verified=True, **compare_rows(rows, wanted))
    return dict(status='PASS', scope='all_native_downloaded_exports', files=checked)
