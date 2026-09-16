"""Independent public native-value audit. No JavaScript decoder/adapter reuse."""
import copy, hashlib, json, struct, sys
from pathlib import Path
SCHEMA=[('Id','Id','integer'),('Names','Имена','string'),('DisplayNames','Метки','string'),('Values','Значения','variant')]
VALUES=[(20,9007199254740993),(5,-0.0),(8,'\ufeffA'),(11,True),(7,45361.104166666664),(20,1),(5,1.0),(8,'1'),(11,False),(7,45351.99997827546),(1,None),(1,None),(8,''),(1,None),(1,None)]
TYPES={1:'null',20:'integer',5:'real',8:'string',11:'boolean',7:'datetime'}
ENC={1:'null',20:'signed-int64-le',5:'ieee754-binary64-le',8:'utf8',11:'boolean8',7:'oadate-binary64-le'}
REP={1:'native_null',20:'decimal_integer',5:'binary64_decimal',8:'native_string',11:'native_boolean',7:'native_oadate_binary64_le'}
def cell(c,expected,column_type):
 tag,value=expected;native=c['native']
 assert c['type']==column_type and c['cell_type']==TYPES[tag] and native['tag']==tag
 assert c['precision']=='exact_native' and c['is_null']==(tag==1) and c['representation']==REP[tag]
 assert native['encoding']==ENC[tag]
 if tag==1:
  assert c['value'] is None and set(native)=={'tag','encoding'}
 elif tag==8:
  assert c['value']==value and native['utf8_hex']==value.encode('utf-8').hex() and set(native)=={'tag','encoding','utf8_hex'}
 elif tag==11:
  assert c['value'] is value and native['bytes_le']==('01' if value else '00') and set(native)=={'tag','encoding','bytes_le'}
 else:
  assert native['bits']==64
  expected_bytes=struct.pack('<q' if tag==20 else '<d',value).hex()
  assert native['bytes_le']==expected_bytes
  if tag==20:
   assert c['value']==str(value) and c['decimal']==str(value)
  elif tag==5:
   assert isinstance(c['value'],str) and c['decimal']==c['value'] and struct.pack('<d',float(c['value'])).hex()==expected_bytes
  else:
   assert c['value']==expected_bytes and c['timezone']=='unspecified'
   assert native['semantic_scope']=='native_serial_only' and native['temporal_profile']=='loginom-7.4.2-native-oadate'
   assert native['epoch_verified'] is False and native['civil_time_verified'] is False
  assert set(native)==({'tag','encoding','bits','bytes_le'}|({'semantic_scope','temporal_profile','epoch_verified','civil_time_verified'} if tag==7 else set()))

