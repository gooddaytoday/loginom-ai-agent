"""Independent serialization check against native bytes, not a live acceptance gate."""
import json,struct,sys
from pathlib import Path
fixtures=json.loads((Path(__file__).parent/'observed.json').read_text())
results=json.loads(Path(sys.argv[1]).read_text());count=0
for fixture,result in zip(fixtures,results,strict=True):
    assert result['sha256']==fixture['sha256'] and result['source']==fixture['source']
    for source,cell in zip(fixture['cells'],result['cells'],strict=True):
        data=bytes(source['payload']);tag=struct.unpack('<h',data[:2])[0]
        assert cell['native']['tag']==tag and cell['precision']=='exact_native' and cell['type']=='variant'
        assert cell['cell_type']=={1:'null',5:'real',7:'datetime',8:'string',11:'boolean',20:'integer'}[tag]
        if tag==20:assert str(struct.unpack('<q',data[2:10])[0])==cell['value']
        if tag==5:assert struct.pack('<d',float(cell['value']))==data[2:10]
        if tag in [5,7,20]:assert cell['native']['bytes_le']==data[2:10].hex()
        if tag==7:
            assert cell['value']==data[2:10].hex() and cell['native']['semantic_scope']=='native_serial_only'
            assert cell['native']['epoch_verified'] is False and cell['native']['civil_time_verified'] is False
            assert 'epoch_ms' not in cell and 'iso' not in cell and cell['timezone']=='unspecified'
        if tag==8:assert cell['value']==data[16:].decode('utf-8') and cell['native']['utf8_hex']==data[16:].hex()
        if tag==11:assert cell['value'] is (data[2]==1)
        if tag==1:assert cell['value'] is None and cell['is_null'] is True
        assert 'payload_hex' not in cell['native'] # reserved slots must not escape
        count+=1
assert count==38
print(json.dumps({'independent_scalar_serialization':'PASS','cells':count,'live_table_acceptance':'NOT_CLAIMED'}))
