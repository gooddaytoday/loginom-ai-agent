#!/usr/bin/env python3
import argparse,csv,hashlib,io,json,pathlib,shutil,subprocess,tempfile,zipfile
from xml.etree import ElementTree

def run_recipe(task,recipe):
 with tempfile.TemporaryDirectory(prefix='calibration-oracle-') as temp:
  d=pathlib.Path(temp);shutil.copytree(task/'data',d/'data')
  source=(task/'oracle.py').read_text()
  for e in recipe.get('python_edits',[]):
   assert source.count(e['from'])==e['count'],(task,e)
   source=source.replace(e['from'],e['to'])
  (d/'oracle.py').write_text(source)
  subprocess.run(['python3',str(d/'oracle.py')],check=True,capture_output=True)
  rows=list(csv.reader((d/'oracle.csv').open(newline='')))
  if 'sort' in recipe:
   settings=recipe['sort'];idx=rows[0].index(settings['column'])
   def key(row):
    if settings.get('order'):return settings['order'].index(row[idx])
    try:return float(row[idx])
    except ValueError:return row[idx]
   rows=[rows[0],*sorted(rows[1:],key=key,reverse=settings['descending'])]
  if recipe.get('drop_last'):rows=[row[:-1] for row in rows]
  if recipe.get('exclude_channel'):rows=[rows[0],*[row for row in rows[1:] if row[0]!=recipe['exclude_channel']]]
  out=io.StringIO(newline='');csv.writer(out,lineterminator='\n').writerows(rows);return out.getvalue()
def csv_equal(a,b):
 from decimal import Decimal,InvalidOperation
 l=list(csv.reader(io.StringIO(a)));r=list(csv.reader(io.StringIO(b)))
 if len(l)!=len(r) or set(l[0])!=set(r[0]):return False
 pos=[r[0].index(c) for c in l[0]]
 for left,right in zip(l[1:],r[1:]):
  for i,j in enumerate(pos):
   if left[i]==right[j]:continue
   try:
    if abs(Decimal(left[i])-Decimal(right[j]))<=Decimal('.01'):continue
   except InvalidOperation:pass
   return False
 return True

def main():
 ap=argparse.ArgumentParser(description='Recompute calibration CSVs from pinned independent oracle recipes.')
 ap.add_argument('--tasks',required=True,type=pathlib.Path)
 ap.add_argument('--only')
 ap.add_argument('--corpus',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent.parent/'calibration')
 args=ap.parse_args()
 names=args.only.split(',') if args.only else sorted(p.name for p in args.corpus.iterdir() if (p/'cases.json').exists())
 counts={k:0 for k in ['sort','aggregate','threshold','filter','column']}
 for name in names:
  task=args.tasks/name;dir=args.corpus/name;manifest=json.loads((dir/'cases.json').read_text())
  for rel,digest in manifest['sources'].items():
   assert hashlib.sha256((task/rel).read_bytes()).hexdigest()==digest,(name,rel,'stale source')
  assert csv_equal((task/'oracle.csv').read_text(),run_recipe(task,{})),(name,'baseline oracle mismatch')
  description=json.loads((task/'task.json').read_text())
  with zipfile.ZipFile(task/description['reference']) as archive:
   originals={e['file']:archive.read(e['file']).decode('utf-8-sig') for case in manifest['cases'] for e in case['edits']}
  for case in manifest['cases']:
   actual=run_recipe(task,case['reproduce'])
   assert actual==(dir/case['result_csv']).read_text(),(name,case['id'],'CSV recipe mismatch')
   assert csv_equal((task/'oracle.csv').read_text(),actual)==case['expected_oracle_pass'],(name,case['id'],'oracle expectation mismatch')
   mutated=dict(originals)
   for edit in case['edits']:
    assert mutated[edit['file']].count(edit['from'])==edit['count'],(name,case['id'],'XML count')
    mutated[edit['file']]=mutated[edit['file']].replace(edit['from'],edit['to'])
   for file,source in mutated.items():
    original=ElementTree.fromstring(originals[file]);changed=ElementTree.fromstring(source)
    assert [n.get('Guid') for n in original.findall('.//Nodes/Item')]==[n.get('Guid') for n in changed.findall('.//Nodes/Item')],(name,case['id'],'node topology')
    assert ElementTree.tostring(original.find('.//Links'))==ElementTree.tostring(changed.find('.//Links')),(name,case['id'],'link topology')
   counts[case['kind']]+=1
 if not args.only:
  assert len(names)==35,('task coverage',len(names))
  assert counts==dict(sort=35,aggregate=34,threshold=6,filter=3,column=35),('case coverage',counts)
 print(str(len(names))+' tasks, '+str(sum(counts.values()))+' cases: '+json.dumps(counts,sort_keys=True))
if __name__=='__main__':
 main()
