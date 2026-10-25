import copy
import unittest
from full_read_evidence import verify_full_read

class FullReadTests(unittest.TestCase):
    def fixture(self,rows=8,capacity=8):
        req=dict(operation_id='read',read=dict(ports=[0],sample_rows=capacity,require_exact_numbers=True))
        port=dict(port=0,fresh=True,execution_id='new',row_count=rows,sample_rows=rows,sample_complete=True,filter_enabled=False,schema=[dict(name='Id')],sample=[[i] for i in range(rows)])
        cp=dict(status='SUCCEEDED',execution=dict(status='completed',execution_id='new'),output=dict(status='complete',verified=True,execution_id='new',ports=[port]))
        return req,[dict(phase='node_checkpoint',operation_id='read',result=cp)]
    def test_exact_or_larger_capacity_and_empty(self):
        for rows,capacity in ((8,8),(8,10),(10,10),(0,1),(0,10)):
            r,e=self.fixture(rows,capacity);self.assertTrue(verify_full_read(e,r,rows)['passed'])
    def test_insufficient_and_invalid_capacity(self):
        for capacity in (7,0,True,11):
            r,e=self.fixture(8,capacity);self.assertFalse(verify_full_read(e,r,8)['passed'])
    def test_incomplete_stale_counts_truncation_and_width(self):
        r,e=self.fixture()
        for change in (lambda p:p.update(row_count=9),lambda p:p.update(sample_rows=7),lambda p:p['sample'].pop(),
                       lambda p:p.update(sample_complete=False),lambda p:p.update(execution_id='old'),lambda p:p.update(fresh=False),
                       lambda p:p.update(truncated=True),lambda p:p.update(schema_truncated=True),lambda p:p.update(filter_enabled=True),
                       lambda p:p['sample'][0].append(1),lambda p:p.update(schema=[])):
            c=copy.deepcopy(e);change(c[0]['result']['output']['ports'][0]);self.assertFalse(verify_full_read(c,r,8)['passed'])
    def test_empty_requires_schema_and_exact_zero(self):
        r,e=self.fixture(0,10);e[0]['result']['output']['ports'][0]['schema']=[]
        self.assertFalse(verify_full_read(e,r,0)['passed'])
    def test_filter_state_is_optional_only_for_port_reading(self):
        cases=[(source,value,False) for source in (None,'unknown') for value in ('missing',None,0,'false',True)]
        cases += [(source,False,True) for source in (None,'unknown')]
        cases += [('completed_execution_port_source',value,True) for value in ('missing',None,0,'false',False)]
        cases += [('completed_execution_port_source',True,False)]
        for source,value,expected in cases:
            with self.subTest(source=source,value=value):
                r,e=self.fixture();port=e[0]['result']['output']['ports'][0]
                if source:port['freshness_basis']=source
                if value=='missing':del port['filter_enabled']
                else:port['filter_enabled']=value
                self.assertEqual(verify_full_read(e,r,8)['passed'],expected)

if __name__=='__main__':unittest.main()
