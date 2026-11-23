import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('autodetection checks all three files, exact values and unchanged cold expectations',()=>{
 const result=spawnSync('python3',['-B','-c',`
import json, runpy
r=runpy.run_path('scripts/node-acceptance/run-check.py',run_name='test')
c=r['scenario']('text-autodetect-types')
oracle=runpy.run_path(str(c['source']/'oracle.py'),run_name='test')
e=r['expected_for'](c,'/own/types.lgp')
assert e==r['expected_for'](c,'/own/types.lgp',cold=True)
assert c['export_count']==len(e['outputs'])==3
assert c['input_files']==['ru.csv','iso.csv','slash.csv']
for output,case in zip(e['outputs'],['iso','slash','ru']):
 frozen=oracle['expected'](case)
 assert output['columns']==frozen['columns'] and output['rows']==frozen['rows']
 assert len(output['rows'])==4 and output['column_order']=='exact'
 assert output['columns'][0]['type']=='string'
 assert output['rows'][0][output['columns'][0]['name']]=='0012'
 assert output['rows'][2][output['columns'][4]['name']] is None
 assert output['rows'][1][output['columns'][4]['name']] is False
assert e['outputs'][-1]['output_node_type']=='export_input'
assert [o['output_node_label'] for o in e['outputs'][:2]]==['ISO','Slash']
assert e['outputs'][-1]['rows'][0]['RuAmount']==1234.5
assert 'Москва' in (c['data']/'ru.csv').read_text(encoding='cp1251')
assert not any(word in c['prompt'].read_text() for word in ['1234.5','expected.json','oracle.py'])
`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr+result.stdout);
});
