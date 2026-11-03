import {configureSortingOutput} from './sorting-output.mjs';
import {ensureGroupingOutputSources} from './grouping-output-sources.mjs';
const need=(v,m)=>{if(!v)throw Error('Smoothing output: '+m);};
export function smoothingOutputOrigins(configuration,sources){
 const input=configuration.input_fields,active=configuration.fields.filter(f=>f.used),names=new Set();
 need(sources.length===input.length+active.length,'complete source count required');
 return sources.map(source=>{
  need(!names.has(source.name),'duplicate source');names.add(source.name);
  const original=input.find(f=>f.name===source.name),smoothed=active.find(f=>f.name+'_S'===source.name);
  need(!!original!==!!smoothed&&source.type===(original?.type??'real'),'exact typed source origin required: '+source.name);
  return {...source,source_field:(original??smoothed).name,smoothed:!!smoothed};
 });
}
export async function configureSmoothingOutput(channel,c,p,mapping={},request){
 let s=await channel.observe({condition:'smoothing output inventory',readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
 s=await ensureGroupingOutputSources(channel,s);
 need(s.node_mapping.source_identity_verified===true,'verified native source identity required');
 return configureSortingOutput(channel,{input_fields:smoothingOutputOrigins(c,s.node_mapping.source_fields)},p,mapping,request);
}
