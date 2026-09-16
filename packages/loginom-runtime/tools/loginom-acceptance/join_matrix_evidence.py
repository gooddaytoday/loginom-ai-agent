"""Audit fixed diagnostic Join matrix cases against pre-existing independent CSVs."""
import argparse,json
from pathlib import Path
from join_oracle import expected
from join_configuration_evidence import verify_join_configuration
from grouping_output_evidence import verify_grouping_output
WORK=Path(__file__).resolve().parent
CASES={
 'main-left':('left.csv','right.csv','left',True,False,[('LKey','RKey'),('Part','PartR')]),
 'main-single':('left.csv','right.csv','inner',True,False,[('LKey','RKey')]),
 'case-sensitive':('case-left.csv','case-right.csv','inner',True,True,[('LKey','RKey'),('Part','PartR')]),
 'case-insensitive':('case-left.csv','case-right.csv','inner',False,True,[('LKey','RKey'),('Part','PartR')]),
 'empty-inner':('left.csv','empty.csv','inner',True,True,[('LKey','RKey'),('Part','PartR')]),
 'empty-left':('left.csv','empty.csv','left',True,False,[('LKey','RKey'),('Part','PartR')])}
def audit(events,cases):
 checks={};passed_names=set()
 for case in cases:
  name=case['name'];r=case['request']
  if name not in CASES or case['result']['status']!='SUCCEEDED':checks[name]=dict(passed=False,reason='case_not_successful');continue
  lf,rf,mode,sensitive,include,keys=CASES[name]
  declaration=(r['mode']==mode and r['parameters']==dict(keys=[dict(left=a,right=b) for a,b in keys],case_sensitive=sensitive,include_joined_keys=include))
  c,rows=expected((WORK/'fixtures/join'/lf).read_bytes(),(WORK/'fixtures/join'/rf).read_bytes(),keys,mode,sensitive,include)
  # Existing output preserves surviving fields; the newly exposed PartR
  # is appended after RValue when removing the second key.
  if name=='main-single':
   order=['LKey','Part','LValue','RValue','PartR'];indices=[next(i for i,column in enumerate(c) if column['name']==n) for n in order]
   c=[c[i] for i in indices];rows=[[row[i] for i in indices] for row in rows]
  config=verify_join_configuration(events,r);output=verify_grouping_output(events,r,c,rows)
  checks[name]=dict(passed=declaration and config['passed'] and output['passed'],configuration=config,output=output,expected_rows=len(rows))
  if checks[name]['passed']:passed_names.add(name)
 checks['coverage']=dict(passed=passed_names==set(CASES),missing=sorted(set(CASES)-passed_names))
 return dict(passed=all(c['passed'] for c in checks.values()),checks=checks,scope='diagnostic_join_matrix_not_hermes')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('directory',type=Path);a=p.parse_args();events=[json.loads(l) for l in (a.directory/'execution-events.jsonl').read_text().splitlines()];r=audit(events,json.loads((a.directory/'matrix-cases-full.json').read_text()));(a.directory/'matrix-audit.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False));raise SystemExit(0 if r['passed'] else 1)
