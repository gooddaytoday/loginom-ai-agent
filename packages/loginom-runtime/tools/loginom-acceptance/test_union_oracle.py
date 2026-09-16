import unittest,json
from union_oracle import expected,FIXTURES,verify_output
class UnionOracleTest(unittest.TestCase):
 def test_independent_expected(self):
  frozen=json.loads((FIXTURES/'expected.json').read_text())
  self.assertEqual(expected(3),{k:frozen[k] for k in ('columns','types','rows')})
  self.assertEqual(len(expected(2)['rows']),5)
 def test_lost_duplicates_and_null_confusion_fail(self):
  e=expected(3)
  p={'schema':[{'name':n,'type':t} for n,t in zip(e['columns'],e['types'])],'row_count':7,'sample_rows':7,'sample_complete':True,'sample':[[{'is_null':v is None,'value':str(v) if isinstance(v,int) else v,'type':t,'precision':'exact_integer' if t=='integer' else 'display_text'} for v,t in zip(row,e['types'])] for row in e['rows']]}
  self.assertTrue(verify_output(p,3)['passed']);p['sample'][4][2]['is_null']=True;p['sample'][4][2]['value']=None
  with self.assertRaises(ValueError):verify_output(p,3)
if __name__=='__main__':unittest.main()
