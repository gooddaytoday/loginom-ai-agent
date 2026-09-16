"""Independent save/reopen check without rewriting saved import or node settings.

Source bytes were verified at the original upload. This audit additionally binds
saved UI settings, a native inactive->active source transition, a fresh target
execution, the rendered graph, and complete output in a new prepared document.
It does not invent a separate execution ID for an implicitly executed source.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
from audit_missing_values_run import source_evidence
from missing_values_contract import audit_missing_values


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--before-dir',type=Path,required=True)
    parser.add_argument('--before-case',required=True)
    parser.add_argument('--after-dir',type=Path,required=True)
    parser.add_argument('--after-case',required=True)
    parser.add_argument('--expected-case',required=True)
    parser.add_argument('--fixture',required=True)
    parser.add_argument('--manual-save-as',type=Path,help='Observed diagnostic Save As when the original package was read-only')
    a=parser.parse_args()
    read=lambda directory,name:json.loads((directory/name).read_text())
    before=read(a.before_dir,a.before_case+'-requests.json')
    before_result=read(a.before_dir,a.before_case+'-impute.json')['output']
    before_audit=read(a.before_dir,a.before_case+'-audit.json')
    request=read(a.after_dir,a.after_case+'-requests.json')['impute']
    result=read(a.after_dir,a.after_case+'-impute.json')['output']
    table=read(a.after_dir,a.after_case+'-impute-independent-full.json')
    graph=read(a.after_dir,a.after_case+'-graph.json')
    inspection=read(a.after_dir,a.after_case+'-source-inspection.json')
    source_after=read(a.after_dir,a.after_case+'-source-after.json')
    old_prepare=read(a.before_dir,'node14-prepare-existing.mjs.json')
    new_prepare=read(a.after_dir,'node14-prepare-existing.mjs.json')
    save_as=json.loads(a.manual_save_as.read_text()) if a.manual_save_as else None
    root=Path(__file__).parent/'fixtures'/'missing-values'
    manifest=read(root,'expected.json')
    template=copy.deepcopy(manifest['cases'][a.expected_case])
    schema=template.pop('schema',manifest['schema'])
    content=(root/(a.fixture+'.csv')).read_bytes()
    old_source=source_evidence(before['import'],read(a.before_dir,a.before_case+'-import.json')['output'],read(a.before_dir,a.before_case+'-upload.json'),schema,content)
    policy={f['field']['name']:{k:v for k,v in f.items() if k!='field'} for f in before['impute']['parameters']['fields']}
    if policy.get('Note',{}).get('method')=='constant':
        index=next(i for i,f in enumerate(schema) if f['name']=='Note')
        for row in template['rows']:
            if row[index]=='MISSING':row[index]=policy['Note']['value']
    node=request['target']['ref']
    source_node=dict(document_id=node['document_id'],workflow_id=node['workflow_id'],node_id=old_source['node']['node_id'])
    source_settings=before['import']['parameters']['settings']['source']
    expected_settings=dict(source_path=source_settings['source_path'],encoding='UTF-8 (65001)',rows_to_skip=str(source_settings['rows_to_skip']),first_line_as_title=source_settings['first_line_as_title'])
    source_verified=(old_source['verified'] is True and inspection['verified'] is True
        and inspection['kind']=='saved_import_inspection' and inspection['node']==source_node
        and inspection['source']==expected_settings
        and before['import']['parameters']['settings']['format']==dict(delimiter=';',decimal_separator='.',null_marker='NULL',text_qualifier='"')
        and inspection['format']==dict(delimiter='Точка с запятой',decimal_separator='Точка (.)',null_marker='NULL',text_qualifier='Двойная кавычка (")')
        and len(inspection['columns'])==len(schema)
        and all(all(f.get(k)==v for k,v in wanted.items()) and f['used'] is True for f,wanted in zip(inspection['columns'],schema))
        and inspection['settings_applied'] is False and inspection['cancelled']['draft_discarded'] is True
        and inspection['cancelled']['settings_applied'] is False)
    source=dict(verified=source_verified,sha256=hashlib.sha256(content).hexdigest(),node=source_node,destination=source_settings['source_path'],execution_id=None,
        integrity_scope='prior_verified_upload',dependency_reexecution=dict(before=inspection['after_cancel'],after=source_after,target_execution_id=result['execution']['execution_id']))
    expected=dict(template,schema=schema,fields=policy,operation_id=request['operation_id'],node=node,
        source_node=source_node,source_path=source_settings['source_path'],source_sha256=before['source_sha256'],source_dependency_reexecution=True,
        previous_execution_ids=[before_result['execution']['execution_id']])
    report=audit_missing_values(expected,result,table,source)
    journal=[json.loads(line) for line in (a.after_dir/'execution-events.jsonl').read_text().splitlines() if line.strip()]
    times=lambda op:[e['recorded_at'] for e in journal if e.get('operation_id')==op and e.get('recorded_at')]
    before_times=times(inspection['diagnostic_operation_id'])
    target_times=times(request['operation_id'])
    after_times=times(source_after['diagnostic_operation_id'])
    same_package=(old_prepare['package_ref']['path']==new_prepare['package_ref']['path'])
    if save_as:
        same_package=(save_as['save_as'] is True and save_as['from']==old_prepare['package_ref']['path']
            and save_as['to']==new_prepare['package_ref']['path'] and save_as['document_id']==old_prepare['document_id']
            and save_as['target_node_id']==node['node_id'] and save_as['source_node_id']==source_node['node_id'])
    checks={
        'before_audited':before_audit['passed'] is True and before_audit['source_verified'] is True and before_audit['graph_verified'] is True,
        'preserve_request':request['parameters']=={} and request['inputs']==[] and request['mappings']==[] and request['finish']=='execute' and request['target']['kind']=='existing',
        'same_native_node':node['node_id']==before_result['node']['node_id'],
        'source_execution_order':bool(before_times and target_times and after_times) and max(before_times)<=min(target_times) and max(target_times)<=min(after_times),
        'fresh_document':node['document_id']==new_prepare['document_id'] and node['document_id']!=old_prepare['document_id'],
        'same_package':same_package and new_prepare['package_ref']['path']==inspection['package_path']==graph['package_path'],
        'rendered_graph':graph['verified'] is True and graph['read_only'] is True and graph['document_id']==node['document_id'] and graph['workflow_id']==node['workflow_id'] and len(graph['links'])==1 and graph['links'][0]['source']['node_id']==source_node['node_id'] and graph['links'][0]['target']['node_id']==node['node_id'],
    }
    report['failures']+=['reopen:'+k for k,v in checks.items() if not v]
    report.update(passed=not report['failures'],persistence_verified=not report['failures'],source_bytes_reverified=False,source_integrity_scope='prior_verified_upload',checks=checks)
    (a.after_dir/(a.after_case+'-reopen-audit.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False))
    raise SystemExit(0 if report['passed'] else 1)


if __name__=='__main__':main()
