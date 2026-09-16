"""Frozen natural-goal declarations and independent decimal oracle; no handler imports."""
import csv,hashlib,io,json,re
from decimal import Decimal,ROUND_HALF_UP
from pathlib import Path
from destinations import render_goal,storage_segments
WORK=Path(__file__).parent
VERSION='2026.09.13-node14-test4.2-candidate'
MANIFEST_URI='viking://resources/loginom-dock/catalogs/executor-preview/releases/'+VERSION+'/manifest.json'
PIN='e909a974f924fe2be856eb9508cd85c42ac18245ea16df01c6bb75d8b4e874fc'
FILES=['core.csv','precision.csv','skew.csv','boundary.csv','one-in-120.csv','all-null.csv','empty.csv','changed.csv']
SCHEMA=[dict(name=n,label=n,type='real' if n=='Amount' else 'string' if n=='Note' else 'integer',data_kind='Непрерывный' if n in ('Amount','Count') else 'Дискретный') for n in ('Id','Amount','Count','Note','Untouched')]
# Every label survives in the saved package. The main/source-change intermediate
# results are additionally mandatory and cannot be replaced by their final values.
CASES=[
 dict(id='core-initial',label='Основной',source='База',fixture='core.csv',threshold=100,value='MISSING',existing=False,final=False),
 dict(id='core-changed',label='Основной',source='База',fixture='core.csv',threshold=100,value='NEW_NODE',existing=True,final=True),
 dict(id='note-only',label='Только строка',source='База',fixture='core.csv',threshold=100,value='NOTE_ONLY',fields=['Note'],existing=False,final=True),
 dict(id='precision',label='Точность',source='Точные числа',fixture='precision.csv',threshold=100,value='MISSING',existing=False,final=True),
 dict(id='skew',label='Среднее не медиана',source='Асимметрия',fixture='skew.csv',threshold=100,value='MISSING',existing=False,final=True),
 *[dict(id='boundary-'+str(n),label='Порог '+str(n),source='Граница',fixture='boundary.csv',threshold=n,value='MISSING',existing=False,final=True) for n in (40,41,42)],
 dict(id='rounded-zero',label='Округлённый ноль',source='Сто двадцать',fixture='one-in-120.csv',threshold=0,value='MISSING',existing=False,final=True),
 dict(id='all-null',label='Полностью пустые поля',source='Все пропуски',fixture='all-null.csv',threshold=100,value='MISSING',existing=False,final=True),
 dict(id='empty',label='Пустой результат',source='Без строк',fixture='empty.csv',threshold=100,value='MISSING',existing=False,final=True),
 dict(id='reordered',label='Переставленные поля',source='Перестановка',fixture='precision.csv',input_order=['Note','Untouched','Count','Id','Amount'],threshold=100,value='MISSING',existing=False,final=True),
 dict(id='source-before',label='Смена источника',source='Изменяемый источник',fixture='core.csv',threshold=100,value='MISSING',existing=False,final=False),
 dict(id='source-after',label='Смена источника',source='Изменяемый источник',fixture='changed.csv',threshold=100,value='MISSING',existing=True,final=True),
]
def expected(case):
 data=(WORK/'fixtures/missing-values'/case['fixture']).read_bytes();raw=list(csv.reader(io.StringIO(data.decode()),delimiter=';',quotechar='"'));names=raw.pop(0)
 if case.get('input_order'):
  order=[names.index(n) for n in case['input_order']];raw=[[r[i] for i in order] for r in raw];names=case['input_order']
 schema=[dict(next(f for f in SCHEMA if f['name']==n)) for n in names]
 if case.get('id')=='reordered':
  for f in schema:
   if f['name'] in ('Amount','Note'):f['label']='Same'
 rows=[[None if c=='NULL' else c for c in r] for r in raw];fields={n:dict(method='constant',value=case['value']) if n=='Note' else dict(method='mean') for n in case.get('fields',['Amount','Count','Note'])}
 for j,n in enumerate(names):
  if n not in fields or not rows:continue
  valid=[r[j] for r in rows if r[j] is not None];missing=len(rows)-len(valid)
  if not valid or missing*100//len(rows)>case['threshold']:continue
  value=case['value'] if n=='Note' else sum(map(Decimal,valid))/len(valid)
  if n=='Count':value=value.quantize(Decimal('1'),rounding=ROUND_HALF_UP)
  if n!='Note':value=str(value)
  for r in rows:
   if r[j] is None:r[j]=value
 return dict(schema=schema,fields=fields,rows=rows,remaining_nulls=[sum(r[j] is None for r in rows) for j in range(5)],max_nulls_percent=case['threshold'],real_tolerance='0.00000000000001',source_sha256=hashlib.sha256(data).hexdigest())
def fixtures():
 frozen=json.loads((WORK/'fixtures/missing-values/acceptance-pins.json').read_text())
 for name in FILES:
  data=(WORK/'fixtures/missing-values'/name).read_bytes()
  if frozen['files'][name]!=dict(bytes=len(data),sha256=hashlib.sha256(data).hexdigest()):raise ValueError('Missing Values fixture pin differs')
 if frozen['expected']!={c['id']:expected(c) for c in CASES}:raise ValueError('Independent expected differs')
 return frozen

def descriptors(run_id,directory):
 storage_segments(directory)
 if directory!='/test-4' or not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Node14 requires own run/test-4')
 frozen=fixtures()
 return [dict(name='Dock-node14-'+run_id+'-'+name,**frozen['files'][name],upload=dict(directory=directory,overwrite='reject')) for name in FILES]
def prompt(template,package_path,directory,run_id):
 text=render_goal(template,package_path,directory)
 for name,a in zip(FILES,descriptors(run_id,directory)):text=text.replace('__'+name.upper().replace('-','_').replace('.','_')+'__',a['name'])
 return text

def validate_catalog(uri,digest,directory):
 if uri!=MANIFEST_URI or not re.fullmatch('[a-f0-9]{64}',digest or '') or directory!='/test-4':raise ValueError('Exact staged Node14 candidate/test-4 required')
