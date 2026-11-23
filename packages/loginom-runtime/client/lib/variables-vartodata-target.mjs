// Loginom derives VarToData's caption on its first variable link, and appends
// UnionVariables' second set on its second link. Restore only those captions
// for comparison after proving the entire native graph and retained first edge.
// Self-contained because the admitted browser link primitive serializes this function.
export function normalizeVariablesToTableLinkGraph(before,after,edge){
 const unchanged=()=>after;
 if(!before?.complete||!after?.complete||edge?.kind!=='variables'||![0,1].includes(edge.input))return unchanged();
 const one=(g,id)=>{const ns=g.nodes?.filter(n=>n.ref?.node_id===id);return ns?.length===1?ns[0]:null;};
 const source=one(before,edge.source),target=one(before,edge.target),current=one(after,edge.target);
 const table=edge.input===0&&target?.type==='variables.to_table'&&target.label==='Переменные в таблицу'
  &&current?.label?.startsWith('В столбцы: ')&&current.label.length>'В столбцы: '.length;
 const names=s=>typeof s==='string'&&/^[A-Za-z_][A-Za-z_0-9]*(?:, [A-Za-z_][A-Za-z_0-9]*)*$/.test(s);
 const union=target?.type==='variables.column_union'&&target.inputs?.length===0&&target.outputs?.length===0
  &&target.variable_inputs?.length===2&&target.variable_inputs.every((p,i)=>p.kind==='variables'&&p.port===i)
  &&target.variable_outputs?.length===1&&target.variable_outputs[0].kind==='variables'&&target.variable_outputs[0].port===0
  &&names(current?.label)&&(edge.input===0?target.label==='Соединение (переменные)':names(target.label)&&current.label.startsWith(target.label+', '));
 if(!source||!(table||union)||current?.type!==target.type)return unchanged();
 const incident=[...(before.links??[]),...(before.variable_links??[])].filter(e=>e.source===edge.target||e.target===edge.target);
 if(edge.input===0?incident.length!==0:!union||incident.length!==1)return unchanged();
 if(edge.input===1){
  const first=incident[0],prior=one(before,first.source),ports=prior?.variable_outputs?.filter(p=>p.kind==='variables'&&p.port===first.output);
  if(first.kind!=='variables'||first.target!==edge.target||first.input!==0||first.source===edge.source||ports?.length!==1
   ||first.source_port_guid!==ports[0].port_guid||first.target_port_guid!==target.variable_inputs[0].port_guid)return unchanged();
 }
 const outputs=source.variable_outputs?.filter(p=>p.kind==='variables'&&p.port===edge.output),inputs=target.variable_inputs?.filter(p=>p.kind==='variables'&&p.port===edge.input);
 if(outputs?.length!==1||inputs?.length!==1||![outputs[0].port_guid,inputs[0].port_guid].every(v=>typeof v==='string'&&v.length>0))return unchanged();
 const wanted={...edge,source_port_guid:outputs[0].port_guid,target_port_guid:inputs[0].port_guid};
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 const matches=(after.variable_links??[]).filter(e=>same(e,wanted));
 if(matches.length!==1)return unchanged();
 const restored={...after,nodes:after.nodes.map(n=>n.ref.node_id===edge.target?{...n,label:target.label}:n)};
 const domain=g=>{
  const {native_bindings,...rest}=g;
  return {...rest,nodes:g.nodes.map(({dom_epoch,...n})=>n),variable_links:g.variable_links??[]};
 };
 const comparison={...restored,variable_links:(restored.variable_links??[]).filter(e=>e!==matches[0])};
 return same(domain(before),domain(comparison))?restored:unchanged();
}
