import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {javascriptContextDataLabel,javascriptContextDataComment,verifyJavascriptPublicContext,javascriptContextRenamedSource} from './javascript-public-context.mjs';
import {javascriptDiscoveryProbe} from './javascript-discovery-probes.mjs';
import {javascriptContextReply} from '../../client/lib/javascript-context-read.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'node'};
function fixture(mode,manual,inputVariant='base',pending=false){
  const probe=javascriptDiscoveryProbe('p1-business-'+mode+'-base');
  const source=probe.source+(manual?javascriptContextDataComment:'');
  const schemas=[[['RowID','integer'],['Customer','string'],['Qty','integer'],['UnitPriceCents','integer'],['DiscountPct','integer']],
    probe.schema.map(c=>[c.name,c.type])];
  const ports=schemas.map((schema,index)=>{
    const source_fields=schema.map(([name,type],i)=>({index:i,name,label:name,type,required:true,field_id:String(i)}));
    const ordered=index===0&&inputVariant==='reordered'?['DiscountPct','Customer','UnitPriceCents','RowID','Qty']
      .map((name,i)=>({...source_fields.find(f=>f.name===name),index:i})):source_fields;
    return {direction:['input','output'][index],port:0,port_guid:'port'+index,autosync:index===0||!manual,
      native_reciprocity_verified:true,source_fields:ordered,target_fields:source_fields.map((f,i)=>({...f,required:false,...(index===1?{excluded:false}:{}),
        ...(index===0&&inputVariant==='renamed'&&i===1?{name:'CustomerNow',origin_type:1}:{}),
        label:index===1&&manual&&i===2?javascriptContextDataLabel:f.label,source:{...ordered.find(sf=>sf.name===f.name)}}))};
  });
  if(pending)Object.assign(ports[1],{schema_state:'source_pending',configured_inventory_verified:true,
    native_reciprocity_verified:false,source_fields:[],target_fields:ports[1].target_fields.map((f,i)=>({...f,group_index:i,
      inherited:false,exclusion_source:null,data_kind:f.type==='integer'?'Непрерывный':'Дискретный',source:null}))});
  return {source,reply:javascriptContextReply({owner:{...node,operation_id:'context',ui_epoch:1},source,
    settings:{generation:mode==='code'},ports,redactor:createRedactor()})};
}
for(const mode of ['code','declared'])for(const manual of [false,true])for(const inputVariant of ['base','reordered','renamed'])
  test('fixed context oracle verifies '+mode+' complete current source/mappings/data '+manual+' '+inputVariant,()=>{
    const f=fixture(mode,manual,inputVariant),expected={node,schemaMode:mode,source:f.source,manual,inputVariant};
    assert.equal(verifyJavascriptPublicContext(f.reply,expected).structuredContent,f.reply);
    for(const mutate of [r=>r.source.text='different',r=>r.owner.node_id='foreign',r=>r.ports[0].source_fields.reverse(),
      r=>r.ports[0].target_fields[1].name='CustomerKey',r=>r.ports[1].target_fields[2].label='foreign',
      r=>r.ports[1].source_fields[3].type='integer',r=>r.ports[1].target_fields[3].source.field_id='foreign',
      r=>r.explicit_execute_requested=true,r=>r.content_is_data=false,r=>r.ports[1].source_fields.pop()]){
      const changed=structuredClone(f.reply);mutate(changed);assert.throws(()=>verifyJavascriptPublicContext(changed,expected));
    }
  });
for(const mode of ['code','declared'])test('renamed source uses observed Name, retains old context and rejects label/stale/foreign data: '+mode,()=>{
  const f=fixture(mode,false,'renamed'),original=structuredClone(f.reply);
  const source=javascriptContextRenamedSource(f.reply,node);
  assert.equal(source,f.source.replace('InputTable.Get(row,"Customer")','InputTable.Get(row,"CustomerNow")')+javascriptContextDataComment);
  assert.deepEqual(f.reply,original);assert.ok(f.reply.source.text.includes('InputTable.Get(row,"Customer")'));
  for(const mutate of [r=>r.ports[0].target_fields[1].name='Customer',r=>r.ports[0].target_fields[1].label='CustomerNow',
    r=>r.ports[0].target_fields[1].source.name='Other',r=>r.ports[0].target_fields[1].origin_type=0,
    r=>r.owner.node_id='foreign',r=>r.content_is_data=false,r=>r.explicit_execute_requested=true,
    r=>r.source.source_sha256='0'.repeat(64),r=>r.source.delivery='separate_read_required',
    r=>r.ports[0].native_reciprocity_verified=false,r=>r.ports[0].target_fields.push({...r.ports[0].target_fields[1]})]){
    const changed=structuredClone(f.reply);mutate(changed);assert.throws(()=>javascriptContextRenamedSource(changed,node));
  }
});
const entry=fileURLToPath(new URL('./javascript-public-context-live.mjs',import.meta.url));
for(const args of [[],['--case','foreign'],['--case','context-code','--source','x'],['--case','context-declared','--headless','true'],
  ['--case','context-code','--x11-no-focus','true'],['--case','context-code-renamed','--name','Anything'],
  ['--case','context-declared-renamed','--source','foreign'],['--case','context-code-renamed','--headless','true']])test('context entrypoint refuses uncontrolled inputs '+JSON.stringify(args),()=>{
    const result=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});assert.equal(result.status,1);
    assert.match(result.stderr,/Fixed public context|Only assigned public context/);
  });

for(const mode of ['code','declared'])test('fixed oracle verifies opt-in pending old source and corrects solely from public technical Name: '+mode,()=>{
  const f=fixture(mode,true,'renamed',true),expected={node,schemaMode:mode,source:f.source,manual:true,inputVariant:'renamed',configuredOutput:true};
  assert.equal(verifyJavascriptPublicContext(f.reply,expected).structuredContent,f.reply);
  assert.equal(javascriptContextRenamedSource(f.reply,node),f.source.replace('InputTable.Get(row,"Customer")','InputTable.Get(row,"CustomerNow")')+javascriptContextDataComment);
  assert.throws(()=>verifyJavascriptPublicContext(f.reply,{...expected,configuredOutput:false}));
  for(const mutate of [r=>r.observation_scope='current_owned_source_and_materialized_ports',
    r=>r.ports[1].native_reciprocity_verified=true,r=>r.ports[1].schema_state='complete',
    r=>r.ports[1].target_fields[0].source={},r=>r.ports[1].source_fields=[{}],
    r=>r.ports[0].target_fields[1].label='CustomerNow',r=>r.ports[1].configured_inventory_verified=false,
    r=>r.ports[1].target_fields[2].inherited=true,r=>r.ports[1].target_fields[2].label='foreign']){
    const changed=structuredClone(f.reply);mutate(changed);assert.throws(()=>verifyJavascriptPublicContext(changed,expected));
  }
});
