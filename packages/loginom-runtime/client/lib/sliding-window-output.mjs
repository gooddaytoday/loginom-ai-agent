import {configureSortingOutput} from './sorting-output.mjs';
import {ensureGroupingOutputSources} from './grouping-output-sources.mjs';
const need=(v,m)=>{if(!v)throw Error('Sliding window output: '+m);};
export function slidingWindowOutputOrigins(configuration,sources){
 const fields=configuration.fields;
 need(sources.length===fields.reduce((n,f)=>n+1+f.history+f.horizon,0),'complete output source count required');
 const names=new Set();
 return sources.map(source=>{
  need(!names.has(source.name),'duplicate output source');names.add(source.name);
  const matches=fields.flatMap(f=>{
   if(source.name===f.name)return [{field:f,offset:0}];
   return [['H',f.history,-1],['F',f.horizon,1]].flatMap(([suffix,count,sign])=>{
    const prefix=f.name+'_'+suffix+'_',tail=source.name.slice(prefix.length),n=Number(tail);
    return source.name.startsWith(prefix)&&/^[1-9][0-9]*$/.test(tail)&&n<=count?[{field:f,offset:sign*n}]:[];
   });
  });
  need(matches.length===1&&source.type===matches[0].field.type,'exact typed source origin required: '+source.name);
  return {...source,source_field:matches[0].field.name,offset:matches[0].offset};
 });
}
export async function configureSlidingWindowOutput(channel,c,p,mapping={},request){
 let s=await channel.observe({condition:'sliding window output inventory',readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
 s=await ensureGroupingOutputSources(channel,s);
 need(s.node_mapping.source_identity_verified===true,'verified native source identity required');
 const origins=slidingWindowOutputOrigins(c,s.node_mapping.source_fields);
 // The native output inventory owns column order, including existing nodes.
 return configureSortingOutput(channel,{input_fields:origins},p,mapping,request);
}
