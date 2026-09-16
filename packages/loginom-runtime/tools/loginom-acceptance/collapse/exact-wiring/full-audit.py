import json,struct,sys
from pathlib import Path
root=Path(sys.argv[1]);envelope=json.loads((root/'wiring-full-budget-read.json').read_text());r=envelope['result'];life=envelope['lifecycle']
assert r['row_count']==15 and len(r['schema'])==4 and len(r['cells'])==60
assert [s['name'] for s in r['schema']]==['Id','Names','DisplayNames','Values']
assert r['owner_rechecked'] and r['cache_identity_rechecked'] and r['execution']['status']=='completed'
assert life['status']=='completed' and life['pending']==0 and life['requests']==life['releasedRequests']==life['releasedResponses']==60
assert life['receivedBytes']==3600 and life['serializedBytes']<1048576
expected=[(20,9007199254740993),(5,-0.0),(8,'\ufeffA'),(11,True),(7,45361.104166666664),(20,1),(5,1.0),(8,'1'),(11,False),(7,45351.99997827546),(1,None),(1,None),(8,''),(1,None),(1,None)]
for index,cell in enumerate(r['cells']):
 row,col=divmod(index,4);assert cell['row']==row and cell['column']==col
 b=bytes(cell['payload']);tag=struct.unpack('<h',b[:2])[0];assert tag==cell['tag']
 if tag==20:value=struct.unpack('<q',b[2:10])[0]
 elif tag in [5,7]:value=struct.unpack('<d',b[2:10])[0]
 elif tag==8:value=b[16:].decode('utf-8')
 elif tag==11:value=b[2]==1
 elif tag==1:value=None
 else:raise AssertionError('unknown tag')
 if col==0:assert tag==20 and value==row//5+1
 elif col in [1,2]:assert tag==8 and value==['I','R','S','B','D'][row%5]
 else:
  t,v=expected[row];assert t==tag and v==value
  if tag==5:assert struct.pack('<d',value)==struct.pack('<d',v)
  if tag==8:assert cell['decoded']['value']==value
assert len({c['message_id'] for c in r['cells']})==60
after=json.loads((root/'wiring-full-after.json').read_text());assert after['result']['execution']!=r['execution']
def significant(c):
 b=bytes(c['payload']);t=c['tag']
 return (c['row'],c['column'],t,b[2:10] if t in [20,5,7] else b[2:3] if t==11 else b[16:] if t==8 else b'')
assert [significant(c) for c in r['cells']]==[significant(c) for c in after['result']['cells']]
assert after['lifecycle']['requests']==after['lifecycle']['releasedRequests']==after['lifecycle']['releasedResponses']==60
for name in ['wiring-stale-read.json','wiring-owner-change.json']:
 n=json.loads((root/name).read_text());assert n['before']==n['after'] and n['outcome']['accepted'] is False
n=json.loads((root/'wiring-deactivate.json').read_text());assert n['overlapped'] and n['outcome']['accepted'] is False
assert n['lifecycle']['published'] is False and n['lifecycle']['pending']==0 and n['lifecycle']['retired'] is True
assert n['lifecycle']['requests']==n['lifecycle']['releasedRequests']==n['lifecycle']['releasedResponses']==5
print(json.dumps({'reexecute_all_cells':'PASS','stale_owner_deactivate':'PASS','full_RxC':'PASS','rows':15,'columns':4,'cells':60,'DataTypes':'off','leading_UFEFF':'preserved','public_wiring':'NOT_CHECKED'}))
