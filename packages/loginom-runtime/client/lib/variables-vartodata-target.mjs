// Loginom derives this new component's caption when its first variable set is linked.
// Restore only that caption for comparison, after proving the entire native graph.
// Self-contained because the admitted browser link primitive serializes this function.
export function normalizeVariablesToTableLinkGraph(before,after,edge){
 const unchanged=()=>after;
 if(!before?.complete||!after?.complete||edge?.kind!=='variables'||edge.input!==0)return unchanged();
 const one=(g,id)=>{const ns=g.nodes?.filter(n=>n.ref?.node_id===id);return ns?.length===1?ns[0]:null;};
 const source=one(before,edge.source),target=one(before,edge.target),current=one(after,edge.target);
 if(!source||target?.type!=='variables.to_table'||target.label!=='Переменные в таблицу'
  ||current?.type!==target.type||!current.label?.startsWith('В столбцы: ')||current.label.length<='В столбцы: '.length)return unchanged();
 if([...(before.links??[]),...(before.variable_links??[])].some(e=>e.source===edge.target||e.target===edge.target))return unchanged();
 const outputs=source.variable_outputs?.filter(p=>p.kind==='variables'&&p.port===edge.output),inputs=target.variable_inputs?.filter(p=>p.kind==='variables'&&p.port===0);
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
