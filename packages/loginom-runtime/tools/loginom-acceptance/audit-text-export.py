#!/usr/bin/env python3
"""Independent byte auditor: no imports from the handler and no native-file writes."""
import argparse, copy, csv, hashlib, io, json, pathlib, stat
from text_export_origin import observed_origin

def expected_bytes(fixture, settings):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, delimiter=settings['delimiter'], quotechar='"', doublequote=True,
                        lineterminator=settings['line_ending'], quoting=csv.QUOTE_MINIMAL)
    if settings['header'] != 'none':
        writer.writerow(fixture[settings['header']])
    for row in fixture['rows']:
        writer.writerow([settings['null_marker'] if value is None else value for value in row])
    return (b'\xef\xbb\xbf' if settings['bom'] else b'') + stream.getvalue().encode('utf-8')

def audit(receipt, fixture, settings, actual, destination, execution_id=None, events=None, expected_runtime=None):
    assert receipt['status'] == 'SUCCEEDED' and receipt['cleanup_complete'] is True, 'Node did not complete'
    node = receipt['output']
    assert node['status'] == 'SUCCEEDED' and node['cleanup_complete'] is True
    assert node['execution']['status'] == 'completed'
    run = node['execution']['execution_id']
    assert run and (execution_id is None or run == execution_id), 'Wrong execution'
    assert node['output']['status'] == 'complete' and node['output']['ports'] == []
    assert node['output']['execution_id'] == run
    assert len(node['output']['file_artifacts']) == 1
    artifact = node['output']['file_artifacts'][0]
    assert artifact['destination'] == destination and artifact['execution_id'] == run
    assert artifact['verification_id'] == node['operation_id'] + ':export-download'
    assert artifact['freshness_basis'] in ['native_absence_check_and_completed_execution', 'explicit_replace_and_completed_native_execution']
    assert artifact['bytes'] == len(actual) and artifact['sha256'] == hashlib.sha256(actual).hexdigest(), 'Artifact integrity mismatch'
    assert actual == expected_bytes(fixture, settings), 'Full native bytes differ from independent expectation'
    readback = node['configuration']['readback']
    assert readback['kind'] == 'text_export' and readback['node'] == node['node'] and readback['destination'] == destination
    assert readback['package_persistence_verified'] is False and node['package_saved'] is False
    native = {'delimiter': settings['delimiter'], 'bom': settings['bom'], 'header': {'none':0,'names':1,'labels':2}[settings['header']],
              'line_ending': {'\n':0,'\r\n':1}[settings['line_ending']], 'encoding':65001,'null_marker': settings['null_marker']}
    assert all(readback['settings'][k] == v for k, v in native.items()), 'Format readback differs'
    assert readback['receipt_ids'] == [node['operation_id'] + ':' + p for p in ['input_mapping','configure','finish']]
    if events is not None:
        own = [e for e in events if e.get('operation_id') == node['operation_id']]
        def one(phase):
            matches = [e for e in own if e.get('phase') == phase]
            assert len(matches) == 1, 'Missing or duplicate ' + phase
            return matches[0]
        assert one('node_checkpoint')['result'] == node, 'Checkpoint differs from delivered result'
        phase_records = [e['receipt'] for e in own if e.get('phase') == 'node_phase_completed']
        assert [e['phase'] for e in phase_records] == [e['phase'] for e in node['phases']], 'Phase chain differs'
        phases = {e['phase']:e['value'] for e in phase_records}
        assert all(e['status'] == 'verified' for e in phase_records)
        assert phases['execute']['owner_verified'] is True and phases['execute']['execution_id'] == run
        assert phases['finish']['mode'] == 'execute' and phases['finish']['execution_id'] == run
        assert phases['read'] == node['output']
        assert phases['input_mapping']['source_identity_verified'] is True
        targets = [e['target_state'] for e in own if e.get('phase') == 'node_target_checkpoint' and e['target_state'].get('completed')]
        assert targets, 'Missing completed graph evidence'
        target = targets[-1]
        graph = target['final_graph']
        assert graph['complete'] is True and graph['document_id'] == node['node']['document_id']
        assert graph['workflow_ref']['workflow_id'] == node['node']['workflow_id']
        links = [e for e in graph['links'] if e['target'] == node['node']['node_id']]
        assert len(links) == 1 and links[0]['input'] == 0, 'Export must have one bound table source'
        requested = one('completed')['parameters']['inputs']
        if requested:
            expected_link = {'source':requested[0]['source']['node_id'], 'output':requested[0]['output'],
                             'target':node['node']['node_id'], 'input':0}
            assert links == [expected_link], 'Export source differs from request'
        else:
            assert links == [e for e in target['baseline']['links'] if e['target'] == node['node']['node_id']], 'Existing export source changed'
        assert target['result']['node']['ref'] == node['node']
        mapping = phases['input_mapping']['native_mapping']
        assert mapping['inventory_complete'] is True and len(mapping['target_fields']) == len(fixture['names'])
        assert [f['name'] for f in mapping['target_fields']] == fixture['names']
        assert [f['label'] for f in mapping['target_fields']] == fixture['labels']
        assert all(f.get('source',{}).get('name') == f['name'] and f['source'].get('type') == f['type'] for f in mapping['target_fields'])
        configured = phases['configure']['configuration']['configured']
        observed = {k:v['value'] for stage in configured.values() if isinstance(stage, dict) and 'values' in stage for k,v in stage['values'].items()}
        assert observed == readback['settings'], 'Readback was not observed in configuration'
        verified = one('export_file_bytes_verified')
        assert verified['result'] == artifact
        binding = verified['binding']
        assert all(binding[k] == v for k,v in node['node'].items())
        assert binding['execution_id'] == run and binding['destination'] == destination
        assert binding['session_id'] == verified['session_id']
        downloaded = one('export_file_download_completed')['outcome']
        assert downloaded['status'] == 'SUCCEEDED' and downloaded['cleanup_complete'] is True
        assert downloaded['output']['download_completed'] is True
        assert downloaded['output']['suggested_name'] == destination.rsplit('/',1)[1]
        assert all(downloaded['output']['output_binding'][k] == v for k,v in binding.items())
        assert one('export_file_read_completed')['workflow_return_verified'] is True
        assert len({e['session_id'] for e in own}) == 1 and len({e['runtime_revision'] for e in own}) == 1
        observed_origin(events, node['operation_id'], node['node'], runtime=expected_runtime, session=verified['session_id'])
        assert expected_runtime is None or {e['runtime_revision'] for e in own} == {expected_runtime}
    return {'passed':True, 'bytes':len(actual), 'sha256':artifact['sha256'], 'rows':len(fixture['rows']), 'columns':len(fixture['names']), 'execution_id':run}

