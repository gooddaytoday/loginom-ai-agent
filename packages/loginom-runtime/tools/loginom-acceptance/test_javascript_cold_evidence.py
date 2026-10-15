"""Opt-in immutable native cold regression; no browser/model or supplied JS eval.

Writer snapshots here are historical baseline data, not new standalone writer
admission proof. All twelve input files are pinned and read without modification.
"""
import copy
import hashlib
import json
import os
from datetime import datetime,timezone
from pathlib import Path
import unittest
from javascript_cli_evidence import value_digest
from javascript_cold_evidence import verify_javascript_cold,settings_for_writer
from node_procedure_evidence import verify_internal_sequence


CAPTURE_SHA256 = {
    'c-public-code-save-01/report.json':'2024b78cff2555cf6401367e3d0161d06d049dc6861b7e7f61ca2cf34b1c5941',
    'c-public-code-save-01/execution-events.jsonl':'23540874ab56ec6d95fc674d3568ef701fecb520788a09f502d500b17a43ca74',
    'c-public-code-cold-01/report.json':'5024dab869ac3cda3ea9b7aaa35c60a0a834f0e467489d3f3d6d256fbbee98d7',
    'c-public-code-cold-01/execution-events.jsonl':'6ab92b415b91b3e18a94c8ae2a4020b4d4ea46b99abf29cc985a909bcd296b98',
    'd-public-declared-save-05/report.json':'bf713a365daa368f1349c0cae0cf8808e6720f58e45842b02266ad0d6aeea0ae',
    'd-public-declared-save-05/execution-events.jsonl':'954faeb75bf7b410041fc2c79d587b9300aec027c861092752f04baa0ae73187',
    'd-public-declared-cold-01/report.json':'72d054b400a30d6e1ad2de9abbb2f415f42d21f4faffa0a9782194c56b1934ab',
    'd-public-declared-cold-01/execution-events.jsonl':'78ab131d7330b9a8bc2b09ac0f5399a437b7d0c3db7d8f4f0166d7352f465cd0',
    'e-long-source-writer-01/report.json':'09c72dd5e79b68be974014a67e0840821b2af998ecb93f144adfd6cfd0e33ddc',
    'e-long-source-writer-01/execution-events.jsonl':'5bb07639d934871fead5e441132f14a8091ff80c3ceee52e3493f4c397ac2b3d',
    'e-long-source-cold-02/report.json':'c1067ee8ebbc9b7a2ecb2ef969f54641ea4be2a3f6ee4c1ffa799c6bb1d97434',
    'e-long-source-cold-02/execution-events.jsonl':'2bc340ece45bea2b644282e18cf1f1128192b590a322d7583720c6f70bf26ecd',
}


