// Acceptance-only strict JSON comparison; native readers still supply values.
export function sameJsonValues(a,b){
 const decode=text=>{
  if(typeof text!=='string'||Buffer.byteLength(text)>1048576)throw Error('JSON_BOUND');
  const stack=[];
  for(const [token] of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)){
   if(token==='{'){stack.push({keys:new Set(),key:true});continue;}if(token==='['){stack.push({});continue;}
   if(token==='}'||token===']'){stack.pop();continue;}const top=stack.at(-1);if(!top?.keys)continue;
   if(token===','){top.key=true;continue;}if(token===':'){top.key=false;continue;}
   if(top.key&&token.startsWith('"')){const key=JSON.parse(token);if(top.keys.has(key))throw Error('JSON_DUPLICATE_KEY');top.keys.add(key);top.key=false;}
  }
  const numbers=new WeakSet();
  const value=JSON.parse(text,(_key,v,context)=>{
   if(typeof v!=='number')return v;if(!Number.isFinite(v))throw Error('JSON_NONFINITE');
   const [mantissa,exponent='0']=context.source.toLowerCase().split('e'),negative=mantissa.startsWith('-');
   let digits=mantissa.replace('-','').replace('.','').replace(/^0+/,''),power=BigInt(exponent)-BigInt(mantissa.split('.')[1]?.length??0);
   while(digits.endsWith('0')){digits=digits.slice(0,-1);power++;}
   const n={literal:digits?(negative?'-':'')+digits+'e'+power:'0'};numbers.add(n);return n;
  });
  const canonical=v=>v===null?['null']:numbers.has(v)?['number',v.literal]:Array.isArray(v)?['array',v.map(canonical)]:typeof v==='object'
   ?['object',Object.keys(v).sort().map(k=>[k,canonical(v[k])])]:[typeof v,v];
  return JSON.stringify(canonical(value));
 };
 try{return decode(a)===decode(b);}catch{return false;}
}
export async function observeTreeConversionSavedSettings({load,channel,expected,type}){
 const {openPreparedWizard}=await load('client/lib/node-wizard-open.mjs'),{closePreparedWizard}=await load('client/lib/node-wizard-close.mjs');
 const {selectPreparedGraphNode}=await load('client/lib/node-graph-selection.mjs');
 const need=(v,m)=>{if(!v)throw Error(m);},stage=type==='trees.from_table'?'table_tree':'tree_json';
 const selected=await channel.observe({condition:'cold tree conversion selection',ready:s=>s.prepared_node_context?.surface==='graph'&&s.wizard?.status==='absent'});
 await selectPreparedGraphNode(channel,selected,'cold select tree conversion',{refreshReplacedBody:true});await openPreparedWizard(channel);
 try{
  let s=await channel.observe({condition:'cold conversion initial stage',ready:s=>s.prepared_node_context?.surface==='wizard'&&['input_mapping','tree_input_mapping',stage].includes(s.wizard?.stage)});
  if(s.wizard.stage!==stage)await channel.perform({condition:'cold conversion settings page',initialObservation:s,ready:s=>s.prepared_node_context?.surface==='wizard',identity:s=>s.prepared_node_context,
   resolve:s=>{const e=s.ui.elements.filter(e=>e.tid===s.wizard.root_tid+';btnNext'&&e.allowed_actions.includes('wizard_step'));need(e.length===1,'COLD_TREE_NEXT');return {verb:'wizard_step',ref:e[0].ref,expected_stage:stage};}});
  s=await channel.observe({condition:'cold saved tree conversion settings',readTrees:true,ready:s=>s.wizard?.stage===stage&&s.node_tree?.verified===true});
  const c=s.node_tree;
  if(type==='trees.from_table'){
   const wanted=expected.nodes,actual=c.nodes.map(n=>Object.fromEntries(['path','name','label','type','is_array','source_field'].filter(k=>Object.hasOwn(n,k)).map(k=>[k,n[k]])));
   need(actual.length===wanted.length&&actual.every((n,i)=>Object.keys(n).length===Object.keys(wanted[i]).length&&Object.entries(n).every(([k,v])=>wanted[i][k]===v)),'COLD_TREE_SAVED_STRUCTURE');
  }else need(c.exclude_root===true&&c.pretty===false&&c.keys==='names'&&c.multi_row===false&&c.datetime==='iso8601','COLD_TREE_SAVED_SERIALIZATION');
  return {type,settings_applied:false,configuration:c};
 }finally{const c=await closePreparedWizard(channel);need(c.verified&&c.cleanup_complete&&c.settings_applied===false,'COLD_TREE_CANCEL');}
}
