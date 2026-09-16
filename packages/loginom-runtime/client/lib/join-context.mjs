import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';

export function makeJoinContextCode(binding){
 validatePreparedNodeContext(binding);
 return `async page=>(${readJoinContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readJoinBrowser.toString()})`;
}
export async function readJoinContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readJoinBrowser){
 const before=await readNode(page,binding);
 if(!before.verified||before.surface!=='wizard'||before.input_port||before.output_port)return {verified:false,reason:'join_node_surface'};
 const result=await page.evaluate(readBrowser,binding.workflow_ref.prefix),after=await readNode(page,binding);
 if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'join_node_changed'};
 return {...result,node_context:after};
}

// Read the two complete local UI stores and their reciprocal record links.
// FLinks/FJoinedColumns are RPC proxies and must never be dereferenced here.
export function readJoinBrowser(prefix){
 const fail=reason=>({verified:false,reason}),base=prefix+';WizrdMCF;JoinDataWizard';
 const exact=t=>[...document.querySelectorAll('[data-tid='+JSON.stringify(t)+']')];
 const roots=exact(base);
 if(roots.length!==1||!roots[0].checkVisibility({checkVisibilityCSS:true}))return fail('join_root');
 const cmp=k=>{const es=exact(base+(k?';'+k:''));if(es.length!==1||!roots[0].contains(es[0]))return null;const c=globalThis.Ext?.getCmp?.(es[0].id);return c?.el?.dom===es[0]?c:null;};
 const root=cmp(''),owner=root?.['@@TestCmpController'],wizardRoots=exact(prefix+';WizrdMCF');
 const wizard=wizardRoots.length===1?globalThis.Ext?.getCmp?.(wizardRoots[0].id)?.Controller:null;
 if(owner?.constructor?.name!=='JoinDataWizard'||owner.FWizardForm!==wizard||!wizard
  ||owner.FMissingLinks!==false||owner.FRelationRefreshMode!==false||owner.FLinksUpdateMode!==false)return fail('join_owner_or_pending');
 const grids=[cmp('grdSourceColumns'),cmp('grdTargetColumns')],stores=grids.map(c=>c?.getStore?.());
 const linkGrid=cmp('LinkGrid');
 if(stores[0]===stores[1]||stores[0]!==owner.FSourceStore||stores[1]!==owner.FTargetStore
  ||linkGrid?.LeftGrid!==grids[0]||linkGrid.RightGrid!==grids[1])return fail('join_stores_owner');
 const inventories=[];
 for(const [i,s] of stores.entries()){
  const d=s?.getData?.(),rs=d?.items,source=d?.getSource?.()?.items;
  const filter=cmp(i?'TargetFilter':'SourceFilter');
  if(s?.$className!=='Ext.data.Store'||s.isBufferedStore||s.isLoading?.()||s.isSyncing
   ||s.getProxy?.()?.$className!=='bg.ext.CollectionProxy'||!Array.isArray(rs)||rs.length>1000
   ||s.getCount()!==rs.length||s.getTotalCount()!==rs.length||filter?.getValue?.()!==''
   ||source&&(source.length!==rs.length||new Set(source).size!==rs.length||source.some(r=>!rs.includes(r))))return fail('join_inventory');
  inventories.push(rs);
 }
 const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'},fields=[];
 for(const rs of inventories){
  const ids=new Set(),names=new Set(),nativeIds=new Set(),out=[];
  for(const r of rs){const d=r?.data,id=String(r?.internalId??'');
   if(!r?.isModel||!id||ids.has(id)||!Number.isSafeInteger(d?.ID)||nativeIds.has(d.ID)
    ||typeof d.Name!=='string'||!d.Name||names.has(d.Name.toLowerCase())||typeof d.DisplayName!=='string'
    ||!types[d.DataType]||d.Broken!==false||d.GroupField!=='')return fail('join_field');
   ids.add(id);nativeIds.add(d.ID);names.add(d.Name.toLowerCase());
   out.push({record_id:id,field_id:d.ID,name:d.Name,label:d.DisplayName,type:types[d.DataType]});
  }fields.push(out);
 }
 const keys=[],linked=new Set();
 for(const [i,r] of inventories[0].entries()){
  const target=r.data.ConnectedRecord;if(target==null)continue;
  const j=inventories[1].indexOf(target);
  if(j<0||linked.has(target)||target.data.ConnectedRecord!==r||r.data.DataType!==target.data.DataType)return fail('join_link');
  linked.add(target);keys.push({left:fields[0][i].name,right:fields[1][j].name,left_record_id:fields[0][i].record_id,right_record_id:fields[1][j].record_id,type:fields[0][i].type});
 }
 if(inventories[1].some(r=>r.data.ConnectedRecord!=null&&!linked.has(r)))return fail('join_reverse_link');
 const values={};
 for(const k of ['pedJoinType','chbCaseSensitive','chbIncludeJoinedKeyFields']){
  const control=cmp(k+';ValueControl'),property=cmp(k)?.Controller,value=control?.getValue?.();
  if(!property||property.FLastViewMode!==0||property.FLastValue!==value||property.FInitializing
   ||(k==='pedJoinType'?![0,1,2,3,4].includes(value):typeof value!=='boolean'))return fail('join_option_or_variable');
  values[k]=value;
 }
 const selected=grids[0].getSelectionModel?.()?.getSelection?.()??[];
 if(!Array.isArray(selected)||selected.some(r=>!inventories[0].includes(r)))return fail('join_selection');
 return {verified:true,inventory_complete:true,state_source:'cached_join_stores',
  selected_left:selected.map(r=>r.data.Name),input_fields:fields,keys,mode:['inner','left','right','full','difference'][values.pedJoinType],
  case_sensitive:values.chbCaseSensitive,include_joined_keys:values.chbIncludeJoinedKeyFields,settings_applied:false};
}
