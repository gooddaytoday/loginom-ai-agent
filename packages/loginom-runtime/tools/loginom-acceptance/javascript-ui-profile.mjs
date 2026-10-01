import {inspectManagedJavascriptPage,makeJavascriptManagedPageCode} from '../../client/lib/javascript-managed-page.mjs';
import {inspectManagedJavascriptStage,runManagedJavascriptStageRead} from '../../client/lib/javascript-managed-stage.mjs';
import {readJavascriptStage} from '../../client/lib/javascript-stage-read.mjs';
import {classifyJavascriptWizardMasks} from '../../client/lib/javascript-wizard-masks.mjs';
import {readJavascriptG1Type} from './javascript-g1-type.mjs';

// Private fixed observer. It reads the retained wizard's visible controls and
// already selected engine caches; it never opens menus or invokes a helper.
export function readJavascriptUiProfile(args,readStage,readType,classifyMasks) {
  const stage=readStage(args),{root,prefix}=args;
  const own=(object,key)=>object&&Object.getOwnPropertyDescriptor(object,key)?.value;
  const visible=element=>element?.isConnected&&element.getBoundingClientRect().width>0
    &&element.getBoundingClientRect().height>0&&getComputedStyle(element).visibility!=='hidden';
  const base=prefix+';WizrdMCF';
  const roots=[...document.querySelectorAll('[data-tid='+JSON.stringify(base)+']')].filter(visible);
  if(stage.owner_verified!==true||stage.native_owner_verified!==true
    ||stage.boundary_refusal!==null||stage.preview_visible||stage.dialog_diagnostic.foreign_count!==0
    ||roots.length!==1||roots[0]!==root||!visible(root)
    ||![base+';JavaScriptColumnsWizard',base+';JavaScriptCodeWizard'].includes(stage.page_tid))
    throw Error('UI profile quiet owned wizard unavailable');
  const overlays=[...document.querySelectorAll('.x-mask,.bg-mask-message,.x-mask-msg')].filter(visible);
  if(overlays.length>16)throw Error('UI profile mask inventory bound exceeded');
  const pages=[...root.querySelectorAll('[data-tid='+JSON.stringify(stage.page_tid)+']')].filter(visible);
  const model=globalThis.bg?.app?.Application?.FInstance?.FMainForm?.Items?.Workspace?.getActiveTab?.()?.Controller?.FController;
  const classified=classifyMasks({prefix,root,model,binding:args.binding,pages,overlays}).maskObservations;
  if(classified.some(item=>item.disabled_delete_mask!==true)||stage.pending===true&&classified.length===0)
    throw Error('UI profile quiet owned wizard unavailable');
  const masks={visible_count:classified.length,disabled_delete_mask_count:classified.length,blocker_count:0,
    observations:classified.map(item=>({parent_tid:item.element.parentElement?.getAttribute('data-tid')??null,
      checks:item.checks,disabled_delete_mask:item.disabled_delete_mask}))};
  const selector='button,input[type="checkbox"],input[type="radio"],select,[role="button"],[role="checkbox"],[role="radio"],[role="combobox"],.x-btn,.x-form-checkbox,.x-form-radio,.x-form-trigger';
  const candidates=[...root.querySelectorAll(selector)].filter(visible);
  if(candidates.length>256)throw Error('UI profile control inventory bound exceeded');
  const controls=new Map(),tids=new Map();
  for(const element of candidates){
    let current=element,canonical=null,component=null,steps=0;
    while(current&&root.contains(current)&&steps++<16){
      const native=globalThis.Ext?.getCmp?.(current.id);
      if(own(own(native,'el'),'dom')===current){canonical=current;component=native;break;}
      current=current.parentElement;
    }
    if(!canonical){
      current=element;steps=0;
      while(current&&root.contains(current)&&steps++<16){
        if(current.getAttribute('data-tid')){canonical=current;break;}
        current=current.parentElement;
      }
    }
    const tid=canonical?.getAttribute('data-tid');
    if(!canonical||canonical===root||!root.contains(canonical)||!visible(canonical)
      ||typeof tid!=='string'||!tid.startsWith(base+';')||tid.length>512)
      throw Error('UI profile control owner unavailable');
    if(tids.has(tid)&&tids.get(tid)!==canonical)throw Error('UI profile duplicate control identity');
    tids.set(tid,canonical);
    const entry=controls.get(canonical)??{component,tid,leaves:[]};
    if(entry.leaves.length>=16)throw Error('UI profile composite control bound exceeded');
    entry.leaves.push(element);controls.set(canonical,entry);
  }
  if(controls.size>64||!tids.has(base+';btnNext')||!tids.has(base+';btnClose'))
    throw Error('UI profile control inventory bound exceeded or navigation incomplete');
  const text=(value,limit)=>{
    if(value==null)return null;
    if(typeof value!=='string'||value.length>limit)throw Error('UI profile control text bound exceeded');
    return value.replace(/\s+/g,' ').trim();
  };
  const inventory=[...controls].map(([element,{component,tid,leaves}])=>{
    const roles=[...new Set(leaves.map(leaf=>leaf.getAttribute('role')).filter(Boolean))];
    const types=[...new Set(leaves.map(leaf=>leaf.getAttribute('type')).filter(Boolean))];
    const tags=[...new Set(leaves.map(leaf=>leaf.tagName?.toLowerCase()).filter(Boolean))];
    const checkbox=leaves.find(leaf=>['checkbox','radio'].includes(leaf.getAttribute('type')));
    const picker=tags.includes('select')||roles.includes('combobox');
    const valueDescriptor=picker&&component?Object.getOwnPropertyDescriptor(component,'value'):null;
    const value=valueDescriptor?.value;
    const scalar=value===null||['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isFinite(value);
    if(picker&&valueDescriptor&&'value' in valueDescriptor&&value!==undefined&&!scalar)
      throw Error('UI profile picker cache is not scalar');
    if(typeof value==='string'&&value.length>256)throw Error('UI profile picker cache bound exceeded');
    // Only short control labels are read. The editor/container text and input
    // values are excluded; a combobox value comes solely from its own cache.
    const label=element.getAttribute('aria-label')??own(component,'boxLabel')
      ??own(component,'text')??(tags.includes('button')||roles.includes('button')?element.textContent:null);
    return {tid,roles,types,tags,label:text(label,512),title:text(element.getAttribute('title'),1024),
      qtip:text(element.getAttribute('data-qtip'),1024),native_class:text(own(component,'$className'),160),
      disabled:own(component,'disabled')===true||element.getAttribute('aria-disabled')==='true'
        ||leaves.some(leaf=>leaf.disabled===true),
      checked:checkbox?checkbox.checked===true:roles.some(role=>['checkbox','radio'].includes(role))
        ?element.getAttribute('aria-checked'):null,
      picker_cache:!picker?null:{state:!valueDescriptor?'absent':!('value' in valueDescriptor)?'accessor_not_read'
        :value===undefined?'undefined':'own_scalar',...(value!==undefined&&scalar?{value}:{})}};
  });
  const profile={version:1,page_tid:stage.page_tid,inventory_complete:true,controls:inventory,
    quiet_owner_verified:true,mask_classification:masks,
    observation_scope:'visible controls of the retained Columns/Code wizard; unopened menus excluded',
    engine:stage.page_tid===base+';JavaScriptCodeWizard'?readType(args):null,
    helper_invoked:false,engine_selection_changed:false,explicit_execute_requested:false,
    hidden_execution_absence_claimed:false};
  return {...stage,ui_profile:profile};
}

export function makeJavascriptUiProfileCode(task) {
  makeJavascriptManagedPageCode(task);
  const inspect=`function inspect(args){const pageRead=${inspectManagedJavascriptPage.toString()};`+
    `const readStage=${readJavascriptStage.toString()};const readType=${readJavascriptG1Type.toString()};`+
    `const classifyMasks=${classifyJavascriptWizardMasks.toString()};let context;`+
    `const stage=(${inspectManagedJavascriptStage.toString()})(args,pageRead,arg=>{context=arg;return readStage(arg);});`+
    `const result=(${readJavascriptUiProfile.toString()})(context,()=>stage,readType,classifyMasks);`+
    `if(new TextEncoder().encode(JSON.stringify(result)).length>16384)throw Error('UI profile response bound exceeded');`+
    `return result;}`;
  return `async page=>(${runManagedJavascriptStageRead.toString()})(page,${JSON.stringify(task)},${inspect})`;
}
