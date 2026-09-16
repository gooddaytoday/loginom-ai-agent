"""Full P3 diagnostic: transfer proof is reusable; domain admission is fail-closed.

The full goal runs now so real UI failures guide implementation. Until an
independent typed settings/execution/result/reopen verifier exists, this module
cannot admit P3, even if every gesture or the model's final answer says success.
"""
from pathlib import Path
import upload_probe
import upload_verify
import json
import csv
import hashlib
import io
import rendered_results
import settings_evidence
import import_settings_evidence
import import_roundtrip_evidence
import calculator_evidence
import node_procedure_evidence

FIXTURES = tuple('fixtures/data-pipeline/'+name for name in ('sales.csv','expected.json','task.txt'))
DOMAIN_GATES = ('wizard_settings_readback', 'calculator_expression_and_mappings',
                'group_keys_and_aggregations', 'fresh_execution_identity',
                'complete_typed_results', 'saved_reopened_settings', 'reexecution_results')


def prompt(template, package, directory, run_id):
    task=Path(__file__).with_name('fixtures').joinpath('data-pipeline/task.txt').read_text()
    return upload_probe.prompt(template,package,directory,run_id).replace('__PIPELINE_TASK__',task.strip())


def declared_source_path(request):
    """Resolve only the fixture declared before execution, never a model path."""
    try:
        descriptor = upload_probe.descriptor(request['run_id'], request['storage_directory'])
        if (request.get('input_artifact') != descriptor
                or request.get('harness_inputs', {}).get(upload_probe.FIXTURE) != upload_probe.FIXTURE_SHA):
            return None
        return descriptor['upload']['directory'] + '/' + descriptor['name']
    except (KeyError, TypeError, ValueError, AttributeError):
        return None


def fixture_schema(request, expected):
    """The schema is declared; CSV independently supplies ordered unique names."""
    try:
        directory=Path(__file__).with_name('fixtures')/'data-pipeline'
        raw=(directory/'sales.csv').read_bytes(); expected_bytes=(directory/'expected.json').read_bytes()
        digest=lambda value:hashlib.sha256(value).hexdigest()
        if (not declared_source_path(request) or expected!=json.loads(expected_bytes)
            or request['harness_inputs'].get('fixtures/data-pipeline/expected.json')!=digest(expected_bytes)
            or digest(raw)!=upload_probe.FIXTURE_SHA or digest(raw)!=expected['input']['sha256']
            or len(raw)!=expected['input']['bytes']):return False
        inp=expected['input']
        if inp['encoding']!='UTF-8' or inp['header'] is not True or inp.get('rows_to_skip',0)!=0:return False
        rows=list(csv.reader(io.StringIO(raw.decode('utf-8'),newline=''),delimiter=inp['delimiter'],quotechar=inp['quote'],strict=True))
        names=[field['name'] for field in expected['schema']]
        return bool(names) and len(set(names))==len(names) and all(isinstance(n,str) and n for n in names) and rows[0]==names and all(len(row)==len(names) for row in rows[1:])
    except (KeyError,TypeError,ValueError,AttributeError,IndexError,UnicodeError,csv.Error):return False


