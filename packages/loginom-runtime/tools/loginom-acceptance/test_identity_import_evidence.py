import copy
import unittest
from unittest.mock import patch
from duplicates_test_fixtures import duplicates_fixtures
from identity_import_evidence import verify_identity_import_mapping, verify_identity_autosync


class IdentityImportTests(unittest.TestCase):
    def setUp(self):
        f=duplicates_fixtures()['main10']; self.data=f['data']
        cols=[dict(c,used=True) for c in f['columns']]
        self.request=dict(inputs=[],mappings=[dict(direction='output',port=0,autosync=False,fields=[dict(source=dict(kind='configured_field',name=c['name']),name=c['name'],label=c['label'],excluded=False) for c in cols])],parameters=dict(settings=dict(columns=cols,source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),format=dict(delimiter=';',text_qualifier='"'))))

    def test_identity_requires_native_proof(self):
        for passed in (False,True):
            with patch('identity_import_evidence.verify_identity_autosync',return_value=dict(passed=True)), patch('identity_import_evidence.verify_text_import_output',return_value=dict(passed=passed,failures=[])) as native:
                self.assertEqual(verify_identity_import_mapping([],self.request,self.data)['passed'],passed)
                native.assert_called_once_with([],self.request,self.data)

    def test_reject_nonidentity_before_native_proof(self):
        def field(k,v): return lambda r:r['mappings'][0]['fields'][0].__setitem__(k,v)
        variants=[('input',lambda r:r['inputs'].append({})),('port',lambda r:r['mappings'][0].update(port=1)),('direction',lambda r:r['mappings'][0].update(direction='input')),('autosync',lambda r:r['mappings'][0].update(autosync=True)),('numeric_autosync',lambda r:r['mappings'][0].update(autosync=0)),('missing_autosync',lambda r:r['mappings'][0].pop('autosync')),('skip',lambda r:r['mappings'][0]['fields'].pop()),('duplicate',lambda r:r['mappings'][0]['fields'].__setitem__(1,copy.deepcopy(r['mappings'][0]['fields'][0]))),('order',lambda r:r['mappings'][0]['fields'].reverse()),('source',field('source',dict(kind='configured_field',name='Foreign'))),('source_kind',field('source',dict(kind='field',name='Id'))),('rename',field('name','Wrong')),('label',field('label','Wrong')),('type',field('type','string')),('data_kind',field('data_kind','Дискретный')),('exclude',field('excluded',True)),('extra',field('unknown',1)),('column_order',lambda r:r['parameters']['settings']['columns'].reverse()),('source_name',lambda r:r['parameters']['settings']['columns'][0].update(source_name='Other')),('unused',lambda r:r['parameters']['settings']['columns'][0].update(used=False))]
        for name,change in variants:
            with self.subTest(name=name),patch('identity_import_evidence.verify_text_import_output') as native:
                r=copy.deepcopy(self.request);change(r);self.assertFalse(verify_identity_import_mapping([],r,self.data)['passed']);native.assert_not_called()

    def test_native_autosync_requires_boolean_false_and_verified_sequence(self):
        request=dict(operation_id='op',parameters=dict(settings={}))
        for value,valid in [(False,True),(True,False),(0,False),(None,False)]:
            with self.subTest(value=value),patch('identity_import_evidence.verify_internal_sequence',return_value=dict(passed=True,observations=[(1,dict(node_mapping=dict(verified=True,autosync=value)))])),patch('identity_import_evidence.import_step_budget',return_value=100):
                self.assertEqual(verify_identity_autosync([],request)['passed'],valid)
        with patch('identity_import_evidence.verify_internal_sequence',return_value=dict(passed=False,observations=[(1,dict(node_mapping=dict(verified=True,autosync=False)))])),patch('identity_import_evidence.import_step_budget',return_value=100):
            self.assertFalse(verify_identity_autosync([],request)['passed'])

    def test_changed_csv_headers_rejected(self):
        self.assertFalse(verify_identity_import_mapping([],self.request,self.data.replace(b'Id;',b'Other;',1))['passed'])

    def test_unmapped_is_still_supported_but_inputs_are_not(self):
        self.request['mappings']=[]
        self.assertTrue(verify_identity_import_mapping([],self.request,self.data)['passed'])
        self.request['inputs']=[{}]
        self.assertFalse(verify_identity_import_mapping([],self.request,self.data)['passed'])

if __name__=='__main__':unittest.main()
