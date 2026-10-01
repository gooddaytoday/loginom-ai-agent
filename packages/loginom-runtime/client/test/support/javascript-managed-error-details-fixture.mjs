import {managedJavascriptErrorFixture} from './javascript-managed-error-fixture.mjs';
import {makeJavascriptManagedErrorReadCode} from '../../lib/javascript-managed-wizard-error.mjs';
import {inspectJavascriptWizardErrorDetails} from '../../lib/javascript-wizard-error-details.mjs';

export async function managedJavascriptErrorDetailsFixture({auto=true,stage='code_next',expand=true,
  technicalText='SyntaxError: Syntax error at code (:4:33)\nNative technical details'}={}) {
  const f=managedJavascriptErrorFixture({auto,stage});
  if(auto)await f.execute(makeJavascriptManagedErrorReadCode({...f.base,mode:'dialog'}));
  const root=f.element('detail-root','DetailPanel'),button=f.element('detail-button','DetailPanel;btnDetais');
  const panel=f.element('detail-panel','DetailPanel;pnlDetail'),text=f.element('detail-text','DetailPanel;cmpDetailText');
  panel.rect.width=0;text.rect.width=0;text.innerText='';button.closest=()=>null;button.rect.y=220;button.rect.height=32;
  root.contains=element=>[root,button,panel,text].includes(element);
  const elements=[button,panel,text];root.querySelectorAll=selector=>elements.filter(e=>selector==='[data-tid='+JSON.stringify(e.tid)+']');
  const contains=f.dialog.contains;f.dialog.contains=e=>e===root||root.contains(e)||contains(e);
  function DetailPanel() {}
  DetailPanel.prototype.btnDetaisHandler=()=>{throw Error('Native handler must not be invoked');};
  const controller=new DetailPanel(),view={el:{dom:root},Controller:controller};controller.FView=view;
  const nativeButton=Object.assign(Object.create({pressed:false,disabled:false}),{el:{dom:button},ownerCt:view,
    enableToggle:true,scope:controller,toggleHandler:DetailPanel.prototype.btnDetaisHandler});
  const nativePanel={el:{dom:panel},ownerCt:view},nativeText={el:{dom:text},ownerCt:nativePanel};
  controller.FItems={btnDetais:nativeButton,pnlDetail:nativePanel,cmpDetailText:nativeText};
  controller.FDetailedException={get DetailText(){throw Error('Hidden exception getter must not be invoked');}};
  const instance={FMessageBox:f.dialogComponent,FDetails:controller};
  f.context.bg.ext={errormessage:{ErrorMsg:{FInstance:instance},DetailPanel}};
  Object.assign(f.controls,{[root.id]:view,[button.id]:nativeButton,[panel.id]:nativePanel,[text.id]:nativeText});
  const hit=f.context.document.elementFromPoint;
  f.context.document.elementFromPoint=(x,y)=>y===button.rect.y+button.rect.height/2?button:hit(x,y);
  const click=f.page.mouse.click;
  f.page.mouse.click=async(x,y)=>{
    if(f.dialogs.length&&y===button.rect.y+button.rect.height/2) {
      f.calls.push('details');
      if(expand){nativeButton.pressed=true;panel.rect.width=100;text.rect.width=100;text.innerText=technicalText;f.dialog.innerText+='\n'+technicalText;}
      return;
    }
    return click(x,y);
  };
  const request={held:f.held,task:{...f.base,mode:'details'}};
  const readDetails=()=>f.page.evaluate(inspectJavascriptWizardErrorDetails,request);
  return {...f,root,button,panel,text,controller,view,nativeButton,nativePanel,nativeText,instance,DetailPanel,request,readDetails,elements};
}
