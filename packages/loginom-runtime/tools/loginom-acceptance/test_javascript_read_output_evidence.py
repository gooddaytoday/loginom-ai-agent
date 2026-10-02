"""SHA-pinned real late-read native regressions, without browser/model/JS eval.

Historical parent data is a baseline, not proof of its current CLI lifecycle.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest
from javascript_configuration_evidence import javascript_operation
from javascript_read_output_evidence import verify_javascript_read_output,verify_closed_source_read


CHUNK_PRODUCER = r'''
import {pathToFileURL} from 'node:url';
const {createJavascriptSourceReader,prepareJavascriptSourceDelivery}=await import(pathToFileURL(process.argv[1]+'/javascript-source-read.mjs'));
const {createRedactor}=await import(pathToFileURL(process.argv[1]+'/redact.mjs'));
const source='// '+ 'Ж'.repeat(5000)+'\n';
const owner={document_id:'unit-document',workflow_id:'unit-workflow',node_id:'unit-node',operation_id:'unit-read',ui_epoch:1};
const deadline=Date.now()+60000,events=[],redactor=createRedactor();
// Unit adapter seam supplies bytes only; this is no native browser evidence.
const adapter={
  async open(){return {owner};},
  async read(handle){if(handle.owner!==owner)throw Error('Wrong handle');return {owner,source,settings:{}};},
  async discard(handle){if(handle.owner!==owner)throw Error('Wrong handle');return {owner,closed:true};}
};
const reader=createJavascriptSourceReader({owner,deadline,adapter,redactor,record:async event=>{
  events.push({...event,recorded_at:new Date().toISOString()});return structuredClone(event);
}});
let request={owner},delivered='';
do{
  const {receipt}=await reader.read(request);delivered+=receipt.source_text;
  request=receipt.cursor===null?null:{owner,cursor:receipt.cursor,expected_source_sha256:receipt.source_sha256};
}while(request);
if(delivered!==source)throw Error('Incomplete actual source delivery');
const {metadata,chunks}=prepareJavascriptSourceDelivery({source,owner,redactor});
process.stdout.write(JSON.stringify({source,owner,deadline,metadata,events,chunks}));
'''


@unittest.skipUnless(os.environ.get('LOGINOM_JAVASCRIPT_AUDIT_EVIDENCE_ROOT'),'private immutable native captures not supplied')
class JavascriptReadOutputEvidenceTests(unittest.TestCase):
    def cases(self):
        root = Path(os.environ['LOGINOM_JAVASCRIPT_AUDIT_EVIDENCE_ROOT'])
        oracle = json.loads((Path(__file__).resolve().parents[4]/'docs/node-development/nodes/programming-javascript/fixtures/operator-only/expected.json').read_text())
        for name,sha in [('e-source-policy-code-01','39dbd8876b786047963e4883a67d2c3677b2cfaa091dae933c7341edac3bc9e0'),
                ('e-source-policy-declared-01','c08ac6551169fb11d575fddecdcf639692c76b701bf7b0ed3c8daafc545e0db0')]:
            data = (root/name/'execution-events.jsonl').read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(),sha)
            events = [json.loads(l) for l in data.decode('utf-8').splitlines() if l.strip()]
            request = next(r['request'] for r in events if r.get('phase') == 'node_apply_prepared' and r['request']['mode'] == 'read_existing_output')
            sid = request['parameters']['source_operation_id']
            source = next(r['request'] for r in events if r.get('phase') == 'node_apply_prepared' and r['request']['operation_id'] == sid)
            node = next(r['result']['node'] for r in events if r.get('phase') == 'node_checkpoint' and r.get('operation_id') == sid)
            settings = [r for r in events if r.get('phase') == 'javascript_managed_source_settings_observed' and r.get('operation_id') == sid]
            baseline = dict(operation_id=sid,source=source['parameters']['source_text'].encode('utf-8'),node=node,
                settings_sha256=settings[-1]['settings_sha256'],execution_ids=[r['receipt']['value']['execution_id'] for r in events
                    if r.get('operation_id') == sid and r.get('phase') == 'node_phase_completed' and r['receipt']['phase'] in ('execute','materialization_execute')])
            yield name,events,request,baseline,oracle

    def audit(self,case,**pins):
        _,events,request,baseline,oracle = case
        return verify_javascript_read_output(events,request,baseline,oracle['schema'],oracle['ordered_rows'],**pins)

    def rewrite_output(self,case,change):
        _,events,request,_,_ = case
        for row in events:
            if row.get('operation_id') != request['operation_id']:continue
            if row.get('phase') == 'node_checkpoint':change(row['result']['output'])
            if row.get('phase') == 'node_phase_completed' and row['receipt']['phase'] == 'read':change(row['receipt']['value'])
            if row.get('phase') == 'completed':change(row['outcome']['output']['output'])

    def assert_mutation_refused(self,case,original):
        self.assertNotEqual(case,original)
        result = self.audit(case)
        self.assertFalse(result['passed'],result)

    def test_actual_code_declared_source_execution_full_6x4_restore_and_return(self):
        for case in self.cases():
            result = self.audit(case)
            with self.subTest(name=case[0]):self.assertTrue(result['passed'],result)
            self.assertNotIn(result['execution_id'],case[3]['execution_ids'])
            for key in ('parent_lifecycle_verified','journal_authenticated','model_delivery_verified','package_persistence_verified','process_cleanup_verified','cli_acceptance_verified'):
                self.assertIs(result[key],False)

    def test_default_script_operation_stays_strict(self):
        for case in self.cases():
            with self.assertRaisesRegex(ValueError,'javascript_execute_admission'):javascript_operation(case[1],case[2])
            self.assertEqual(tuple(javascript_operation(case[1],case[2],reading=True)['phases']),('source','workflow','target','finish','execute','read'))

    def test_external_product_target_header_projection_and_actual_native_origin(self):
        target = dict(profile_id='pinned-read',loginom_build='7.4.2',platform='linux',browser='chromium')
        origin = 'http://logi-test-plan.bg.local'
        for original in self.cases():
            case = copy.deepcopy(original)
            for row in case[1]:row['target'] = dict(target)
            self.assertFalse(self.audit(case)['passed'])
            proof = self.audit(case,expected_target=target,expected_origin=origin)
            self.assertTrue(proof['passed'],proof)
            self.assertIs(proof['journal_authenticated'],False)
            for pins in [dict(expected_target=target),dict(expected_origin=origin),dict(expected_target=target,expected_origin='http://foreign'),
                    dict(expected_target={**target,'profile_id':'foreign'},expected_origin=origin)]:
                with self.subTest(pins=pins):self.assertFalse(self.audit(case,**pins)['passed'])
            for row in case[1]:
                if row.get('operation_id') == case[2]['operation_id'] and row.get('phase') in ('node_observation_sample','node_observation_completed'):
                    row['outcome']['output']['origin'] = 'http://foreign'
            self.assertFalse(self.audit(case,expected_target=target,expected_origin=origin)['passed'])

    def test_source_or_closed_lifecycle_or_effect_or_deadline_mutations_refuse(self):
        for original in self.cases():
            self.assertTrue(self.audit(original)['passed'],self.audit(original))
            for mutation in ('source','sha','settings','owner','missing_close','cursor','chunk','dispatch_order','admission','deadline'):
                case = copy.deepcopy(original)
                _,events,request,baseline,_ = case
                op = request['operation_id']
                owned = [r for r in events if (r.get('owner') or r.get('receipt',{}).get('owner') or {}).get('operation_id') == op]
                deliveries = [r for r in owned if r.get('phase') == 'source_delivery_verified']
                admissions = [r for r in owned if r.get('phase') == 'javascript_source_admitted']
                if mutation == 'source':baseline['source'] += b'// changed\n'
                if mutation == 'sha':request['parameters']['javascript_source']['source_sha256'] = '0'*64
                if mutation == 'settings':baseline['settings_sha256'] = '0'*64
                if mutation == 'owner':deliveries[0]['owner']['node_id'] = 'foreign'
                if mutation == 'missing_close':next(r for r in owned if r.get('phase') == 'source_discard_settled')['phase'] = 'missing_close'
                if mutation == 'cursor':deliveries[-1]['receipt']['cursor_sha256'] = 'a'*64
                if mutation == 'chunk':deliveries[0]['receipt']['chunk_sha256'] = '0'*64
                if mutation == 'dispatch_order':
                    a = next(i for i,r in enumerate(events) if r in owned and r.get('phase') == 'javascript_source_effect_dispatch')
                    b = next(i for i,r in enumerate(events) if r.get('operation_id') == op and r.get('phase') == 'node_step_prepared' and r.get('action',{}).get('verb') == 'execute_graph_node')
                    events[a],events[b] = events[b],events[a]
                if mutation == 'admission':admissions[1]['receipt']['admission_id'] = admissions[0]['receipt']['admission_id']
                if mutation == 'deadline':deliveries[0]['deadline'] += 1
                with self.subTest(name=case[0],mutation=mutation):self.assert_mutation_refused(case,original)

    def test_coherently_changed_cells_types_null_order_and_counts_refuse(self):
        for original in self.cases():
            self.assertTrue(self.audit(original)['passed'],self.audit(original))
            for mutation in ('value','raw_and_typed','type','null','order','count','precision','schema','sample_complete'):
                case = copy.deepcopy(original)
                _,events,request,_,_ = case
                def change(output):
                    port = output['ports'][0]
                    if mutation in ('value','raw_and_typed'):port['sample'][0][2]['value'] = '1801'
                    if mutation == 'type':port['sample'][0][2]['type'] = 'string'
                    if mutation == 'null':port['sample'][0][2].update(is_null=True,value=None)
                    if mutation == 'order':port['sample'][0],port['sample'][1] = port['sample'][1],port['sample'][0]
                    if mutation == 'count':port['row_count'] += 1
                    if mutation == 'precision':port['sample'][0][2]['precision'] = 'display_text'
                    if mutation == 'schema':port['schema'][2]['type'] = 'string'
                    if mutation == 'sample_complete':port['sample_complete'] = False
                self.rewrite_output(case,change)
                if mutation == 'raw_and_typed':
                    for event in events:
                        if event.get('operation_id') == request['operation_id'] and event.get('phase') in ('node_observation_sample','node_observation_completed'):
                            for row in event.get('outcome',{}).get('output',{}).get('node_table',{}).get('rows',[]):
                                if row.get('index') == 0:
                                    for cell in row['cells']:
                                        if cell['column'] == 2:cell['text'] = '1801'
                with self.subTest(name=case[0],mutation=mutation):self.assert_mutation_refused(case,original)

    def test_restoration_and_owner_bound_workflow_return_require_native_facts(self):
        for original in self.cases():
            self.assertTrue(self.audit(original)['passed'],self.audit(original))
            for mutation in ('restored','mask','table','return','return_owner','missing_return_action','later_mutation'):
                case = copy.deepcopy(original)
                _,events,request,_,_ = case
                def change(output):
                    if mutation == 'restored':output['format_restoration']['restored'] = False
                    if mutation == 'mask':output['format_restoration']['fields'][0]['mask'] = 'unverified'
                    if mutation == 'table':output['format_restoration']['table']['port_guid'] = 'foreign'
                    if mutation == 'return':output['workflow_return']['verified'] = False
                    if mutation == 'return_owner':output['workflow_return']['node_context']['node_id'] = 'foreign'
                self.rewrite_output(case,change)
                if mutation in ('missing_return_action','later_mutation'):
                    steps = [r for r in events if r.get('operation_id') == request['operation_id'] and r.get('phase') == 'node_step_prepared']
                    if mutation == 'missing_return_action':events.remove(steps[-1])
                    if mutation == 'later_mutation':events.append(copy.deepcopy(steps[-1]))
                with self.subTest(name=case[0],mutation=mutation):self.assert_mutation_refused(case,original)

    def test_parent_retained_schema_read_shape_and_phase_inventory_refuse(self):
        for original in self.cases():
            self.assertTrue(self.audit(original)['passed'],self.audit(original))
            for mutation in ('source_id','parent_node','stale','schema','configure','finish','partial','coverage'):
                case = copy.deepcopy(original)
                _,events,request,baseline,_ = case
                if mutation == 'source_id':baseline['operation_id'] = 'foreign'
                if mutation == 'parent_node':baseline['node']['node_id'] = 'foreign'
                if mutation == 'stale':baseline['execution_ids'].append(next(r['result']['execution']['execution_id'] for r in events if r.get('operation_id') == request['operation_id'] and r.get('phase') == 'node_checkpoint'))
                if mutation == 'schema':request['parameters']['schemas'][0]['schema'][0]['name'] = 'foreign'
                if mutation == 'configure':next(r for r in events if r.get('operation_id') == request['operation_id'] and r.get('phase') == 'node_phase_completed')['receipt']['phase'] = 'configure'
                if mutation == 'finish':next(r for r in events if r.get('operation_id') == request['operation_id'] and r.get('phase') == 'node_phase_completed' and r['receipt']['phase'] == 'finish')['receipt']['value']['settings_applied'] = True
                if mutation == 'partial':request['read']['sample_rows'] = 5
                if mutation == 'coverage':request['read']['coverage'] = 'full'
                with self.subTest(name=case[0],mutation=mutation):self.assert_mutation_refused(case,original)


class JavascriptReadOutputBoundaryTests(unittest.TestCase):
    def test_actual_runtime_multichunk_utf8_closed_reader_framing(self):
        node = os.environ.get('LOGINOM_NODE') or shutil.which('node')
        if not node:self.skipTest('Node runtime unavailable')
        result = subprocess.run([node,'--input-type=module','-e',CHUNK_PRODUCER,str(Path(__file__).resolve().parents[2]/'client/lib')],
            capture_output=True,text=True,check=True,timeout=20)
        actual = json.loads(result.stdout)
        self.assertGreater(len(actual['chunks']),1)
        rows = list(enumerate(actual['events']))
        source = actual['source'].encode('utf-8')
        self.assertEqual(verify_closed_source_read(rows,source,actual['metadata'],actual['owner'],actual['deadline']),(0,len(rows)-1))
        for mutation in ('missing_second_close','duplicate_step','changed_offset','changed_chunk','out_of_order','cursor','owner','deadline'):
            changed = copy.deepcopy(rows)
            second = next(r for i,r in changed if r['phase'] == 'source_delivery_verified' and r['step'] == 2)
            if mutation == 'missing_second_close':changed = [(i,r) for i,r in changed if not (r['phase'] == 'source_discard_settled' and r['step'] == 2)]
            if mutation == 'duplicate_step':second['step'] = 1
            if mutation == 'changed_offset':second['receipt']['offset_utf8_bytes'] += 1
            if mutation == 'changed_chunk':second['receipt']['chunk_sha256'] = '0'*64
            if mutation == 'out_of_order':
                last = next(i for i,r in changed if r['phase'] == 'source_discard_settled' and r['step'] == 2)
                changed = [(last+2 if i == last else i,r) for i,r in changed]
            if mutation == 'cursor':second['receipt']['cursor_sha256'] = None
            if mutation == 'owner':second['owner']['node_id'] = 'foreign'
            if mutation == 'deadline':second['deadline'] += 1
            self.assertNotEqual(changed,rows)
            with self.subTest(mutation=mutation),self.assertRaises((ValueError,UnicodeError)):
                verify_closed_source_read(changed,source,actual['metadata'],actual['owner'],actual['deadline'])

    def test_missing_evidence_and_unverified_inputs_cannot_promote_cli(self):
        proof = verify_javascript_read_output([],{}, {},[],[])
        self.assertFalse(proof['passed'])
        self.assertIs(proof['cli_acceptance_verified'],False)


if __name__ == '__main__':unittest.main()