def wizard_readback(evidence, request, prefix, expected, diagnostics, transfer_verified):
    result={'wizard_settings_readback':False,'source_identity_verified':False,'package_persistence_verified':False}
    if not transfer_verified or not fixture_schema(request,expected):return {**result,'reason':'transfer_or_pinned_fixture_missing'}
    try:
        calls=evidence['calls'];tools=evidence['tools']
        def unique_reply(call):
            key=(call['session_id'],call['tool_call_id'])
            peers=[c for c in calls if (c.get('session_id'),c.get('tool_call_id'))==key]
            replies=[t for t in tools if (t.get('session_id'),t.get('tool_call_id'))==key]
            if len(peers)!=1 or len(replies)!=1:return None
            reply=replies[0]
            return reply if reply['tool']==call['tool'] and call['row']<reply['row'] else None
        uploads=[c for c in calls if c['tool']==prefix+'dock_artifact_upload']
        verifies=[c for c in calls if c['tool']==prefix+'dock_artifact_verify']
        if len(uploads)!=1 or len(verifies)!=1:return {**result,'reason':'transfer_not_unique'}
        upload,verify=uploads[0],verifies[0];session=upload['session_id']
        ur,vr=unique_reply(upload),unique_reply(verify)
        if not ur or not vr or verify['session_id']!=session or ur['row']>=verify['row']:return {**result,'reason':'transfer_session_or_order'}
        destination=declared_source_path(request)
        if vr['result']['output']['destination']!=destination:return {**result,'reason':'transfer_destination'}
        receipts=settings_evidence.bound_receipts(evidence,prefix)
        file_reads=[r for r in receipts if r['call']['session_id']==session and r['reply_row']<verify['row']
            and r['delivered']['output'].get('observation_id')==verify['arguments']['observation_id']
            and any(e.get('ref')==verify['arguments']['file_ref'] for e in r['delivered']['output'].get('ui',{}).get('elements',[]))]
        if len(file_reads)!=1:return {**result,'reason':'file_observation_not_bound'}
        file_state=file_reads[0]['outcome']['output']
        if file_state.get('authenticated') is not True:return {**result,'reason':'file_observation_unauthenticated'}
        for proof in diagnostics['roundtrips']:
            if proof.get('session_id')!=session or not all(proof.get(k) is True for k in ('rendered_import_settings_roundtrip_match','configured_schema_roundtrip_match','configured_mapping_roundtrip_match')):continue
            starts=[r for r in receipts if r['call']['session_id']==session and r['outcome']['operation_id']==proof['operations'][0]]
            if len(starts)!=1:continue
            start=starts[0];state=start['outcome']['output']
            if not import_settings_evidence.source_compare(state,expected,destination)['rendered_import_source_match']:continue
            if any(not file_state.get(k) or file_state[k]!=state.get(k) for k in ('origin','loginom_build')):continue
            document=file_state.get('dom_epoch',{}).get('document')
            if not document or document!=state.get('dom_epoch',{}).get('document'):continue
            inspections=[]
            for call in calls:
                if call['tool']!=prefix+'dock_operation_inspect' or call['session_id']!=session or call.get('arguments',{}).get('operation_id')!=upload['arguments']['operation_id']:continue
                reply=unique_reply(call)
                if not reply or not vr['row']<call['row']<reply['row']<start['call']['row']:continue
                inspected=reply['result']
                if inspected.get('status')!='SUCCEEDED' or inspected.get('action_key')!='operation.inspect':continue
                out=inspected.get('output',{})
                completed=[e for e in evidence['events'] if e.get('phase')=='transfer_completed' and e.get('operation_id')==upload['arguments']['operation_id']]
                if (len(completed)==1 and out.get('state')=='resolved' and out.get('operation_id')==upload['arguments']['operation_id']
                    and out.get('outcome')==completed[0].get('outcome')):inspections.append(reply)
            if not inspections:continue
            return {**result,'wizard_settings_readback':True,'reason':'verified_fixture_import_settings_reopened',
                    'session_id':session,'source_read_row':start['call']['row'],'source_document':document,
                    'destination':destination,'operations':proof['operations']}
        return {**result,'reason':'bound_configured_roundtrip_missing'}
    except (KeyError,TypeError,ValueError,AttributeError,IndexError):return {**result,'reason':'malformed_binding'}


