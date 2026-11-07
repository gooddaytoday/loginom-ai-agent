import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {excelColdExpected,verifyExcelColdSettings} from '../exports-excel-cold.mjs';
import {resolveExportInput,parseExpectedOutputs} from '../expected-outputs.mjs';
const expected=JSON.parse(readFileSync(new URL('../../../docs/node-development/nodes/exports-excel/acceptance/expected.json',import.meta.url)));
expected.package_path='/worker/case.lgp';
expected.export_destination='/worker/cells.xlsx';
test('XLSX catalog keeps the approved task, fixture and sink expectation',()=>{
 const result=spawnSync('python3',['-c',`import importlib.util
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('exports-excel');assert c['prompt'].name=='task.md';assert (c['data']/'cells.csv').is_file();assert c['xlsx'] is True
e=m.expected_for(c,'/worker/case.lgp');assert e['outputs'][0]['output_port'] is None;assert e['outputs'][0]['format']=='xlsx'
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
test('cold XLSX checks the saved sink settings and independently reads its upstream table',()=>{
 const cold=excelColdExpected(expected);assert.equal(parseExpectedOutputs(cold).outputs[0].rows[3].Text,'');
 assert.equal(cold.outputs[0].rows[2].Text,null);
 const graph={complete:true,nodes:[{type:'imports.text',ref:{node_id:'source'},outputs:[0]},{type:'exports.excel',ref:{node_id:'sink'},outputs:[]}],links:[{source:'source',output:0,target:'sink',input:0}]};
 assert.equal(resolveExportInput(graph,{type:'exports.excel'}).node.ref.node_id,'source');
 assert.throws(()=>resolveExportInput(graph));
 const settings={sheet_name:'Данные',header:2,file_type:1,number_format:0,divide_thousands:false};
 assert.equal(verifyExcelColdSettings([{destination:expected.export_destination,excel_settings:settings}],expected),true);
 for(const [key,value]of Object.entries({sheet_name:'Other',header:1,file_type:0,number_format:1,divide_thousands:true}))
  assert.throws(()=>verifyExcelColdSettings([{destination:expected.export_destination,excel_settings:{...settings,[key]:value}}],expected));
 assert.equal(excelColdExpected({output_node_type:'exports.text'}),null);
});

test('Excel import stage1 case resolves its original workbook and leaves unspecified labels free',()=>{
 const r=spawnSync('python3',['-c',`import importlib.util
s=importlib.util.spec_from_file_location('r','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
c=m.scenario('stage1',case_root='docs/node-development/nodes/imports-excel/acceptance');assert c['local_file'].name=='sales.xlsx';assert c['local_file'].is_file()
e=m.expected_for(c,'/worker/import.lgp');assert all(x['label_any'] for x in e['outputs'][0]['columns'])
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});

test('Excel mode catalog uses approved isolated tasks, numeric bytes and both replacement books',()=>{
 const r=spawnSync('python3',['-c',`import importlib.util
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
for mode, task, formats in [('xls','task-xls.md',['xls']),('numeric','task-numeric-cells.md',['xls','xlsx']),('replace','task-replace-workbook.md',['xls','xlsx'])]:
 c=m.scenario('excel-export-'+mode); assert c['prompt'].name==task; assert c['input_files']==['modes.csv']; assert c['base'] is None
 e=m.expected_for(c,'/worker/saved.lgp'); assert [b['format'] for b in e['excel_books']]==formats
 assert all(b['output_port'] is None and b['rows'][0][1]==1234.56789 for b in e['excel_books'])
 assert all(b['number_format']==(1 if mode=='numeric' else 0) for b in e['excel_books'])
`],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('cold Excel mode checks each saved format and numeric display without changing input values',()=>{
 const sink={output_node_type:'exports.excel',output_port:null,format:'xls',sheet_name:'Данные',header:'names',number_format:1,decimal_count:2,divide_thousands:true,export_destination:'/worker/numeric.xls',columns:[{name:'Amount',type:'real'}],rows:[[1234.56789]]};
 const cold=excelColdExpected({package_path:'/worker/saved.lgp',nodes:[],excel_books:[sink]});
 assert.equal(cold.outputs[0].rows[0].Amount,1234.56789);
 const settings={sheet_name:'Данные',header:1,file_type:0,number_format:1,decimal_count:2,divide_thousands:true};
 assert.equal(verifyExcelColdSettings([{destination:sink.export_destination,excel_settings:settings}],sink),true);
 for(const [key,value]of Object.entries({file_type:1,number_format:0,decimal_count:3,divide_thousands:false}))assert.throws(()=>verifyExcelColdSettings([{destination:sink.export_destination,excel_settings:{...settings,[key]:value}}],sink));
});
