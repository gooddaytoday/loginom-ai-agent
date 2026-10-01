// Closed browser-local capability. The caller proves the current owned wizard
// refusal and exact draft before this inspector; no native method is invoked.
export function inspectJavascriptWizardErrorDetails({held,task}) {
  const own=(object,key)=>Object.getOwnPropertyDescriptor(object??{},key)?.value;
  const data=(object,key)=>{
    for(let depth=0;object&&depth<16;depth++,object=Object.getPrototypeOf(object)) {
      const descriptor=Object.getOwnPropertyDescriptor(object,key);
      if(!descriptor)continue;
      if(!Object.hasOwn(descriptor,'value'))throw Error('Native details data accessor refused');
      return descriptor.value;
    }
    return undefined;
  };
  const visible=element=>!!element?.isConnected&&element.getBoundingClientRect().width>0
    &&element.getBoundingClientRect().height>0&&getComputedStyle(element).visibility!=='hidden';
  const dialogs=[...document.querySelectorAll('.x-message-box')].filter(visible),dialog=held.errorDialogRoot;
  if(!['details','expanded'].includes(task.mode)||Date.now()>=task.deadline
    ||dialogs.length!==1||dialogs[0]!==dialog||!visible(dialog))
    throw Error('Native details captured modal changed');
  const instance=own(globalThis.bg?.ext?.errormessage?.ErrorMsg,'FInstance');
  const message=own(instance,'FMessageBox'),controller=own(instance,'FDetails');
  const view=own(controller,'FView'),root=own(own(view,'el'),'dom');
  const items=own(controller,'FItems'),exception=own(controller,'FDetailedException');
  const constructor=globalThis.bg?.ext?.errormessage?.DetailPanel;
  if(!instance||own(own(message,'el'),'dom')!==dialog||!controller||!root||!visible(root)
    ||!dialog.contains(root)||root.getAttribute('data-tid')!=='DetailPanel'
    ||globalThis.Ext?.getCmp?.(root.id)!==view||own(view,'Controller')!==controller
    ||!items||typeof items!=='object'||!exception||typeof exception!=='object'
    ||typeof constructor!=='function'||Object.getPrototypeOf(controller)!==constructor.prototype
    ||typeof own(constructor.prototype,'btnDetaisHandler')!=='function')
    throw Error('Native details controller changed');
  const control=tid=>{
    const elements=[...root.querySelectorAll('[data-tid='+JSON.stringify(tid)+']')];
    if(elements.length!==1||!elements[0].isConnected||!root.contains(elements[0]))
      throw Error('Unique native details control required');
    const element=elements[0],native=globalThis.Ext?.getCmp?.(element.id);
    if(!native||own(own(native,'el'),'dom')!==element)throw Error('Native details control identity changed');
    const seen=new Set();
    for(let parent=native,depth=0;parent!==view;depth++) {
      if(!parent||depth>=16||seen.has(parent))throw Error('Native details owner chain changed');
      seen.add(parent);parent=data(parent,'ownerCt');
    }
    return {element,native};
  };
  const button=control('DetailPanel;btnDetais'),panel=control('DetailPanel;pnlDetail'),text=control('DetailPanel;cmpDetailText');
  // The native toggle follows Items (own FItems) and FDetailedException, not DOM
  // ownership alone. Never invoke Items or the exception's DetailText getter.
  if(own(items,'btnDetais')!==button.native||own(items,'pnlDetail')!==panel.native
    ||own(items,'cmpDetailText')!==text.native)throw Error('Native details items binding changed');
  if(!visible(button.element)||data(button.native,'disabled')!==false
    ||button.element.closest('.x-item-disabled,.x-btn-disabled')||button.element.getAttribute('aria-disabled')==='true'
    ||own(button.native,'enableToggle')!==true||own(button.native,'scope')!==controller
    ||own(button.native,'toggleHandler')!==own(constructor.prototype,'btnDetaisHandler'))
    throw Error('Native details toggle binding changed');
  const identities={instance,message,controller,view,root,items,exception,constructor,
    prototype:constructor.prototype,handler:own(constructor.prototype,'btnDetaisHandler'),
    button:button.element,button_native:button.native,
    panel:panel.element,panel_native:panel.native,text:text.element,text_native:text.native};
  const captured=held.errorDetailsBinding;
  if(captured&&Object.keys(identities).some(key=>captured[key]!==identities[key])||task.mode==='expanded'&&!captured)
    throw Error('Native details captured identities changed');
  const pressed=data(button.native,'pressed');
  if(task.mode==='expanded') {
    if(pressed!==true||!visible(panel.element)||!visible(text.element))return {expanded:false};
    const raw=text.element.innerText;
    if(typeof raw!=='string'||!raw||!raw.isWellFormed()||raw.length>1048576)
      throw Error('Native details text unavailable or exceeds bound');
    let result='',bytes=0;
    for(const char of raw) {
      const size=new TextEncoder().encode(char).length;
      if(bytes+size>4096)break;
      result+=char;bytes+=size;
    }
    return {expanded:true,text:result,text_truncated:result!==raw,utf8_bytes:bytes,
      tid:text.element.getAttribute('data-tid'),native_owner_verified:true};
  }
  if(pressed!==false||visible(panel.element)||visible(text.element)||text.element.innerText!=='')
    throw Error('Native details initial toggle state changed');
  const box=button.element.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
  const hit=document.elementFromPoint(x,y);
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=innerWidth||y>=innerHeight
    ||!(hit===button.element||button.element.contains(hit)))throw Error('Native details toggle covered');
  if(!captured)held.errorDetailsBinding=identities;
  return {point:{x,y,tid:'DetailPanel;btnDetais',node_id:task.owner.node_id,page_tid:task.page_tid},
    expanded:false,native_owner_verified:true};
}

export function javascriptWizardTextClassification(text) {
  const classes=[...new Set([...text.matchAll(/\b(SyntaxError|TypeError|ReferenceError|RangeError|EvalError|URIError|Error):/g)].map(item=>item[1]))];
  const positions=[...new Set([...text.matchAll(/\(:(\d+):(\d+)\)/g)].map(item=>item[1]+':'+item[2]))];
  const at=positions.length===1?positions[0].split(':').map(Number):null;
  return {error_class:classes.length===1?{status:'recognized',name:classes[0]}:{status:'unrecognized'},
    location:at&&at.every(value=>Number.isSafeInteger(value)&&value>0)
      ?{status:'recognized',line:at[0],column:at[1]}:{status:'unrecognized'}};
}