def audit(evidence, checks, request, prefix, mutations, storage_audit, rejected_before_browser):
    def check(name,value):checks.append({'name':name,'passed':bool(value)})
    calls,tools=evidence['calls'],evidence['tools']
    rejected=[]
    for call in calls:
        if call['tool'] in (prefix+'dock_artifact_upload',prefix+'dock_artifact_verify') and rejected_before_browser(call,evidence):
            rejected.append((call['session_id'],call['tool_call_id']))
    # Only proven pre-dispatch refusals are removed from the transfer attempt
    # count. Failed browser effects and ambiguous replies remain in the audit.
    evidence={**evidence,'calls':[c for c in calls if (c['session_id'],c['tool_call_id']) not in rejected],
              'tools':[t for t in tools if (t['session_id'],t['tool_call_id']) not in rejected]}
    calls,tools=evidence['calls'],evidence['tools']
    verifies=[c for c in calls if c['tool']==prefix+'dock_artifact_verify']
    uploads=[c for c in calls if c['tool']==prefix+'dock_artifact_upload']
    check('pipeline_exactly_one_upload_and_verify',len(uploads)==len(verifies)==1)
    transfer_passed=False
    if len(verifies)==len(uploads)==1:
        verify=verifies[0]
        later_mutations=[c['row'] for c in calls if c['tool'] in mutations and c['row']>verify['row']]
        boundary=min(later_mutations) if later_mutations else float('inf')
        inspections=[t for t in tools if verify['row']<t['row']<boundary
                     and t['tool']==prefix+'dock_operation_inspect'
                     and t.get('result',{}).get('output',{}).get('operation_id')==uploads[0].get('arguments',{}).get('operation_id')]
        check('transfer_inspected_before_pipeline_mutation',bool(inspections))
        if inspections:
            cutoff=inspections[0]['row']
            part={**evidence,'calls':[c for c in calls if c['row']<=cutoff],
                  'tools':[t for t in tools if t['row']<=cutoff]}
            transfer_checks=[]
            proof=upload_verify.audit(part,transfer_checks,request,prefix,mutations,storage_audit)
            transfer_passed=proof['all_assertions_passed']
            checks.extend({**c,'name':'transfer_'+c['name']} for c in transfer_checks)
    # Each implemented settings gate independently rebinds its receipts.
    # Remaining domain gates stay closed regardless of model summaries.
    expected=json.loads(Path(__file__).with_name('fixtures').joinpath('data-pipeline/expected.json').read_text())
    if request.get('goal_id') == 'node-import-roundtrip':
        check('node_import_pinned_fixture', fixture_schema(request, expected))
        proof = node_procedure_evidence.audit_bound_operation(evidence, request, expected,
            declared_source_path(request), prefix, transfer_passed)
        check('node_import_internal_roundtrip', proof['passed'])
        return {'all_assertions_passed': all(c['passed'] for c in checks), 'assertions': checks,
                'goal': 'node-import-roundtrip', 'node_import_diagnostics': proof,
                'acceptance_status': 'bounded_import_only',
                'limitations': ['This goal does not accept P3, package persistence, execution or Calculator.']}
    roundtrips=import_roundtrip_evidence.diagnose(evidence,expected,prefix,expected_source_path=declared_source_path(request))
    wizard=wizard_readback(evidence,request,prefix,expected,roundtrips,transfer_passed)
    check('wizard_settings_readback',wizard['wizard_settings_readback'])
    calculator=calculator_evidence.audit_gate(evidence,request,prefix,expected,transfer_verified=transfer_passed)
    check('calculator_expression_and_mappings',calculator['calculator_expression_and_mappings'])
    for gate in DOMAIN_GATES[2:]:check('unimplemented_verifier_'+gate,False)
    return {'all_assertions_passed':False,'assertions':checks,'goal':request.get('goal_id','data-pipeline'),
            'acceptance_status':'diagnostic_only_domain_verifiers_incomplete',
            'rendered_result_diagnostics':rendered_results.diagnose(evidence,json.loads(Path(__file__).with_name('fixtures').joinpath('data-pipeline/expected.json').read_text()),prefix),
            'import_settings_diagnostics':import_settings_evidence.diagnose(evidence,json.loads(Path(__file__).with_name('fixtures').joinpath('data-pipeline/expected.json').read_text()),prefix,expected_source_path=declared_source_path(request)),
            'import_roundtrip_diagnostics':roundtrips,'wizard_settings_readback_diagnostics':wizard,
            'settings_roundtrip_diagnostics':settings_evidence.diagnose(evidence,json.loads(Path(__file__).with_name('fixtures').joinpath('data-pipeline/expected.json').read_text())['calculator'],prefix),
            'calculator_settings_diagnostics':calculator,
            'transfer_verified':transfer_passed,'pre_action_rejections':len(rejected),'missing_domain_verifiers':list(DOMAIN_GATES[2:]),
            'limitations':['Import and Calculator settings have independent verifiers; five domain verifiers remain unimplemented. No P3 acceptance claim is possible.']}
