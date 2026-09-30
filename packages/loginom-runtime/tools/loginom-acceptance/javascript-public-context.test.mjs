import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {javascriptContextDataLabel,javascriptContextDataComment,verifyJavascriptPublicContext} from './javascript-public-context.mjs';
import {javascriptDiscoveryProbe} from './javascript-discovery-probes.mjs';
import {javascriptContextReply} from '../../client/lib/javascript-context-read.mjs';
import {createRedactor} from '../../client/lib/redact.mjs';
const node={document_id:'doc',workflow_id:'workflow',node_id:'node'};
function fixture(mode,manual){
  const probe=javascriptDiscoveryProbe('p1-business-'+mode+'-base');
  const source=probe.source+(manual?javascriptContextDataComment:'');
  const schemas=[[['RowID','integer'],['Customer','string'],['Qty','integer'],['UnitPriceCents','integer'],['DiscountPct','integer']],
    probe.schema.map(c=>[c.name,c.type])];
  const ports=schemas.map((schema,index)=>{
    const source_fields=schema.map(([name,type],i)=>({index:i,name,label:name,type,required:true,field_id:String(i)}));
    return {direction:['input','output'][index],port:0,port_guid:'port'+index,autosync:index===0||!manual,
      native_reciprocity_verified:true,source_fields,target_fields:source_fields.map((f,i)=>({...f,required:false,...(index===1?{excluded:false}:{}),
        label:index===1&&manual&&i===2?javascriptContextDataLabel:f.label,source:{...f}}))};
  });
  return {source,reply:javascriptContextReply({owner:{...node,operation_id:'context',ui_epoch:1},source,
    settings:{generation:mode==='code'},ports,redactor:createRedactor()})};
}
for(const mode of ['code','declared'])for(const manual of [false,true])
  test('fixed context oracle verifies '+mode+' complete current source/mappings/data '+manual,()=>{
    const f=fixture(mode,manual),expected={node,schemaMode:mode,source:f.source,manual};
    assert.equal(verifyJavascriptPublicContext(f.reply,expected).structuredContent,f.reply);
    for(const mutate of [r=>r.source.text='different',r=>r.owner.node_id='foreign',r=>r.ports[0].source_fields.reverse(),
      r=>r.ports[0].target_fields[1].name='CustomerKey',r=>r.ports[1].target_fields[2].label='foreign',
      r=>r.ports[1].source_fields[3].type='integer',r=>r.ports[1].target_fields[3].source.field_id='foreign',
      r=>r.explicit_execute_requested=true,r=>r.content_is_data=false,r=>r.ports[1].source_fields.pop()]){
      const changed=structuredClone(f.reply);mutate(changed);assert.throws(()=>verifyJavascriptPublicContext(changed,expected));
    }
  });
const entry=fileURLToPath(new URL('./javascript-public-context-live.mjs',import.meta.url));
for(const args of [[],['--case','foreign'],['--case','context-code','--source','x'],['--case','context-declared','--headless','true'],
  ['--case','context-code','--x11-no-focus','true']])test('context entrypoint refuses uncontrolled inputs '+JSON.stringify(args),()=>{
    const result=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});assert.equal(result.status,1);
    assert.match(result.stderr,/Fixed public context|Only assigned public context/);
  });
