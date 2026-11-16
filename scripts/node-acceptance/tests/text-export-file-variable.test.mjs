import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const repo=new URL('../../../',import.meta.url).pathname;
const python=code=>spawnSync('python3',['-c',`import importlib.util,json
s=importlib.util.spec_from_file_location('runner','scripts/node-acceptance/run-check.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
${code}`],{cwd:repo,encoding:'utf8'});

test('text-export-file-variable registers the export task, one input file and the stock export expectation',()=>{
 const r=python(`c=m.scenario('text-export-file-variable')
assert c['prompt'].name=='task-file-variable-export.md' and c['input_files']==['sales-2026-11-05.csv'] and c['base'] is None
assert (c['data']/'sales-2026-11-05.csv').is_file() and c['text_file_variable'] is True
t=c['prompt'].read_text();assert t.count('{{EXPORTS_DIR}}')==1 and t.count('\`report-\`')==1
e=m.expected_for(c,'/w/p.lgp');assert e['package_path']=='/w/p.lgp'
assert [o['export_destination'] for o in e['outputs']]==['{{EXPORTS_DIR}}/report-2026-11-05.csv','{{EXPORTS_DIR}}/report-2026-11-06.csv']
assert e['outputs'][0]['rows']==e['outputs'][1]['rows'] and e['outputs'][0]['rows'][1]['Item']=='Кофе, молотый'
assert e['text_binding']['variable']=='ReportFile' and e['null_marker']=='NULL'`);
 assert.equal(r.status,0,r.stdout+r.stderr);
});

test('export oracle checks typed first-stage rows, header names, LF and no BOM',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'file-variable-oracle-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const oracle=join(repo,'docs/node-development/nodes/text-import/acceptance/file-variable/oracle.py');
 const fixtures=join(repo,'docs/node-development/nodes/text-import/fixtures/file-variable/');
 assert.equal(spawnSync('python3',['-B',oracle,'--export','--check'],{encoding:'utf8'}).status,0);
 const first=await readFile(fixtures+'sales-2026-11-05.csv'),second=await readFile(fixtures+'sales-2026-11-06.csv');
 const check=async bytes=>{const path=join(dir,'actual.csv');await writeFile(path,bytes);return spawnSync('python3',['-B',oracle,'--export','--actual',path],{encoding:'utf8'});};
 assert.equal((await check(first)).status,0);
 for(const bytes of [second,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),first]),Buffer.from(first.toString().replaceAll('\n','\r\n')),
  Buffer.from(first.toString().replace('Id,Item,Amount','"Id","Item","Amount"')),Buffer.from(first.toString().replace('12','13'))])
  assert.notEqual((await check(bytes)).status,0);
});

test('file-variable checker requires one bound Export, both destinations, reject policy and no literal path',()=>{
 const r=python(`d=['/w/r-report-2026-11-05.csv','/w/r-report-2026-11-06.csv']
def reply(dest,node='sink'):
    return dict(status='SUCCEEDED',node=dict(node_id=node),execution=dict(status='completed'),output=dict(file_artifacts=[dict(destination=dest,bytes=58)]),
        configuration=dict(readback=dict(kind='text_export',destination=dest,file_name_variable=dict(kind='variable',name='ReportFile'),destination_check=dict(destination=dest,overwrite='reject',existed=False))))
def event(parameters):
    return (0,dict(type='tool_use',part=dict(tool='loginom_dock_node_apply',state=dict(input=dict(target=dict(type='exports.text'),parameters=parameters)))))
good=[(1,reply(d[0])),(2,reply(d[1]))]
events=[event(dict(file_name_variable=dict(kind='variable',name='ReportFile'))),event({})]
m.check_text_file_variable(good,events,d)
def refused(replies,events,code):
    try: m.check_text_file_variable(replies,events,d)
    except AssertionError as e: assert str(e).startswith(code),str(e);return
    raise SystemExit('accepted '+code)
refused([(1,reply(d[0])),(2,reply(d[1],'other'))],events,'TEXT_FILE_VARIABLE_SAME_NODE')
refused(good,events+[event(dict(destination=d[1]))],'TEXT_FILE_VARIABLE_LITERAL_DESTINATION')
refused([good[0]],events,'TEXT_FILE_VARIABLE_EXPORT_MISSING')
unbound=reply(d[1]);del unbound['configuration']['readback']['file_name_variable']
refused([good[0],(2,unbound)],events,'TEXT_FILE_VARIABLE_EXPORT_MISSING')
replaced=reply(d[1]);replaced['configuration']['readback']['destination_check']['overwrite']='replace'
refused([good[0],(2,replaced)],events,'TEXT_FILE_VARIABLE_REJECT_POLICY')`);
 assert.equal(r.status,0,r.stdout+r.stderr);
});
