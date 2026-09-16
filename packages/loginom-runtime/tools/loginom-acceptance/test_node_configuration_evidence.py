import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from node_configuration_evidence import verify_configuration_readback


class ConfigurationEvidenceTests(unittest.TestCase):
    def setUp(self):
        f = json.loads((Path(__file__).resolve().parents[2]/'client/test/fixtures/text-import-readback.json').read_text())
        c,m,finish = [p['value'] for p in f['phases']]
        self.request = dict(operation_id='readback',finish='execute')
        self.sequence = dict(failures=[],mutations=[],observations=[
            (1,dict(wizard=dict(stage='text_import_file',import_source=c['source']))),
            (2,dict(wizard=dict(stage='text_import_format',settings=c['format'],import_columns=dict(fields=c['columns'],
                page=dict(status='complete_definition_page',offset=0,returned=5,total_columns=5,next_offset=None,schema_id='schema'))))),
            (3,dict(node_mapping=m['native_mapping']))])
        for _,state in self.sequence['observations']:
            state['prepared_node_context']={**f['node'],'verified':True}
        self.events = []
        for name,steps in [('configure',[1,2]),('output_mapping',[3]),('finish',[4])]:
            receipt = next(p for p in f['phases'] if p['phase']==name)
            self.events.extend([dict(operation_id='readback',phase='node_phase_prepared',receipt=receipt),
                *[dict(operation_id='readback',phase='sample',step=n) for n in steps],
                dict(operation_id='readback',phase='node_phase_completed',receipt=receipt)])
        def fields(group):return {k:v['value'] for k,v in group['fields'].items()}
        readback=dict(kind='text_import',scope='observed_before_verified_finish',node=f['node'],receipt_ids=[p['receipt_id'] for p in f['phases']],
            values_are='observed_ui_values',source=fields(c['source']),format=fields(c['format']),
            columns=[{k:v[k] for k in ('index','name','label','type','data_kind','used')} for v in c['columns']],
            output_mapping=dict(port=0,autosync=False,fields=[{**{k:v[k] for k in ('index','name','label','type','data_kind')},
                'source_name':v['source']['name']} for v in m['native_mapping']['target_fields']]),package_persistence_verified=False)
        self.result=dict(status='SUCCEEDED',node=f['node'],configuration=dict(status='applied',readback=readback))
        self.events.append(dict(operation_id='readback',phase='node_checkpoint',result=self.result))

    def verify(self):
        with patch('node_configuration_evidence.verify_internal_sequence',return_value=self.sequence):
            return verify_configuration_readback(self.events,self.request)

    def test_projection_matches_observations(self):
        self.assertTrue(self.verify()['passed'])

    def test_wrong_public_values_cannot_pass(self):
        original=copy.deepcopy(self.result['configuration']['readback'])
        for key,value in [('node',dict(node_id='other')),('source',{}),('columns',[]),('format',{}),
                          ('output_mapping',{}),('receipt_ids',[]),('package_persistence_verified',True)]:
            with self.subTest(key=key):
                self.result['configuration']['readback']={**original,key:value}
                self.assertFalse(self.verify()['passed'])

    def test_raw_values_must_match_even_when_phase_receipt_and_public_result_agree(self):
        self.sequence['observations'][0][1]['wizard']['import_source']=copy.deepcopy(self.sequence['observations'][0][1]['wizard']['import_source'])
        self.sequence['observations'][0][1]['wizard']['import_source']['fields']['encoding']['value']='Other encoding'
        self.assertFalse(self.verify()['passed'])

    def test_partial_page_or_unknown_sequence_cannot_pass(self):
        self.sequence['observations'][1][1]['wizard']['import_columns']['page']['total_columns']=6
        self.assertFalse(self.verify()['passed'])
        self.sequence['failures']=['signature_mismatch']
        self.assertFalse(self.verify()['passed'])

    def test_unapplied_finish_cannot_pass(self):
        for e in self.events:
            if e.get('receipt',{}).get('phase')=='finish':e['receipt']['value']['settings_applied']=False
        self.assertFalse(self.verify()['passed'])

    def test_self_consistent_foreign_checkpoint_and_readback_cannot_pass(self):
        self.result['node']={**self.result['node'],'node_id':'foreign'}
        self.result['configuration']['readback']['node']=self.result['node']
        self.assertFalse(self.verify()['passed'])


if __name__=='__main__':unittest.main()
