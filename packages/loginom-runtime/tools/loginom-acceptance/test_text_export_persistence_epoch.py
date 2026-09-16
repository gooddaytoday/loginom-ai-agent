import copy,unittest
from text_export_acceptance import preserved

class PersistenceEpochTests(unittest.TestCase):
    def test_same_document_requires_distinct_native_workflow(self):
        def out(flow,execution):return {'output':{'node':{'node_id':'guid','document_id':'doc','workflow_id':flow},'configuration':{'readback':{'input_mapping':{'fields':['a']},'settings':{'destination':'path','delimiter':';'}}},'execution':{'status':'completed','execution_id':execution}}}
        before,after=out('old-flow','e1'),out('new-flow','e2')
        request={'target':{'kind':'existing'},'inputs':[],'mappings':[],'parameters':{'destination':'path'}}
        self.assertTrue(preserved(before,after,request)['passed'])
        for field,value in [('workflow_id','old-flow'),('workflow_id',None),('workflow_id',''),('node_id','foreign')]:
            changed=copy.deepcopy(after);changed['output']['node'][field]=value
            with self.subTest(field=field,value=value),self.assertRaises(AssertionError):preserved(before,changed,request)

if __name__=='__main__':unittest.main()
