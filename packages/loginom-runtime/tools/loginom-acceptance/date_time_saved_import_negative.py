"""Mutation audit over an actual successful v2 saved-import diagnostic."""
import argparse
import copy
import json
import shutil
import tempfile
from pathlib import Path
from date_time_saved_import_evidence import verify_saved_import


def verify(directory, operation_id, original_request, original):
    events = [json.loads(x) for x in (directory/'execution-events.jsonl').read_text().splitlines()]
    baseline = verify_saved_import(events, operation_id, original_request, original, directory)
    if not baseline['passed']:
        return dict(passed=False, failures=['positive_live_baseline_required'], baseline=baseline)
    names = ['source_path','format','column_type','mapping_source','download_bytes','download_sha',
             'wizard_mutation','wizard_finish','missing_cancel','settings_applied','stale_execution','partial_output','reupload']
    cases = []
    for name in names:
        rows = copy.deepcopy(events)
        own = [e for e in rows if e.get('operation_id') == operation_id]
        configuration = next(e for e in own if e.get('phase') == 'diagnostic_import_configuration_read')
        end = next(e for e in own if e.get('phase') == 'diagnostic_import_completed')['result']
        downloaded = next(e for e in rows if e.get('phase') == 'diagnostic_source_download_completed')['receipt']
        if name == 'source_path':
            configuration['configuration']['source']['source_path'] = '/test-3/foreign.csv'
        elif name == 'format':
            configuration['configuration']['format']['null_marker'] = '?'
        elif name == 'column_type':
            configuration['configuration']['columns'][1]['type'] = 'string'
        elif name == 'mapping_source':
            configuration['native_mapping']['target_fields'][0]['source'] = configuration['native_mapping']['source_fields'][1]
        elif name == 'download_sha':
            downloaded['sha256'] = '0'*64
        elif name in ('wizard_mutation','wizard_finish'):
            event = next(e for e in own if e.get('phase') == 'node_step_prepared' and e.get('action', {}).get('verb') == 'wizard_step')
            event['action']['verb'] = 'fill' if name == 'wizard_mutation' else 'finish_wizard'
        elif name == 'missing_cancel':
            rows = [e for e in rows if e.get('phase') != 'diagnostic_import_cancelled']
        elif name == 'settings_applied':
            next(e for e in own if e.get('phase') == 'diagnostic_import_cancelled')['cancellation']['settings_applied'] = True
        elif name == 'stale_execution':
            end['execution']['execution_id'] = original['execution']['execution_id']
        elif name == 'partial_output':
            end['output']['ports'][0]['sample'].pop()
        elif name == 'reupload':
            rows.append(dict(action_key='artifact.upload', phase='prepared', operation_id='forbidden'))
        with tempfile.TemporaryDirectory(prefix='node13-import-negative-') as tmp:
            root = Path(tmp)
            for receipt in [e['receipt'] for e in rows if e.get('phase') == 'diagnostic_source_download_completed']:
                relative = Path(receipt['download_file']); destination = root/relative
                destination.parent.mkdir(parents=True,exist_ok=True)
                shutil.copyfile(directory/relative,destination)
                if name == 'download_bytes':
                    destination.write_bytes(destination.read_bytes()+b'\n')
            result = verify_saved_import(rows, operation_id, original_request, original, root)
        cases.append(dict(case=name,rejected=not result['passed'],failures=result['failures']))
    return dict(passed=all(c['rejected'] for c in cases),cases=cases,scope='saved_import_v2_live_evidence_mutations')


if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path);p.add_argument('operation_id');p.add_argument('original',type=Path)
    a=p.parse_args();source=json.loads(a.original.read_text());result=verify(a.directory,a.operation_id,source['request'],source['checkpoint'])
    (a.directory/'saved-import-negative-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(0 if result['passed'] else 1)
