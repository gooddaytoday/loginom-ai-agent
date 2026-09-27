// Private failure evidence only. Serialized without imports; never grants actions.
export function diagnoseJavascriptNativeClassifier(binding) {
  const report={version:1,status:'unavailable',first_failed:null,descriptors:[],gates:{}};
  const fail=(gate,diagnosticOnly=false)=>{report.gates[gate]=false;report.first_failed??=gate;report.failure_scope=diagnosticOnly?'diagnostic_only':'classifier';return report;};
  const object=o=>o!==null&&(typeof o==='object'||typeof o==='function');
  const descriptor=(o,key)=>{
    for(let depth=0;object(o)&&depth<8;depth++,o=Object.getPrototypeOf(o)) {
      const d=Object.getOwnPropertyDescriptor(o,key);
      if(d)return {d,depth};
    }
    return null;
  };
  const field=(o,key,label,method=false)=>{
    const found=descriptor(o,key),d=found?.d;
    report.descriptors.push({field:label,owner_depth:found?.depth??null,
      kind:d?(Object.hasOwn(d,'value')?'data':'accessor'):'missing',
      type:d&&Object.hasOwn(d,'value')?typeof d.value:'unavailable'});
    if(!d||!Object.hasOwn(d,'value')||(!method&&found.depth!==0))return undefined;
    return d.value;
  };
  const own=(o,key)=>object(o)?Object.getOwnPropertyDescriptor(o,key)?.value:undefined;
  const dense=(a,limit)=>{
    if(!Array.isArray(a)||a.length>limit)return null;
    const result=[];
    for(let i=0;i<a.length;i++) {const d=Object.getOwnPropertyDescriptor(a,String(i));if(!d||!Object.hasOwn(d,'value')||!d.value||typeof d.value!=='object')return null;result.push(d.value);}
    return result;
  };
  try {
    const context=binding?.context,prefix=binding?.prefix;
    if(context?.verified!==true||context.surface!=='graph'||typeof context.node_id!=='string'||!context.node_id||context.node_id.length>128
      ||typeof context.tid!=='string'||context.tid.length>1024||!/^MF;TF(?:-\d+)?$/.test(prefix??'')
      ||!context.tid.startsWith(prefix+';Graph;'))return fail('prepared_context',true);
    report.gates.prepared_context=true;
    // Follow precisely the classifier's own-data path. A prototype descriptor
    // is evidence of a difference, never permission to continue through it.
    let current=globalThis;
    for(const key of ['bg','app','Application','FInstance','FMainForm','FItems','Workspace']) {
      // Retain historical Items descriptor evidence, without invoking it.
      if(key==='FItems')field(current,'Items','Items');
      current=field(current,key,key);
      if(!object(current))return fail(key,key==='bg');
    }
    const getActiveTab=field(current,'getActiveTab','getActiveTab',true);
    if(typeof getActiveTab!=='function')return fail('getActiveTab');
    const card=getActiveTab.call(current);
    const controller=field(card,'Controller','Controller');
    if(!object(controller))return fail('Controller');
    const model=field(controller,'FController','FController');
    if(!object(model))return fail('FController');
    const app=own(own(globalThis,'bg'),'app'),modelClass=field(app,'ModelForm','ModelForm');
    if(typeof modelClass!=='function')return fail('model_class');
    report.gates.model_class=true;
    const hasInstance=descriptor(modelClass,Symbol.hasInstance);
    if(hasInstance?.d.value!==Function.prototype[Symbol.hasInstance])return fail('instanceof_unavailable',true);
    if(!Function.prototype[Symbol.hasInstance].call(modelClass,model))return fail('instanceof');
    report.gates.instanceof=true;
    const diagram=field(model,'FDiagram','FDiagram');if(!object(diagram))return fail('FDiagram');
    const graph=field(diagram,'FmxGraph','FmxGraph');if(!object(graph))return fail('FmxGraph');
    const view=field(graph,'view','view');if(!object(view))return fail('view');
    const container=field(graph,'container','container');
    const roots=document.querySelectorAll('[data-tid='+JSON.stringify(prefix+';ModelForm;cmpDiagram')+']');
    report.root_count=Math.min(roots.length,2);
    if(roots.length!==1||container!==roots[0])return fail('container');
    report.gates.container=true;
    const collection=field(diagram,'FNodes','FNodes');if(!object(collection))return fail('FNodes');
    const raw=field(collection,'FCollection','FCollection'),nodes=dense(raw,200);
    report.node_count=Array.isArray(raw)?Math.min(raw.length,201):null;
    if(!nodes)return fail('dense_nodes');report.gates.dense_nodes=true;
    report.node_fields={};
    for(const key of ['FGuid','FCell','FIconCls']) {
      const counts={own_data:0,inherited_data:0,accessor:0,missing:0};
      for(const node of nodes) {
        const found=descriptor(node,key);
        const kind=!found?'missing':!Object.hasOwn(found.d,'value')?'accessor':found.depth===0?'own_data':'inherited_data';
        counts[kind]++;
      }
      report.node_fields[key]=counts;
    }
    const getState=field(view,'getState','getState',true);
    if(typeof getState!=='function')return fail('getState');report.gates.getState=true;
    const matches=nodes.filter(n=>own(n,'FGuid')===context.node_id);
    report.target_count=Math.min(matches.length,2);
    if(matches.length!==1)return fail('target_guid',true);
    const node=matches[0],guid=field(node,'FGuid','FGuid'),cell=field(node,'FCell','FCell'),icon=field(node,'FIconCls','FIconCls');
    if(typeof guid!=='string'||!guid||guid.length>128)return fail('guid_format');
    if(!cell||typeof cell!=='object'||nodes.filter(n=>own(n,'FCell')===cell).length!==1)return fail('unique_cell');
    report.gates.unique_cell=true;
    if(typeof icon!=='string'||!/^bg-vendor-icon-[a-z0-9_-]{1,128}$/.test(icon))return fail('icon');
    report.gates.icon=true;report.script=icon==='bg-vendor-icon-javascript';
    const state=getState.call(view,cell),shape=field(state,'shape','shape');
    if(!object(shape))return fail('shape');
    const element=field(shape,'node','renderer_node');
    if(!element||!container.contains(element))return fail('renderer');
    if(element.getAttribute('data-tid')!==context.tid)return fail('prepared_target_tid',true);
    report.gates.renderer=true;
    const exact=container.querySelectorAll('[data-tid='+JSON.stringify(context.tid)+']');
    report.target_dom_count=Math.min(exact.length,2);
    if(exact.length!==1||exact[0]!==element)return fail('unique_tid');
    report.gates.unique_tid=true;report.status='observed';return report;
  } catch {
    // Never replace the original failure or leak arbitrary exception text.
    report.status='unavailable';report.first_failed??='diagnostic_exception';report.failure_scope='diagnostic_only';return report;
  }
}

export async function captureJavascriptNativeClassifierDiagnostic({nativeRoundtrip,stage,page,binding}) {
  if(!nativeRoundtrip||stage!=='prepare-typed-input'||!page)return undefined;
  try {return await page.evaluate(diagnoseJavascriptNativeClassifier,binding);}
  catch {return {version:1,status:'unavailable',first_failed:'transport',failure_scope:'diagnostic_only'};}
}
