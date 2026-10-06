"""Exercise the actual matrix runner's complete comparison/final gate and exit."""
import ast,copy,json,sys,time,unittest,tempfile,importlib.util,subprocess,contextlib,io
from pathlib import Path
from unittest.mock import patch
sys.dont_write_bytecode=True
root=Path(__file__).parent
spec=importlib.util.spec_from_file_location('oracle',root/'matrix-oracle.py');oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
tree=ast.parse((root/'run-matrix-cli.py').read_text());boundary=next(n for n in tree.body if isinstance(n,ast.Try))
start=next(i for i,n in enumerate(boundary.body) if isinstance(n,ast.Assign) and ast.unparse(n.targets[0])=='cold')
selected=copy.deepcopy(boundary);selected.body=selected.body[start:]
code=compile(ast.fix_missing_locations(ast.Module(body=[selected,*tree.body[tree.body.index(boundary)+1:]],type_ignores=[])),'matrix-runner-gate','exec')
case=json.loads((root/'matrix/manifest.json').read_text())['cases'][0]
def port():
 return {'schema':case['columns'],'row_count':3,'sample_rows':3,'sample_complete':True,'fresh':True,'execution_id':'owned',
         'sample':[[{'type':c['type'],'is_null':v is None,'value':v} for c,v in zip(case['columns'],row)] for row in case['expected_rows']]}
class MatrixGate(unittest.TestCase):
 def run_gate(self,mutation=None):
  with tempfile.TemporaryDirectory() as directory:
   attempt=Path(directory);evidence=attempt/'evidence';evidence.mkdir();cold_dir=evidence/'oracle';cold_dir.mkdir()
   native={'source':{'source_path':'/owned/source.txt','connection':'Локальное',**case['settings']['source']},'format':case['settings']['format'],'columns':case['columns']}
   cold={'status':'CHECK_VALUES','cleanup':{'package_closed':True,'logged_out':True},'cli_delivery':{'destination':'/owned/source.txt'},'configuration':native,'port':port()}
   warm={'operation_id':'import','state':'settled','status':'SUCCEEDED','cleanup_complete':True,'configuration':{'readback':native},'output':{'ports':[port()]}}
   result={'status':'FAIL','source_sha':'sha','cli_exit':0,'oracle_exit':0,'oracle':{'status':'NOT_RUN'}}
   if mutation:mutation(cold,warm,result)
   (cold_dir/'result.json').write_text(json.dumps(cold));rawout=attempt/'stdout';rawerr=attempt/'stderr'
   terminal=[{'tool':'loginom_dock_node_apply','input':{'target':{'type':'imports.text'},'operation_id':'import'},'result':warm}]
   closed=[]
   scope=dict(case=case,cold=None,oracle=cold_dir,oracle_module=oracle,terminal=terminal,result=result,evidence=evidence,attempt=attempt,
              rawout=rawout,rawerr=rawerr,json=json,time=time,started=time.monotonic(),lock=1,sys=sys,
              os=type('OS',(),{'close':staticmethod(closed.append)}),write_private=lambda p,v:p.write_text(json.dumps(v)))
   exit_code=0
   with contextlib.redirect_stdout(io.StringIO()):
    try:exec(code,scope)
    except SystemExit as e:exit_code=e.code
   self.assertEqual(closed,[1]);return exit_code,json.loads((evidence/'result.json').read_text())
 def test_complete_warm_and_cold_only_pass(self):
  code,result=self.run_gate();self.assertEqual((code,result['status']),(0,'PASS'))
 def test_actual_last_cell_audit_exception_becomes_fail(self):
  code,result=self.run_gate(lambda c,w,r:w['output']['ports'][0]['sample'][2][4].update(value='wrong'))
  self.assertEqual((code,result['status']),(1,'FAIL'));self.assertIn('exact string/date differs',result['error'])
 def test_incomplete_warm_or_cold_and_missing_cleanup_are_nonzero(self):
  for mutate in [lambda c,w,r:c['port'].update(sample_complete=False),lambda c,w,r:w['output']['ports'][0].update(row_count=4),
                 lambda c,w,r:c.update(cleanup={}),lambda c,w,r:c['cleanup'].update(logged_out=False),
                 lambda c,w,r:w.update(cleanup_complete=False),lambda c,w,r:r.update(cli_exit=1),lambda c,w,r:r.update(oracle_exit=1)]:
   code,result=self.run_gate(mutate);self.assertEqual((code,result['status']),(1,'FAIL'))
if __name__=='__main__':unittest.main()
