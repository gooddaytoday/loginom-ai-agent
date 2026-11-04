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
  completed=subprocess.run(['python3',str(d/'oracle.py')],check=True,capture_output=True)
  if not (d/'oracle.csv').exists():
   (d/'oracle.csv').write_bytes(completed.stdout)
  with (d/'oracle.csv').open(newline='') as source:
   delimiter=csv.Sniffer().sniff(source.readline(),delimiters=',;').delimiter
   source.seek(0);rows=list(csv.reader(source,delimiter=delimiter))
  if 'sort' in recipe:
   settings=recipe['sort'];idx=rows[0].index(settings['column'])
   def key(row):
    if settings.get('order'):return settings['order'].index(row[idx])
    try:return float(row[idx])
    except ValueError:return row[idx]
   rows=[rows[0],*sorted(rows[1:],key=key,reverse=settings['descending'])]
  if recipe.get('drop_last'):rows=[row[:-1] for row in rows]
  if recipe.get('exclude_channel'):rows=[rows[0],*[row for row in rows[1:] if row[0]!=recipe['exclude_channel']]]
  out=io.StringIO(newline='');csv.writer(out,delimiter=delimiter,lineterminator='\n').writerows(rows);return out.getvalue()
def csv_equal(task,result,tolerance):
 with tempfile.TemporaryDirectory(prefix='calibration-compare-') as temp:
  output=pathlib.Path(temp)/'result.csv';output.write_text(result)
  repo=pathlib.Path(__file__).resolve().parents[2]
  compared=subprocess.run(['bun',str(repo/'evals/skills/loginom-eval-case/scripts/compare_csv.ts'),str(repo),str(task/'oracle.csv'),str(output),str(tolerance)],check=True,capture_output=True,text=True)
  return json.loads(compared.stdout)['passed'] is True

def main():
 ap=argparse.ArgumentParser(description='Recompute calibration CSVs from pinned independent oracle recipes.')
 ap.add_argument('--tasks',required=True,type=pathlib.Path)
 ap.add_argument('--only')
 ap.add_argument('--corpus',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parent.parent/'calibration')
 args=ap.parse_args()
 descriptions={}
 for file in sorted(args.tasks.glob('*/task.json')):
  description=json.loads(file.read_text())
  assert description['id']==file.parent.name,(file,'task id must match directory')
  descriptions[description['id']]=description
 assert descriptions,('no tasks',args.tasks)
 names=args.only.split(',') if args.only else [name for name in descriptions if (args.corpus/name/'cases.json').exists()]
 if not names:ap.error('no calibration manifests for requested tasks')
 assert all(name in descriptions for name in names),('unknown tasks',names)
 counts={k:0 for k in ['sort','aggregate','threshold','filter','column']}
 for name in names:
  task=args.tasks/name;dir=args.corpus/name;manifest=json.loads((dir/'cases.json').read_text())
  for rel,digest in manifest['sources'].items():
   assert hashlib.sha256((task/rel).read_bytes()).hexdigest()==digest,(name,rel,'stale source')
  description=descriptions[name]
  tolerance=description.get('oracle_tolerance',.01)
  assert csv_equal(task,run_recipe(task,{}),tolerance),(name,'baseline oracle mismatch')
  with zipfile.ZipFile(task/description['reference']) as archive:
   originals={e['file']:archive.read(e['file']).decode('utf-8-sig') for case in manifest['cases'] for e in case['edits']}
  for case in manifest['cases']:
   actual=run_recipe(task,case['reproduce'])
   assert actual==(dir/case['result_csv']).read_text(),(name,case['id'],'CSV recipe mismatch')
   assert csv_equal(task,actual,tolerance)==case['expected_oracle_pass'],(name,case['id'],'oracle expectation mismatch')
   mutated=dict(originals)
   for edit in case['edits']:
    assert mutated[edit['file']].count(edit['from'])==edit['count'],(name,case['id'],'XML count')
    mutated[edit['file']]=mutated[edit['file']].replace(edit['from'],edit['to'])
   for file,source in mutated.items():
    original=ElementTree.fromstring(originals[file]);changed=ElementTree.fromstring(source)
    assert [n.get('Guid') for n in original.findall('.//Nodes/Item')]==[n.get('Guid') for n in changed.findall('.//Nodes/Item')],(name,case['id'],'node topology')
    assert ElementTree.tostring(original.find('.//Links'))==ElementTree.tostring(changed.find('.//Links')),(name,case['id'],'link topology')
   counts[case['kind']]+=1
 print(str(len(names))+' tasks, '+str(sum(counts.values()))+' cases: '+json.dumps(counts,sort_keys=True))
if __name__=='__main__':
 main()
