"""Independent bytes/semantics audit for the observed prototype cases, not release acceptance."""
import json,struct,sys,datetime,copy
from pathlib import Path

def audit(mixed,bounds,date):
    for r,count in [(mixed,15),(bounds,8)]:
        assert r['method']==321 and r['interface']==116 and r['port']==0
        assert r['row_count']==count and len(r['cells'])==count
        assert r['execution']['status']=='completed' and r['execution']['execution_id'].startswith(r['document_id']+':')
        assert r['owner_rechecked'] and r['cache_identity_rechecked']
        assert all(f['name']!='DataTypes' for f in r['schema'])
        assert len({c['message_id'] for c in r['cells']})==count
        assert [c['row'] for c in r['cells']]==list(range(count))
        for c in r['cells']:
            assert c['frame_size']==60 and len(c['payload'])==c['decoded']['consumed_bytes']
            assert struct.unpack('<h',bytes(c['payload'][:2]))[0]==c['tag']==c['decoded']['tag']
    tags=[7,11,8,20,5,1,11,8,20,5,1,1,1,1,1]
    assert [c['tag'] for c in mixed['cells']]==tags
    c=mixed['cells'];assert struct.unpack('<q',bytes(c[3]['payload'][2:10]))[0]==1
    assert struct.unpack('<d',bytes(c[4]['payload'][2:10]))[0]==1.0
    assert bytes(c[2]['payload'][16:])==b'1' and c[2]['decoded']['value']=='1'
    assert c[1]['payload'][2]==1 and c[6]['payload'][2]==0
    assert struct.unpack('<i',bytes(c[7]['payload'][10:14]))[0]==0
    assert struct.unpack('<d',bytes(c[9]['payload'][2:10]))[0]==1.2345678901234567
    oadate=struct.unpack('<d',bytes(c[0]['payload'][2:10]))[0]
    ms=round((oadate-25569)*86400000)
    dt=datetime.datetime.fromtimestamp(ms/1000,datetime.timezone.utc)
    civil=[dt.year,dt.month,dt.day,dt.hour,dt.minute,dt.second,dt.microsecond//1000]
    assert civil==[2024,2,29,23,59,58,123]==date['dates'][0]['local']
    assert date['dates'][0]['epoch_ms']==ms+date['dates'][0]['offset']*60000
    ints=[9007199254740993,9223372036854775807,-9223372036854775808,-9007199254740993]
    realhex=['0000000000000080','ffffffffffffef7f','0100000000000000','000000200000f03f']
    for i,n in enumerate(ints):
        item=bounds['cells'][2*i];assert item['tag']==20 and struct.unpack('<q',bytes(item['payload'][2:10]))[0]==n
        assert item['decoded']['decimal']==str(n)
        real=bounds['cells'][2*i+1];assert real['tag']==5 and bytes(real['payload'][2:10]).hex()==realhex[i]
    assert bounds['cells'][1]['decoded']['representation']=='-0'

if __name__=='__main__':
    root=Path(sys.argv[1]);m=json.loads((root/'prototype-complete-15.json').read_text());b=json.loads((root/'prototype-bounds-raw.json').read_text());d=json.loads((root/'prototype-date-cache.json').read_text());audit(m,b,d)
    mutations=[lambda m,b,d:m['cells'][3].update(tag=5),lambda m,b,d:m['cells'][2]['decoded'].update(value=1),lambda m,b,d:b['cells'][0]['decoded'].update(decimal='9007199254740992'),lambda m,b,d:b['cells'][1]['decoded'].update(representation='0'),lambda m,b,d:d['dates'][0]['local'].__setitem__(6,0),lambda m,b,d:m['cells'][0]['payload'].pop(),lambda m,b,d:m['cells'][0].update(message_id=m['cells'][1]['message_id']),lambda m,b,d:m.update(port=1)]
    for mutate in mutations:
        values=copy.deepcopy((m,b,d));mutate(*values)
        try:audit(*values)
        except (AssertionError,struct.error):continue
        raise AssertionError('mutation accepted')
    print(json.dumps({'observed_cases':'PASS','negative_mutations_rejected':len(mutations),'live_real32':'NOT_OBSERVED','full_variant_acceptance':'BLOCKED'},indent=2))
