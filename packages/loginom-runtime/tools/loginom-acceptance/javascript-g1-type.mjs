// Serialized, read-only G1 observation. The code wizard has already selected
// IBGJavaScriptEngine; this reader never requests a new cast or remote getter.
export function readJavascriptG1Type({root,native,binding,prefix,account,build}) {
  const own=(object,key)=>object&&Object.getOwnPropertyDescriptor(object,key)?.value;
  const app=globalThis.bg?.app,main=app?.Application?.FInstance?.FMainForm;
  const tab=main?.Items?.Workspace?.getActiveTab?.(),model=tab?.Controller?.FController;
  if(app?.Version!==build||main?.FMapTree?.FServerConnection?.UserName!==account
    ||main.FMapTree.FServerConnection.Connected!==true||tab!==binding.tab
    ||tab?.Controller?.Node?.data?.node!==native||model?.FModelNode!==binding.nodeData
    ||model?.FView?.el?.dom!==root||!root?.isConnected)throw Error('G1 wizard owner changed');
  const tid=prefix+';WizrdMCF;JavaScriptCodeWizard';
  const roots=[...root.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')].filter(element=>
    element.isConnected&&element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0
    &&getComputedStyle(element).visibility!=='hidden');
  if(roots.length!==1)throw Error('G1 code page not unique and visible');
  const codeView=globalThis.Ext?.getCmp?.(roots[0].id);
  if(own(own(codeView,'el'),'dom')!==roots[0])throw Error('G1 code page native view differs');
  const dataArray=array=>{
    // A skipped conditional item may retain an empty FPages array.
    if(!Array.isArray(array)||array.length>32)throw Error('G1 wizard array unavailable');
    const values=Array.from({length:array.length},(_,index)=>own(array,String(index)));
    if(values.some(value=>!value||typeof value!=='object')||new Set(values).size!==values.length)
      throw Error('G1 wizard array data ambiguous');
    return values;
  };
  const items=dataArray(own(own(model,'FWizardItems'),'FItems'));
  const candidates=items.filter(item=>{
    const pages=dataArray(own(item,'FPages'));
    return pages.includes(codeView);
  });
  if(candidates.length!==1)throw Error('G1 code wizard controller ambiguous');
  const controller=own(candidates[0],'FWizard');
  if(own(controller,'FWizardForm')!==model)throw Error('G1 code wizard owner differs');
  const engine=own(controller,'FEngine'),moduleSystem=own(controller,'FModuleSystem');
  const id=object=>{
    const value=own(object,'$'),session=own(object,'$S');
    const numbers=['$OW','$O','$I'].map(key=>own(value,key));
    if(!session||numbers.some(number=>!Number.isInteger(number)||number<0))
      throw Error('G1 native proxy identity unavailable');
    return {session,owner:numbers[0],object:numbers[1],interface:numbers[2]};
  };
  const engineId=id(engine),moduleId=id(moduleSystem);
  const sameSession=engineId.session===moduleId.session;
  const sameRemoteObject=sameSession&&engineId.owner===moduleId.owner&&engineId.object===moduleId.object;
  const className=object=>{
    const names=[];
    for(let proto=Object.getPrototypeOf(object);proto&&names.length<4;proto=Object.getPrototypeOf(proto)){
      const ctor=own(proto,'constructor');
      const name=own(ctor,'name');
      if(typeof ctor==='function'&&typeof name==='string'&&name)names.push(name.slice(0,120));
    }
    return names;
  };
  return {verified:true,code_page_tid:tid,controller_class:typeof own(controller,'$className')==='string'
    ?own(controller,'$className').slice(0,160):null,
    engine:{owner:engineId.owner,object:engineId.object,interface:engineId.interface,prototype_classes:className(engine)},
    module_system:{owner:moduleId.owner,object:moduleId.object,interface:moduleId.interface,
      prototype_classes:className(moduleSystem)},same_session:sameSession,same_remote_object:sameRemoteObject,
    distinct_interfaces:engineId.interface!==moduleId.interface,
    runtime_full_type:null,full_type_observed:false};
}
