"""Unit boundaries plus opt-in regression over immutable operator native captures.

Set LOGINOM_JAVASCRIPT_AUDIT_EVIDENCE_ROOT to the private campaign directory.
No browser, secrets, golden JavaScript or raw native logs are kept in this test.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import unittest
from javascript_configuration_evidence import verify_javascript_configuration
from javascript_output_evidence import verify_javascript_output
from node_procedure_evidence import bound_output_settlement, digest


class OutputSettlementTests(unittest.TestCase):
    def setUp(self):
        owner = dict(verified=True,document_id='doc',workflow_id='flow',node_id='node')
        before = dict(prepared_node_context=owner, workflow_ref=dict(prefix='MF;TF-1'),
            node_outputs=dict(tables=[]),ui=dict(elements=[dict(ref='add',viewer_card=dict(kind='add',port_guid='port'))]))
        state = dict(prepared_node_context={**owner,'surface':'views'},scan=dict(complete=True),
            ui=dict(dialogs=[],masks=[],elements=[dict(ref='enter',viewer_card=dict(kind='enter',port_guid='port',view_guid='view'))]),
            node_outputs=dict(verified=True,surface='views',node_context=owner,
                port_panels=[dict(port_guid='port')],tables=[dict(port_guid='port',view_guid='view')]))
        readiness = dict(condition='new Table card bound to output',required_samples=2,
            deadline=100000,timeout_ms=60000,settle_output_port='port',elapsed_ms=20000)
        self.row = dict(step=3,readiness=readiness)
        self.samples = [dict(readiness=copy.deepcopy(readiness),outcome=dict(output=copy.deepcopy(state))) for _ in range(2)]
        self.rows = [dict(phase='node_apply_prepared',deadline_at=100000,request=dict(budgets=dict(total_ms=90000))),
            dict(phase='node_phase_prepared',receipt=dict(phase='read',deadline=100000)),self.row]
        self.observations = [(1,before)]
        self.mutations = [(2,dict(verb='click',ref='add'),dict(status='SUCCEEDED',cleanup_complete=True))]

    def audit(self):
        return bound_output_settlement(self.rows,self.row,self.samples,self.observations,self.mutations)

    def test_acknowledged_add_with_same_owner_and_original_deadline(self):
        self.assertTrue(self.audit())
        self.rows[1]['receipt']['deadline'] = 90000
        self.row['readiness']['deadline'] = 90000
        for sample in self.samples:
            sample['readiness']['deadline'] = 90000
        self.assertTrue(self.audit())

    def test_foreign_or_unsettled_samples_refuse(self):
        original = copy.deepcopy(self.samples)
        changes = [lambda s:s['prepared_node_context'].update(node_id='foreign'),
            lambda s:s['node_outputs']['node_context'].update(workflow_id='foreign'),
            lambda s:s['node_outputs']['port_panels'].clear(),
            lambda s:s['ui']['elements'][0]['viewer_card'].update(view_guid='foreign'),
            lambda s:s['node_outputs']['tables'].append(dict(view_guid='second',port_guid='port')),
            lambda s:s['ui']['masks'].append(dict(kind='busy',target_tid='foreign')),
            lambda s:s['ui']['dialogs'].append(dict(ref='foreign')),
            lambda s:s['scan'].update(complete=False),
            lambda s:s['node_outputs'].update(verified=False,reason='table_card_pending')]
        for change in changes:
            with self.subTest(change=changes.index(change)):
                self.samples = copy.deepcopy(original)
                change(self.samples[-1]['outcome']['output'])
                self.assertFalse(self.audit())

    def test_deadline_phase_and_add_refuse(self):
        for case in ('extension','timeout','elapsed','phase','ack','verb','port','prior_view'):
            self.setUp()
            if case == 'extension':self.rows[0]['deadline_at'] = 99999
            if case == 'timeout':self.row['readiness']['timeout_ms'] = 90001
            if case == 'elapsed':self.samples[-1]['readiness']['elapsed_ms'] = 60000
            if case == 'phase':self.rows[1]['receipt']['phase'] = 'configure'
            if case == 'ack':self.mutations[0][2]['status'] = 'AMBIGUOUS'
            if case == 'verb':self.mutations[0][1]['verb'] = 'execute_graph_node'
            if case == 'port':self.observations[0][1]['ui']['elements'][0]['viewer_card']['port_guid'] = 'foreign'
            if case == 'prior_view':self.observations[0][1]['node_outputs']['tables'] = [dict(view_guid='view')]
            with self.subTest(case=case):self.assertFalse(self.audit())


class JavascriptEvidenceBoundaryTests(unittest.TestCase):
    def test_configuration_never_promotes_missing_native_journal(self):
        proof = verify_javascript_configuration([],{},b'// authored',[],[])
        self.assertFalse(proof['passed'])
        for key in ('journal_authenticated','model_authorship_verified','package_persistence_verified'):
            self.assertIs(proof[key],False)

    def test_output_rejects_unsupported_types_boolean_integer_and_partial_read(self):
        columns = [dict(name='Value',type='integer')]
        request = dict(read=dict(coverage='full',ports=[0],require_exact_numbers=True,sample_rows=1))
        for schema,rows,query in [(columns,[[True]],request),([dict(name='Value',type='real')],[[1.25]],request),
                (columns,[[2**63]],request),(columns,[[1]],{**request,'read':{**request['read'],'coverage':'sample'}})]:
            with self.subTest(schema=schema,rows=rows):
                self.assertFalse(verify_javascript_output([],query,schema,rows)['passed'])


@unittest.skipUnless(os.environ.get('LOGINOM_JAVASCRIPT_AUDIT_EVIDENCE_ROOT'), 'private native regression captures not supplied')
class JavascriptNativeRegressionTests(unittest.TestCase):
    def cases(self):
        root = Path(os.environ['LOGINOM_JAVASCRIPT_AUDIT_EVIDENCE_ROOT'])
        oracle = json.loads((Path(__file__).resolve().parents[4]/'docs/node-development/nodes/programming-javascript/fixtures/operator-only/expected.json').read_text())
        inputs = [dict(name=n,type=t) for n,t in [('RowID','integer'),('Customer','string'),('Qty','integer'),('UnitPriceCents','integer'),('DiscountPct','integer')]]
        for name,key in [('e-new-done-code-01','public_code'),('e-new-done-declared-01','public_declared')]:
            report = json.loads((root/name/'report.json').read_text())
            events = [json.loads(line) for line in (root/name/'execution-events.jsonl').read_text().splitlines()]
            operation = report[key]['operation_id']
            request = next(r['request'] for r in events if r.get('operation_id') == operation and r.get('phase') == 'node_apply_prepared')
            authored = next(r['request']['parameters']['source_text'] for r in events
                if r.get('operation_id') == report['public_new_done']['operation_id'] and r.get('phase') == 'node_apply_prepared').encode('utf-8')
            yield name,events,request,authored,inputs,oracle

    def test_immutable_code_and_declared_native_proofs(self):
        for name,events,request,source,inputs,oracle in self.cases():
            with self.subTest(case=name):
                config = verify_javascript_configuration(events,request,source,inputs,oracle['schema'])
                output = verify_javascript_output(events,request,oracle['schema'],oracle['ordered_rows'])
                self.assertTrue(config['passed'],config)
                self.assertTrue(output['passed'],output)
                self.assertNotEqual(output['execution_id'],output['materialization_execution_id'])

    def test_configuration_mutations_are_nonnoop_and_refused(self):
        for name,original,request,source,inputs,oracle in self.cases():
            for case in ('owner','source_digest','source_chunk','source_cursor','source_close','settings','settings_digest','coherent_settings','mapping','phase','admission','session'):
                events = copy.deepcopy(original)
                rows = [r for r in events if r.get('operation_id') == request['operation_id']]
                phase = lambda n:next(r['receipt']['value'] for r in rows if r.get('phase') == 'node_phase_completed' and r['receipt']['phase'] == n)
                if case == 'owner':next(r for r in rows if r.get('phase') == 'node_checkpoint')['result']['node']['node_id'] = 'foreign'
                if case.startswith('source_'):
                    committed = next(r for r in rows if r.get('phase') == 'node_phase_completed' and r['receipt']['phase'] == 'node_finish')
                    after_commit = events[events.index(committed)+1:]
                    delivery = next(r for r in after_commit if r.get('phase') == 'source_delivery_verified' and r.get('owner',{}).get('operation_id') == request['operation_id'])
                    if case == 'source_digest':delivery['receipt']['source_sha256'] = '0'*64
                    if case == 'source_chunk':delivery['receipt']['chunk_sha256'] = '0'*64
                    if case == 'source_cursor':delivery['receipt']['cursor_sha256'] = '0'*64
                    if case == 'source_close':next(r for r in after_commit if r.get('phase') == 'source_discard_settled' and r.get('owner') == delivery['owner'])['phase'] = 'missing_discard'
                if case in ('settings','settings_digest'):
                    r = next(r for r in rows if r.get('phase') == 'javascript_managed_source_settings_observed')
                    if case == 'settings':r['settings']['generation'] = not r['settings']['generation']
                    if case == 'settings_digest':r['settings_sha256'] = '0'*64
                if case == 'coherent_settings':
                    r = next(r for r in rows if r.get('phase') == 'javascript_managed_source_settings_observed')
                    r['settings']['generation'] = not r['settings']['generation']
                    r['settings_sha256'] = hashlib.sha256(json.dumps(r['settings'],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
                if case == 'mapping':phase('output_mapping')['native_mapping']['target_fields'][0]['source']['record_id'] = 'foreign'
                if case == 'phase':next(r for r in rows if r.get('phase') == 'node_phase_prepared')['receipt']['phase'] = 'foreign'
                if case == 'admission':next(r for r in rows if r.get('phase') == 'node_apply_prepared')['request']['parameters']['schema_mode'] = 'mixed'
                if case == 'session':next(r for r in rows if r.get('phase') == 'node_phase_completed')['session_id'] = 'foreign'
                with self.subTest(case=name,mutation=case):
                    self.assertNotEqual(events,original)
                    self.assertFalse(verify_javascript_configuration(events,request,source,inputs,oracle['schema'])['passed'])

    def test_output_mutations_are_nonnoop_and_refused(self):
        for name,original,request,source,inputs,oracle in self.cases():
            for case in ('value','null','type','precision','row','schema','stale_execution','raw_cell','coherent_raw_cell','launch','settlement','cleanup'):
                events = copy.deepcopy(original)
                rows = [r for r in events if r.get('operation_id') == request['operation_id']]
                checkpoint = next(r['result'] for r in rows if r.get('phase') == 'node_checkpoint')
                port = checkpoint['output']['ports'][0]
                if case == 'value':port['sample'][0][2]['value'] = '1801'
                if case == 'null':port['sample'][0][2]['is_null'] = True
                if case == 'type':port['sample'][0][2]['type'] = 'string'
                if case == 'precision':port['sample'][0][2]['precision'] = 'approximate'
                if case == 'row':port['sample'].pop()
                if case == 'schema':port['schema'][0]['name'] = 'foreign'
                if case == 'stale_execution':checkpoint['execution']['execution_id'] = 'stale'
                if case == 'raw_cell':
                    r = next(r for r in rows if r.get('phase') == 'node_observation_completed' and r.get('outcome',{}).get('output',{}).get('node_table',{}).get('rows'))
                    r['outcome']['output']['node_table']['rows'][0]['cells'][0]['text'] = '999'
                if case == 'coherent_raw_cell':
                    for r in rows:
                        table = r.get('outcome',{}).get('output',{}).get('node_table',{})
                        for row in table.get('rows',[]):
                            for cell in row.get('cells',[]):
                                if row.get('index') == 0 and cell.get('column') == 0:
                                    cell['text'] = '999'
                    current = None
                    for r in rows:
                        if r.get('phase') == 'node_observation_completed':current = r['outcome']['output']
                        if r.get('phase') == 'node_step_prepared' and current:
                            r['observation_sha256'] = digest(current)
                            r['signature'] = digest([r['internal_operation_id'],r['action'],current])
                if case == 'cleanup':checkpoint['cleanup_complete'] = False
                if case == 'launch':next(r for r in rows if r.get('phase') == 'node_step_prepared' and r.get('action',{}).get('verb') == 'execute_graph_node')['action']['ref'] = 'foreign'
                if case == 'settlement':next(r for r in rows if r.get('phase') == 'node_observation_completed' and r.get('readiness',{}).get('settle_output_port'))['readiness']['deadline'] += 1
                with self.subTest(case=name,mutation=case):
                    self.assertNotEqual(events,original)
                    proof = verify_javascript_output(events,request,oracle['schema'],oracle['ordered_rows'])
                    self.assertFalse(proof['passed'])
                    if case == 'coherent_raw_cell':
                        self.assertTrue(any(f.startswith('source_output_value_0_0') for f in proof['failures']),proof)


if __name__ == '__main__':
    unittest.main()
