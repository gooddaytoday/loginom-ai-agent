"""One real fresh case. This result cannot represent a model-run acceptance."""
import json
from pathlib import Path
import re
import sys
from verify_downloads import verify, raw_result
from package_snapshot import snapshot, compare, verify_graph
from export_live import export
from import_settings import format_equal
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import collapse_acceptance as admission
from collapse_node_acceptance import native_case, pairs


def check(directory, *, expected_runtime=None):
    expected_runtime=admission.RUNTIME if expected_runtime is None else expected_runtime
    directory=Path(directory);spec=json.loads((directory/'readonly-specification.json').read_text())
    session=json.loads((directory/'session.json').read_text())
    if session.get('automaticReadonlyReopen') is not True or session['clientRevision']!=expected_runtime:
        raise ValueError('automatic current-runtime session required')
    before=verify(directory,spec)
    compare(snapshot(Path(spec['baseline_package']).read_bytes()),before['snapshot'])
    refs=json.loads((directory/'graph-raw-refs.json').read_text())
    for key in ['before','after']:
        ref=refs[key]
        if not re.fullmatch(r'browser-\d+\.json',ref):raise ValueError('invalid raw graph reference')
        graph=json.loads((directory/('graph-'+key+'.json')).read_text())
        if raw_result(directory/ref)!=graph:raise ValueError('native graph raw reply differs')
        if graph['document_id']!=before['document_id'] or graph['package_path']!=spec['package']['path']:raise ValueError('graph owner differs')
        verify_graph(before['snapshot'],graph)
    if refs['before']!='browser-8.json':raise ValueError('initial topology was not read before any public write')
    transcript=[json.loads(line) for line in (directory/'public-api.jsonl').read_text().splitlines()]
    requests=[e for e in transcript if e['phase']=='request']
    if not requests or any(e['before']<9 for e in requests):raise ValueError('public call preceded readonly checks')
    prefix=spec['run_id']+':'+spec['case']
    if requests[0]['request']['name']!='dock_artifact_deliver' or requests[0]['request']['arguments']['operation_id']!=prefix+':source':raise ValueError('first public mutation is not explicit source admission')
    evidence=export(directory,spec['run_id'])
    request,body=native_case(evidence,pairs(evidence),prefix+':reopen',spec['case'])
    if request['parameters']!={} or request['mappings']!=[]:raise ValueError('Collapse was reconfigured during reopen')
    original=json.loads(Path(spec['baseline_case']).read_text())
    if body['node']['document_id']==original['node']['document_id'] or body['node']['node_id']!=original['node']['node_id']:raise ValueError('fresh document/same node not proved')
    for name in ['schema','exact_table']:
        if body['output']['ports'][0][name]!=original['output']['ports'][0][name]:raise ValueError('saved result changed: '+name)
    for name in ['mode','information','transposed','ignore_empty','input_mapping','output_mapping']:
        if body['configuration']['readback'][name]!=original['configuration']['readback'][name]:raise ValueError('saved Collapse setting changed: '+name)
    old_import=json.loads(Path(spec['baseline_import']).read_text())['output']['configuration']['readback']
    new_import=json.loads((directory/'reopened-import.json').read_text())['output']['configuration']['readback']
    for name in ['source','format','columns','output_mapping']:
        if not (format_equal(old_import[name],new_import[name]) if name=='format' else old_import[name]==new_import[name]):raise ValueError('saved import setting changed: '+name)
    import_call=next(c for c in evidence['calls'] if c['tool'].endswith('dock_node_apply') and c['arguments']['operation_id']==prefix+':import')
    if import_call['arguments']['parameters']['settings']!={} or import_call['arguments']['mappings']!=[]:raise ValueError('source was reconfigured during reopen')
    return {'case':spec['case'],'status':'FRESH_NATIVE_CASE_PASS','runtime':session['clientRevision'],
            'document_id':before['document_id'],'session_id':session['sessionId'],'before_document_id':original['node']['document_id'],
            'operation_id':prefix+':reopen','cells':body['output']['ports'][0]['read_coverage']['cells_read'],
            'readonly_first':True,'topology':True,'persisted_settings':True,'model_run':False,'autonomous_acceptance':False}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('--output',required=True);a=p.parse_args()
    result=check(a.directory);Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
