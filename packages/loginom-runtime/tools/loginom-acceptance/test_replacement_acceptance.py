"""Preparation contracts only; never invent a successful autonomous export."""
import hashlib,json,unittest
from pathlib import Path
from types import SimpleNamespace
from replacement_upload_probe import FIXTURES,descriptors,prompt,validate_catalog
from replacement_acceptance import audit,graph,semantic_rules,string_rule
import run
class ReplacementAcceptanceTests(unittest.TestCase):
 def test_source_bytes_are_fixed(self):
  for name,(digest,size) in FIXTURES.items():
   p=Path(__file__).parent/'fixtures/replacement'/name
   self.assertEqual((hashlib.sha256(p.read_bytes()).hexdigest(),p.stat().st_size),(digest,size))
 def test_no_candidate_or_account_fallback(self):
  validate_catalog(None,None,'/test-2')
  for uri,digest,directory in [(None,None,'/test-1'),('viking://old/manifest.json','a'*64,'/test-2'),(None,'a'*64,'/test-2')]:
   with self.assertRaises(ValueError):validate_catalog(uri,digest,directory)
  a=SimpleNamespace(goal='replacement-node-complete',loginom_url='http://example.test/app/',model_profile='chatgpt-sol',timeout=1200,max_turns=100,manifest_uri=None,manifest_sha256=None,storage_directory='/test-2',run=True,loginom_user='test-2')
  with self.assertRaises(ValueError):run.validate_inputs(a)
 def test_prompt_contains_task_and_no_internal_driver_commands(self):
  text=(Path(__file__).parent/'goals/replacement-node-complete.txt').read_text()
  out=prompt(text,'/test-2/packages/acceptance.lgp','/test-2','20260913-120000-1234abcd')
  self.assertNotIn('__',out)
  for forbidden in ('node.apply','dock_','package.save','python','operation_id','manifest_sha','expected-multi'):self.assertNotIn(forbidden,out)
  self.assertIn('закрой и повторно открой',out)
  self.assertEqual(len(descriptors('20260913-120000-1234abcd','/test-2')),2)
 def test_graph_is_independent_of_output(self):
  g=graph();self.assertEqual(len(g['nodes']),4);self.assertEqual(len(g['links']),2)
  self.assertEqual(len(g['ports']),4)
 def test_rule_comparison_preserves_types_and_other_policy(self):
  a=string_rule('B','old','New');b=string_rule('C','stay','Stayed')
  self.assertEqual(semantic_rules([a,b]),semantic_rules([b,a]))
  b['other']['mode']='null';self.assertNotEqual(semantic_rules([a]),semantic_rules([b]))
 def test_missing_autonomous_evidence_cannot_pass(self):
  result=audit({},dict(calls=[],tools=[],events=[]),'',{})
  self.assertFalse(result['passed']);self.assertFalse(result['autonomous_acceptance'])
if __name__=='__main__':unittest.main()