def challenge_events(receipt, fixture, settings, actual, destination, events, runtime):
    operation = receipt['output']['operation_id']
    count = 0
    for kind in ['missing_download','duplicate_bytes','wrong_session','wrong_runtime','wrong_origin','wrong_source','wrong_link_source','false_readback','false_checkpoint']:
        changed = copy.deepcopy(events)
        def one(phase):
            return next(e for e in changed if e.get('operation_id') == operation and e.get('phase') == phase)
        if kind == 'missing_download':
            changed = [e for e in changed if not (e.get('operation_id') == operation and e.get('phase') == 'export_file_download_completed')]
        elif kind == 'duplicate_bytes': changed.append(copy.deepcopy(one('export_file_bytes_verified')))
        elif kind == 'wrong_session': one('export_file_bytes_verified')['session_id'] = 'foreign'
        elif kind == 'wrong_runtime': one('export_file_bytes_verified')['runtime_revision'] = 'foreign'
        elif kind == 'wrong_origin': one('export_file_bytes_verified')['target']['origin'] = 'https://foreign.invalid'
        elif kind == 'wrong_source':
            phase = next(e for e in changed if e.get('operation_id') == operation and e.get('phase') == 'node_phase_completed' and e['receipt']['phase'] == 'input_mapping')
            phase['receipt']['value']['native_mapping']['target_fields'][0]['source']['name'] = 'foreign'
        elif kind == 'wrong_link_source':
            target = next(e['target_state'] for e in reversed(changed) if e.get('operation_id') == operation and e.get('phase') == 'node_target_checkpoint' and e['target_state'].get('completed'))
            next(e for e in target['final_graph']['links'] if e['target'] == receipt['output']['node']['node_id'])['source'] = 'foreign'
        elif kind == 'false_readback':
            phase = next(e for e in changed if e.get('operation_id') == operation and e.get('phase') == 'node_phase_completed' and e['receipt']['phase'] == 'configure')
            phase['receipt']['value']['configuration']['configured']['text_export_format']['values']['bom']['value'] = not settings['bom']
        elif kind == 'false_checkpoint': one('node_checkpoint')['result']['package_saved'] = True
        try: audit(receipt,fixture,settings,actual,destination,events=changed,expected_runtime=runtime)
        except (AssertionError,KeyError,StopIteration): count += 1
        else: raise AssertionError('Auditor accepted tampering: ' + kind)
    return count

def main():
    p=argparse.ArgumentParser();p.add_argument('--negative-checks',action='store_true');p.add_argument('--runtime',required=True);p.add_argument('--events',required=True);p.add_argument('--receipt',required=True);p.add_argument('--fixture',required=True);p.add_argument('--settings',required=True);p.add_argument('--native-file',required=True);p.add_argument('--destination',required=True);a=p.parse_args()
    file=pathlib.Path(a.native_file);info=file.lstat();assert stat.S_ISREG(info.st_mode) and info.st_size<=16777216
    receipt=json.loads(pathlib.Path(a.receipt).read_text());receipt=receipt.get('result',receipt)
    fixture=json.loads(pathlib.Path(a.fixture).read_text());settings=json.loads(pathlib.Path(a.settings).read_text())
    actual=file.read_bytes();events=[json.loads(l) for l in pathlib.Path(a.events).read_text().splitlines()]
    result=audit(receipt,fixture,settings,actual,a.destination,events=events,expected_runtime=a.runtime)
    if a.negative_checks: result['rejected_event_tamperings']=challenge_events(receipt,fixture,settings,actual,a.destination,events,a.runtime)
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
