"""Check every row of the owned homogeneous wide diagnostic, not variant_io."""
import copy
import json
from pathlib import Path

def audit(result, previews, owner):
    out = result['output']
    assert result['status'] == 'SUCCEEDED' and result['operation_id'] == 'node16-wide-preserved'
    assert owner['node']['FGuid'] == out['node']['node_id']
    port = out['output']['ports'][0]
    assert owner['port']['FGuid'] == port['port_guid'] == port['table']['port_guid']
    assert port['port'] == 0 and owner['port']['FParam'] == 0 and owner['port']['IsSource'] is True and owner['port']['IsTarget'] is False and owner['store_is_same'] is True
    assert [(c['data']['Name'], c['data']['DataType']) for c in owner['columns']] == [('Id',4),('Names',5),('DisplayNames',5),('Values',4),('DataTypes',4)]
    assert port['row_count'] == 52 and port['sample_rows'] == 10 and not port['sample_complete']
    assert port['fresh'] is True and port['execution_id'] == out['execution']['execution_id']
    assert port['precision']['numbers_verified'] is True
    assert [f['name'] for f in out['configuration']['readback']['transposed']] == [f'F{i:02}' for i in range(26,0,-1)]
    tables = [p for p in previews if p['record_count'] == 52]
    assert tables and all(t['rows'] == tables[0]['rows'] for t in tables)
    rows = tables[0]['rows']
    assert len(rows) == 52 and len({r['record_id'] for r in rows}) == 52
    for i, row in enumerate(rows):
        d = row['data']
        n = 26 - i % 26
        assert set(d) == {'Id','Names','DisplayNames','Values','DataTypes','$id'}
        assert d['Id'] == {'js_type':'number','value':1+i//26}
        assert d['Names'] == d['DisplayNames'] == {'js_type':'string','value':f'F{n:02}'}
        assert d['Values'] == {'js_type':'number' if i<26 else 'null','value':n if i<26 else None}
        assert d['DataTypes'] == {'js_type':'number','value':4}
    for i, row in enumerate(port['sample']):
        assert len(row) == 5 and row[3]['value'] == str(26-i) and row[3]['precision']=='exact_integer'
    return {'homogeneous_wide_diagnostic':'PASS','rows_verified':52,'cells_verified':260,'variant_io':'not_covered'}

def verify_negative(result, previews, owner):
    mutations=[lambda r,p,o:o['node'].update(FGuid='other'),lambda r,p,o:o['columns'][3]['data'].update(DataType=6),
               lambda r,p,o:r['output']['output']['ports'][0].update(execution_id='old'),
               lambda r,p,o:p[0]['rows'].pop(),lambda r,p,o:p[0]['rows'][0]['data']['Values'].update(value=25),
               lambda r,p,o:p[0]['rows'][30]['data']['Values'].update(value=0),
               lambda r,p,o:r['output']['configuration']['readback']['transposed'].reverse()]
    for change in mutations:
        r,p,o=copy.deepcopy((result,previews,owner));change(r,p,o)
        try:audit(r,p,o)
        except (AssertionError,KeyError):continue
        raise AssertionError('negative wide mutation was accepted')
    return len(mutations)

if __name__ == '__main__':
    import sys
    root=Path(sys.argv[1]);r,p,o=[json.loads((root/name).read_text()) for name in ['execute-wide-saved.json','preview-wide-full.json','preview-wide-owner.json']]
    report=audit(r,p,o);report['negative_mutations_rejected']=verify_negative(r,p,o)
    print(json.dumps(report,indent=2))
