import test from 'node:test';
import assert from 'node:assert/strict';
import {validateJoinInlineSources} from '../lib/join-node.mjs';
import {verifyGroupingStaleRemoval} from '../lib/grouping-inline-mapping.mjs';
const field=name=>({name,label:name,type:'string',record_id:name,required:false});
function fixture(){
 const configuration={input_fields:[[field('KeyLeft'),field('Part')],[field('KeyRight'),field('RValue')]],keys:[{left:'KeyLeft',right:'KeyRight'}],include_joined_keys:false};
 const source_fields=[...configuration.input_fields[0],configuration.input_fields[1][1]];
 const target_fields=source_fields.map((source,i)=>({name:source.name,label:source.label,type:source.type,record_id:'t'+i,field_id:'f'+i,source,exclusion_source:null,excluded:false,inherited:false,required:false}));
 target_fields[1]={...target_fields[1],source:null,exclusion_source:source_fields[1],excluded:true};
 target_fields.push(target_fields.splice(1,1)[0]);
 target_fields.splice(1,0,{...target_fields[0],name:'KeyRight',record_id:'obsolete',source:null});
 target_fields.forEach((f,i)=>{f.index=i;f.group_index=f.excluded?0:i;});
 return {configuration,native:{verified:true,inventory_complete:true,source_identity_verified:true,autosync:false,node_context:{node_id:'owned'},source_fields,target_fields}};
}
test('Join conditional output prunes obsolete right key and retains the excluded left field',()=>{
 const {configuration,native}=fixture(),obsolete=validateJoinInlineSources(configuration,native);
 assert.deepEqual(obsolete.map(f=>f.name),['KeyRight']);
 const after=structuredClone(native);after.target_fields=after.target_fields.filter(f=>f.record_id!=='obsolete').map((f,i)=>({...f,index:i,group_index:f.excluded?0:i}));
 assert.equal(verifyGroupingStaleRemoval(native,after,obsolete[0]),true);
 assert.deepEqual(validateJoinInlineSources(configuration,after),[]);
 assert.equal(after.target_fields[2].excluded,true);
});
test('Join conditional output refuses invented exclusion sources or inherited fields',()=>{
 for(const mutate of [n=>n.target_fields[3].exclusion_source=null,n=>n.target_fields[3].exclusion_source={...n.source_fields[1],record_id:'foreign'},n=>n.target_fields[3].source=n.source_fields[1],n=>n.target_fields[0].inherited=true]){
  const {configuration,native}=fixture();mutate(native);assert.throws(()=>validateJoinInlineSources(configuration,native));
 }
});