def audit(body,mode='mixed'):
 assert body['result_version']=='user-v1' and body['status']=='SUCCEEDED' and body['cleanup_complete'] is True
 out=body['output'];assert out['status']=='complete' and out['workflow_returned'] is True
 p=out['ports'][0];assert len(out['ports'])==1 and p['fresh'] is True and p['port']==0
 assert [(c['name'],c['label'],c['type']) for c in p['schema']]==SCHEMA
 assert [c['index'] for c in p['schema']]==list(range(4))
 expected=[]
 if mode in ['mixed','ignore']:
  for row,item in enumerate(VALUES):
   if mode=='ignore' and item[0]==1:continue
   expected.append([(20,row//5+1),(8,['I','R','S','B','D'][row%5]),(8,['I','R','S','B','D'][row%5]),item])
 elif mode in ['nulls','nulls-ignore','all-null','all-null-ignore']:
  for row,item in enumerate([(1,None)]*5 if mode.startswith('all-null') else VALUES[10:]):
   if mode.endswith('-ignore') and item[0]==1:continue
   expected.append([(20,1),(8,['I','R','S','B','D'][row]),(8,['I','R','S','B','D'][row]),item])
 else:assert mode=='empty'
 rows=p['exact_table']['rows'];assert len(rows)==p['row_count']==len(expected) and p['exact_table']['complete'] is True
 assert p['sample']==rows[:10] and p['sample_rows']==min(10,len(rows)) and p['sample_complete']==(len(rows)<=10)
 for row,want in zip(rows,expected):
  assert len(row)==4
  for c,e,s in zip(row,want,SCHEMA):cell(c,e,s[2])
 assert p['read_coverage']=={'cells_read':len(rows)*4,'rows_read':len(rows),'columns_read':4 if rows else 0,'table_complete':True}
 assert p['read_consistency']=={'kind':'observed_local','changed':False,'exclusive_operation':True,'stability_basis':'owned_static_completed_fixture','atomic_snapshot':False,'unobserved_aba_excluded':False}
 assert p['cell_precision']=={'cells':'exact_native','temporal':'native_serial_only'}
 b=p['binding'];assert b['execution']==body['execution'] and b['execution']['status']=='completed'
 assert all(b[k]==body['node'][k] for k in ['document_id','workflow_id','node_id'])
 assert b['port_guid']==p['port_guid'] and b['execution']['execution_id']==p['execution_id']==out['execution_id']
 assert b['read_id'] and b['package_id'] and b['execution']['execution_id'].startswith(b['document_id']+':')
 c=body['configuration']['readback'];assert c['kind']=='collapse' and c['mode']=='unpivot'
 assert [v['name'] for v in c['information']]==['Id'] and [v['name'] for v in c['transposed']]==['I','R','S','B','D']
 assert c['ignore_empty']==(mode in ['ignore','nulls-ignore','all-null-ignore'])
 assert [v['name'] for v in c['output_mapping']['fields'] if not v['excluded']]==[v[0] for v in SCHEMA]
 assert any(v['name']=='DataTypes' and v['excluded'] for v in c['output_mapping']['fields'])
 return len(rows)*4

def main():
 path=Path(sys.argv[1]);mode=sys.argv[2] if len(sys.argv)>2 else 'mixed';body=json.loads(path.read_text());count=audit(body,mode)
 denied=0
 if mode=='mixed':
  changes=[lambda b:b['output']['ports'][0]['exact_table']['rows'].pop(),lambda b:b['output']['ports'][0]['exact_table']['rows'][-1].pop(),
   lambda b:b['output']['ports'][0]['exact_table']['rows'][0][3].__setitem__('value','9007199254740992'),
   lambda b:b['output']['ports'][0]['exact_table']['rows'][1][3].__setitem__('value','0'),
   lambda b:b['output']['ports'][0]['exact_table']['rows'][2][3].__setitem__('value','A'),
   lambda b:b['output']['ports'][0]['exact_table']['rows'][5][3].__setitem__('cell_type','string'),
   lambda b:b['output']['ports'][0]['exact_table']['rows'][4][3]['native'].__setitem__('epoch_verified',True),
   lambda b:b['output']['ports'][0]['exact_table']['rows'][10][3].__setitem__('value',''),
   lambda b:b['output']['ports'][0]['exact_table']['rows'][12][3].__setitem__('value',None),
   lambda b:b['output']['ports'][0]['binding']['execution'].__setitem__('execution_id','foreign'),
   lambda b:b['output']['ports'][0]['binding'].__setitem__('node_id','foreign'),
   lambda b:b['output']['ports'][0]['read_consistency'].__setitem__('exclusive_operation',False),
   lambda b:b['output']['ports'][0]['read_coverage'].__setitem__('table_complete',False)]
  for mutate in changes:
   bad=copy.deepcopy(body);mutate(bad)
   try:audit(bad,mode)
   except (AssertionError,KeyError,TypeError):denied+=1
   else:raise AssertionError('Evidence mutation escaped independent audit')
 result={'status':'PASS','mode':mode,'cells':count,'rows':count//4,'columns':4,'negative_mutations_rejected':denied,'artifact':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