@unittest.skipUnless(os.environ.get('LOGINOM_JAVASCRIPT_AUDIT_EVIDENCE_ROOT'),'private immutable native captures not supplied')
class JavascriptColdEvidenceTests(unittest.TestCase):
    def cases(self):
        root = Path(os.environ['LOGINOM_JAVASCRIPT_AUDIT_EVIDENCE_ROOT'])
        oracle = json.loads((Path(__file__).resolve().parents[4]/'docs/node-development/nodes/programming-javascript/fixtures/operator-only/expected.json').read_text())
        for writer_name,key,cold_name in [('c-public-code-save-01','public_code','c-public-code-cold-01'),
                ('d-public-declared-save-05','public_declared','d-public-declared-cold-01'),
                ('e-long-source-writer-01','public_code','e-long-source-cold-02')]:
            captures = {}
            for name in (writer_name,cold_name):
                for file in ('report.json','execution-events.jsonl'):
                    relative = name+'/'+file
                    data = (root/relative).read_bytes()
                    self.assertEqual(hashlib.sha256(data).hexdigest(),CAPTURE_SHA256[relative],relative)
                    captures[relative] = data.decode('utf-8')
            report = json.loads(captures[writer_name+'/report.json'])
            writer_events = [json.loads(line) for line in captures[writer_name+'/execution-events.jsonl'].splitlines() if line.strip()]
            cold = json.loads(captures[cold_name+'/report.json'])
            events = [json.loads(line) for line in captures[cold_name+'/execution-events.jsonl'].splitlines() if line.strip()]
            operation = report[key]['operation_id']
            request = next(r['request'] for r in writer_events if r.get('phase') == 'node_apply_prepared' and r.get('operation_id') == operation)
            checkpoint = next(r['result'] for r in writer_events if r.get('phase') == 'node_checkpoint' and r.get('operation_id') == operation)
            phases = {r['receipt']['phase']:r['receipt']['value'] for r in writer_events if r.get('phase') == 'node_phase_completed' and r.get('operation_id') == operation}
            settings_rows = [r for r in writer_events if r.get('phase') == 'javascript_managed_source_settings_observed' and r.get('owner',{}).get('node_id') == checkpoint['node']['node_id']]
            admitted = [r['receipt'] for r in writer_events if r.get('phase') == 'javascript_source_admitted' and r.get('receipt',{}).get('owner',{}).get('node_id') == checkpoint['node']['node_id']]
            writer = dict(source=request['parameters']['source_text'].encode('utf-8'),node=checkpoint['node'],schema_mode=request['parameters']['schema_mode'],
                package_path=report[key]['save']['path'],graph=report[key]['save']['graph'],prefix=request['workflow_ref']['prefix'],
                settings_sha256=settings_rows[-1]['settings_sha256'] if settings_rows else admitted[-1]['settings_sha256'],
                mappings={direction:phases[direction+'_mapping']['native_mapping'] for direction in ('input','output')},
                execution_ids=sorted({v['execution_id'] for v in phases.values() if v.get('execution_id')}),finished_at=report['finished_at'])
            expected = dict(account='jsteach',package_path=writer['package_path'],preparation_session_id='javascript-cold',
                preparation_target=dict(profile_id='javascript-ubuntu',loginom_build='7.4.2',platform='linux',browser='chromium'),
                journal=dict(session_id='javascript-g2',runtime_revision='operator-source',target=dict(origin='http://logi-test-plan.bg.local/',loginom_build='7.4.2')))
            yield cold_name,cold,events,writer,expected,oracle

    def audit(self,case):
        _,report,events,writer,expected,oracle = case
        return verify_javascript_cold(report,events,writer,expected,oracle['schema'],oracle['ordered_rows'])

    def test_actual_code_and_declared_cold_source_state_execute_and_full_table(self):
        for case in self.cases():
            with self.subTest(case=case[0]):
                proof = self.audit(case)
                self.assertTrue(proof['passed'],proof)
                self.assertNotIn(proof['execution_id'],case[3]['execution_ids'])
                for key in ('writer_lifecycle_verified','journal_authenticated','launch_arguments_verified','source_freeze_verified','process_termination_verified','cli_acceptance_verified'):
                    self.assertIs(proof[key],False)

    def test_actual_native_32kib_1024_lf_source_requires_each_fragment_closed(self):
        original = next(c for c in self.cases() if c[0] == 'e-long-source-cold-02')
        self.assertEqual(len(original[3]['source']),32768)
        self.assertEqual(original[3]['source'].count(b'\n')+1,1024)
        self.assertTrue(self.audit(original)['passed'],self.audit(original))
        deliveries = [r for r in original[2] if r.get('phase') == 'source_delivery_verified']
        self.assertEqual(len(deliveries),24)
        self.assertEqual({r['read_id'] for r in deliveries},{1,2,3})
        for mutation in ('missing_second_close','duplicate_step','second_cursor','second_chunk','second_offset','owner','foreign_admission','group_order'):
            case = copy.deepcopy(original)
            events = case[2]
            second = next(r for r in events if r.get('phase') == 'source_delivery_verified' and r['read_id'] == 1 and r['step'] == 2)
            if mutation == 'missing_second_close':events.remove(next(r for r in events if r.get('phase') == 'source_discard_settled' and r['read_id'] == 1 and r['step'] == 2))
            if mutation == 'duplicate_step':second['step'] = 1
            if mutation == 'second_cursor':second['receipt']['cursor_sha256'] = None
            if mutation == 'second_chunk':second['receipt']['chunk_sha256'] = '0'*64
            if mutation == 'second_offset':second['receipt']['offset_utf8_bytes'] += 1
            if mutation == 'owner':second['owner']['node_id'] = 'foreign'
            if mutation == 'foreign_admission':second['admission_id'] = 'foreign'
            if mutation == 'group_order':second['read_id'] = 2
            with self.subTest(mutation=mutation):
                self.assertNotEqual(case,original)
                self.assertFalse(self.audit(case)['passed'],self.audit(case))

    def test_original_table_sequence_strict_default_and_explicit_cold_ceiling(self):
        for case in self.cases():
            name,report,events,_,_,_ = case
            table_ops = {r['operation_id'] for r in events if r.get('phase') == 'node_observation_completed' and r.get('outcome',{}).get('output',{}).get('node_table',{}).get('rows')}
            self.assertEqual(len(table_ops),1)
            op = next(iter(table_ops))
            strict = verify_internal_sequence(events,op,max_steps=4096)
            ceiling = dict(operation_id=op,node=report['cold']['node'],deadline_at=report['original_deadline'],total_ms=600000)
            self.assertFalse(strict['passed'],strict)
            cold = verify_internal_sequence(events,op,max_steps=4096,cold_read_ceiling=ceiling)
            with self.subTest(case=name):self.assertTrue(cold['passed'],cold)
            for changed in (dict(ceiling,operation_id='foreign'),dict(ceiling,node={**ceiling['node'],'node_id':'foreign'}),dict(ceiling,deadline_at=1),dict(ceiling,total_ms=1)):
                with self.subTest(case=name,change=changed):self.assertFalse(verify_internal_sequence(events,op,max_steps=4096,cold_read_ceiling=changed)['passed'])

    def test_source_settings_budget_owner_graph_mutations_are_nonnoop_and_refuse(self):
        for original in self.cases():
            self.assertTrue(self.audit(original)['passed'],self.audit(original))
            for mutation in ('source','source_sha','settings','nonnull_connected','deadline','writer_finish','account','document','header','node_guid','position','port','edge','read_only_save','late_work','table_origin','table_build'):
                case = copy.deepcopy(original)
                _,report,events,writer,expected,_ = case
                c = report['cold']
                if mutation == 'source':c['source']['source_text'] += '\n// changed'
                if mutation == 'source_sha':c['source']['source_sha256'] = '0'*64
                if mutation == 'settings':c['source']['settings']['generation'] = not c['source']['settings']['generation']
                if mutation == 'nonnull_connected':c['source']['settings']['grids'][1]['fields'].append(dict(ConnectedRecord='foreign'))
                if mutation == 'deadline':report['original_deadline'] += 1
                if mutation == 'writer_finish':writer['finished_at'] = report['finished_at']
                if mutation == 'account':c['prepared']['loginom_account'] = 'foreign'
                if mutation == 'document':c['node']['document_id'] = writer['node']['document_id']
                if mutation == 'header':events[-1]['runtime_revision'] = 'foreign'
                if mutation == 'node_guid':c['graph_after']['nodes'][-1]['ref']['node_id'] = 'foreign'
                if mutation == 'position':c['graph_after']['nodes'][-1]['position']['x'] += 1
                if mutation == 'port':c['graph_after']['nodes'][-1]['outputs'].append(1)
                if mutation == 'edge':c['graph_after']['links'][0]['output'] = 1
                if mutation == 'read_only_save':events.append(copy.deepcopy(events[-1]) | dict(phase='persistence_save_reserved'))
                if mutation == 'late_work':
                    late = datetime.fromtimestamp((report['original_deadline']+1000)/1000,timezone.utc).isoformat()
                    report['finished_at'] = late
                    next(r for r in events if r.get('phase') == 'source_delivery_verified')['recorded_at'] = late
                if mutation in ('table_origin','table_build'):
                    table_ops = {r['operation_id'] for r in events if r.get('phase') == 'node_observation_completed' and r.get('outcome',{}).get('output',{}).get('node_table',{}).get('rows')}
                    for row in events:
                        if row.get('operation_id') in table_ops and row.get('phase') in ('node_observation_completed','node_observation_sample'):
                            row['outcome']['output']['origin' if mutation == 'table_origin' else 'loginom_build'] = 'foreign'
                with self.subTest(case=case[0],mutation=mutation):
                    self.assertNotEqual(case,original)
                    self.assertFalse(self.audit(case)['passed'],self.audit(case))

    def test_coherently_changed_source_receipts_settings_graph_or_oracle_refuse(self):
        for original in self.cases():
            self.assertTrue(self.audit(original)['passed'],self.audit(original))
            for mutation in ('source','settings','native_graph','value','raw_and_typed','type','null','precision','order','count'):
                case = copy.deepcopy(original)
                _,report,events,writer,_,oracle = case
                c = report['cold']
                if mutation == 'source':
                    c['source']['source_text'] += '// changed\n'
                    source = c['source']['source_text'].encode()
                    c['source'].update(source_sha256=hashlib.sha256(source).hexdigest(),source_utf8_bytes=len(source),source_lf_lines=c['source']['source_text'].count('\n')+1)
                if mutation == 'settings':
                    c['source']['settings']['generation'] = not c['source']['settings']['generation']
                    c['source']['admission']['settings_sha256'] = value_digest(c['source']['settings'])
                    for row in events:
                        if row.get('phase') in ('javascript_source_admitted','javascript_source_effect_dispatch','javascript_source_effect_returned'):row['receipt'] = copy.deepcopy(c['source']['admission'])
                if mutation == 'native_graph':
                    for graph in (c['graph_before'],c['graph_after']):graph['nodes'][-1]['position']['x'] += 1
                    for row in events:
                        if row.get('phase') == 'execution_boundary_observed':
                            row['before']['nodes'][-1]['position']['x'] += 1;row['after']['nodes'][-1]['position']['x'] += 1
                if mutation in ('value','raw_and_typed'):c['output']['sample'][0][2]['value'] = '1801'
                if mutation == 'raw_and_typed':
                    for row in events:
                        if row.get('phase') in ('node_observation_sample','node_observation_completed'):
                            for raw in row.get('outcome',{}).get('output',{}).get('node_table',{}).get('rows',[]):
                                if raw.get('index') == 0:
                                    for cell in raw['cells']:
                                        if cell['column'] == 2:cell['text'] = '1801'
                if mutation == 'type':c['output']['sample'][0][2]['type'] = 'string'
                if mutation == 'null':c['output']['sample'][0][2].update(is_null=True,value=None)
                if mutation == 'precision':c['output']['sample'][0][2]['precision'] = 'display_text'
                if mutation == 'order':c['output']['sample'][0],c['output']['sample'][1] = c['output']['sample'][1],c['output']['sample'][0]
                if mutation == 'count':c['output']['row_count'] += 1
                for row in events:
                    if row.get('phase') == 'cold_output_observed':row['result'] = copy.deepcopy(c['output'])
                with self.subTest(case=case[0],mutation=mutation):
                    self.assertNotEqual(case,original)
                    self.assertFalse(self.audit(case)['passed'],self.audit(case))

    def test_mapping_dense_inventory_reciprocity_semantics_port_or_pending_refuse(self):
        for original in self.cases():
            self.assertTrue(self.audit(original)['passed'],self.audit(original))
            for mutation in ('source_pointer','field_name','usage','count','autosync','port_guid','pending_only_after_execute'):
                case = copy.deepcopy(original)
                _,report,events,writer,_,_ = case
                c = report['cold'];mapping = c['mappings_after']['output']
                if mutation == 'source_pointer':mapping['target_fields'][0]['source']['record_id'] = 'foreign'
                if mutation == 'field_name':mapping['target_fields'][0]['name'] += 'Changed'
                if mutation == 'usage':mapping['target_fields'][0]['usage_type'] = 1234
                if mutation == 'count':mapping['target_fields'].pop()
                if mutation == 'autosync':mapping['autosync'] = not mapping['autosync']
                if mutation == 'port_guid':mapping['node_context']['output_port']['port_guid'] = 'foreign'
                if mutation == 'pending_only_after_execute':mapping['verified'] = False;mapping['configured_inventory_verified'] = True
                for row in events:
                    if row.get('phase') == 'port_mapping_observed' and row.get('direction') == 'output' and row['mapping'].get('source_fields'):row['mapping'] = copy.deepcopy(mapping)
                with self.subTest(case=case[0],mutation=mutation):
                    self.assertNotEqual(case,original)
                    self.assertFalse(self.audit(case)['passed'],self.audit(case))

    def test_fresh_execution_source_owner_ids_launch_count_and_source_lifecycle_refuse(self):
        for original in self.cases():
            self.assertTrue(self.audit(original)['passed'],self.audit(original))
            for mutation in ('stale','owner','baseline_owner','source','extra_launch','missing_close','chunk','cursor','read_order','effect_order'):
                case = copy.deepcopy(original)
                _,report,events,writer,_,_ = case
                c = report['cold']
                if mutation == 'stale':c['execution']['execution_id'] = writer['execution_ids'][-1]
                if mutation == 'owner':c['execution']['launch_identity']['node']['node_id'] = 'foreign'
                if mutation == 'baseline_owner':c['execution']['fresh_baseline']['node']['node_id'] = 'foreign'
                if mutation == 'source':c['execution']['trial']['source_sha256'] = '0'*64
                if mutation == 'extra_launch':events.append(copy.deepcopy(next(r for r in events if r.get('phase') == 'execution_launched')))
                if mutation == 'missing_close':next(r for r in events if r.get('phase') == 'source_discard_settled')['phase'] = 'missing_close'
                if mutation == 'chunk':next(r for r in events if r.get('phase') == 'source_delivery_verified')['receipt']['chunk_sha256'] = '0'*64
                if mutation == 'cursor':next(r for r in reversed(events) if r.get('phase') == 'source_delivery_verified')['receipt']['cursor_sha256'] = '0'*64
                if mutation == 'read_order':
                    a = next(i for i,r in enumerate(events) if r.get('phase') == 'source_open_settled');b = next(i for i,r in enumerate(events) if r.get('phase') == 'source_discard_settled');events[a],events[b] = events[b],events[a]
                if mutation == 'effect_order':
                    a = next(i for i,r in enumerate(events) if r.get('phase') == 'javascript_source_effect_dispatch');b = next(i for i,r in enumerate(events) if r.get('phase') == 'execution_terminal');events[a],events[b] = events[b],events[a]
                for row in events:
                    if row.get('phase') == 'execution_terminal':row['terminal'] = copy.deepcopy(c['execution'])
                with self.subTest(case=case[0],mutation=mutation):
                    self.assertNotEqual(case,original)
                    self.assertFalse(self.audit(case)['passed'],self.audit(case))


