"""Offline kit validation. Never grants live or autonomous admission."""
from pathlib import Path
import json,hashlib,importlib.util,copy
P=Path(__file__).resolve().parent;R=P.parents[3]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 m=json.loads((P/'manifest.json').read_text())
 for name,h in m['kit_files'].items():assert sha(P/name)==h,name
 for name,h in m['replay_sha256'].items():assert sha(R/name)==h,name
 packet=json.loads((P/'source-packet.json').read_text())
 for f in packet['files']:assert sha(R/f['path'])==f['sha256'],f['path']
 spec=importlib.util.spec_from_file_location('kit_audit',P/'audit.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
 checks=[]
 for case,path in m['replay'].items():checks.append(mod.audit(json.loads((R/path).read_text()),'mixed' if case=='reopened' else case))
 good=json.loads((R/m['replay']['mixed']).read_text());denied=0
 for mutate in [lambda b:b['output']['ports'][0]['exact_table']['rows'].pop(),lambda b:b['output']['ports'][0]['exact_table']['rows'][0][3].__setitem__('value','9007199254740995'),lambda b:b['output']['ports'][0]['exact_table']['rows'][7][3].__setitem__('cell_type','integer'),lambda b:b['configuration']['readback'].__setitem__('ignore_empty',True),lambda b:b['output']['ports'][0]['binding'].__setitem__('document_id','foreign')]:
  bad=copy.deepcopy(good);mutate(bad)
  try:mod.audit(bad,'mixed')
  except (AssertionError,KeyError,TypeError):denied+=1
  else:raise AssertionError('Tampering accepted')
 goal=json.loads((P/'goal.json').read_text());assert all(v=='OPEN' for v in goal['gates'].values())
 expected=json.loads((P/'expected.json').read_text());assert len(expected)==10
 for e in expected.values():assert len(e['rows'])<=50 and len(e['schema'])<=8 and all(len(r)==len(e['schema']) for r in e['rows'])
 return dict(status='KIT_CHECK_PASS',replay=checks,negative_mutations_rejected=denied,frozen_cases=10,all_gates_open=True,ready=False,model_started=False)
if __name__=='__main__':print(json.dumps(main(),ensure_ascii=False))