class JavascriptColdBoundaryTests(unittest.TestCase):
    def test_missing_evidence_cannot_promote_acceptance(self):
        result = verify_javascript_cold({},[],{}, {},[],[])
        self.assertFalse(result['passed'])
        self.assertIs(result['cli_acceptance_verified'],False)

    def test_null_cache_reference_only_is_normalized_nonnull_and_other_settings_stay(self):
        value = dict(generation=False,grids=[dict(tid='cold;WizrdMCF;JavaScriptColumnsWizard;grdSourceColumns;tbl',fields=[]),
            dict(tid='cold;WizrdMCF;JavaScriptColumnsWizard;grdTargetColumns;tbl',fields=[dict(Name='Value',ConnectedRecord=None,DefaultUsageType=4)])])
        normalized = settings_for_writer(value,'cold','writer')
        self.assertNotIn('ConnectedRecord',normalized['grids'][1]['fields'][0])
        self.assertEqual(normalized['grids'][1]['fields'][0]['DefaultUsageType'],4)
        self.assertIn('ConnectedRecord',value['grids'][1]['fields'][0])
        value['grids'][1]['fields'][0]['ConnectedRecord'] = 'unexpected-native-record'
        self.assertEqual(settings_for_writer(value,'cold','writer')['grids'][1]['fields'][0]['ConnectedRecord'],'unexpected-native-record')


if __name__ == '__main__':unittest.main()
