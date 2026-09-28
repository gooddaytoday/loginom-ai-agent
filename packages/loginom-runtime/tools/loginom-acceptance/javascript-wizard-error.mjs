// Private operator boundary: only the owner of the current browser may open
// and dismiss the wizard's native error dialog after an observed stage refusal.
export function readJavascriptWizardErrorDialog() {
  const visible=element=>element.isConnected&&element.getBoundingClientRect().width>0
    &&element.getBoundingClientRect().height>0&&getComputedStyle(element).visibility!=='hidden';
  const dialogs=[...document.querySelectorAll('.x-message-box')].filter(visible);
  if(!dialogs.length)return{present:false};
  if(dialogs.length!==1)throw Error('Unique visible native error dialog required');
  const dialog=dialogs[0],tid=dialog.getAttribute('data-tid');
  if(!/^msgbox(?:-\d+)?$/.test(tid??''))throw Error('Native error dialog identity unavailable');
  const ok=[...new Set([...dialog.querySelectorAll('button,[role="button"],.x-btn'),
    ...document.querySelectorAll('[data-tid='+JSON.stringify(tid+';tlb;ok')+']')])]
    .filter(element=>visible(element)&&element.getAttribute('data-tid')===tid+';tlb;ok');
  if(ok.length!==1||ok[0].innerText.trim()!=='OK')throw Error('Native error dialog OK unavailable');
  const text=dialog.innerText;
  if(typeof text!=='string'||!text)throw Error('Native error dialog text unavailable');
  return {present:true,tid,text:text.slice(0,4096),text_truncated:text.length>4096,ok_tid:tid+';tlb;ok'};
}

export async function captureJavascriptWizardError({page,read,identity,stage,before,after,record,deadline}) {
  const valid=snapshot=>snapshot.native_owner_verified===true&&snapshot.wizard_visible===true
    &&snapshot.page_tid===before.page_tid&&!!snapshot.page_tid&&snapshot.pending===false
    &&snapshot.wizard_error?.visible===true&&snapshot.wizard_error.exact_count===1;
  if(!after.wizard_error_refusal||!valid(after)||Date.now()>=deadline)throw Error('Current wizard error refusal not established');
  const current=await read();
  if(!valid(current)||current.boundary_refusal!==null&&current.boundary_refusal!=='foreign_dialog')
    throw Error('Wizard error owner changed before reading');
  const initial=await page.evaluate(readJavascriptWizardErrorDialog);
  if(!initial.present){
    if(current.boundary_refusal!==null)throw Error('Foreign dialog blocks wizard error button');
    await record({phase:'wizard_error_button_dispatch',identity,stage,button_tid:current.wizard_error.tid});
    await page.locator('[data-tid='+JSON.stringify(current.wizard_error.tid)+']').filter({visible:true}).click({timeout:Math.max(1,Math.min(10000,deadline-Date.now()))});
    await page.waitForFunction(()=>[...document.querySelectorAll('.x-message-box')].some(element=>
      element.isConnected&&element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0
      &&getComputedStyle(element).visibility!=='hidden'),null,{timeout:Math.max(1,deadline-Date.now())});
  }else if(current.boundary_refusal!=='foreign_dialog'||after.dialog_diagnostic?.roots?.[0]?.tid!==initial.tid)
    throw Error('Unattributed preexisting wizard error dialog');
  const dialog=await page.evaluate(readJavascriptWizardErrorDialog);
  if(!dialog.present)throw Error('Native error dialog not observed');
  await page.locator('[data-tid='+JSON.stringify(dialog.ok_tid)+']').filter({visible:true}).click({timeout:Math.max(1,Math.min(10000,deadline-Date.now()))});
  await page.waitForFunction(()=>![...document.querySelectorAll('.x-message-box')].some(element=>
    element.isConnected&&element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0
    &&getComputedStyle(element).visibility!=='hidden'),null,{timeout:Math.max(1,deadline-Date.now())});
  const settled=await read();
  if(settled.native_owner_verified!==true||settled.wizard_visible!==true||settled.page_tid!==before.page_tid
    ||settled.pending!==false||settled.boundary_refusal!==null||settled.owner_verified!==true)
    throw Error('Wizard error dialog closure or owner unconfirmed');
  const result={identity,stage,page_tid:before.page_tid,button_tid:current.wizard_error.tid,
    tooltip:current.wizard_error.tooltip,tooltip_truncated:current.wizard_error.tooltip_truncated,
    dialog_text:dialog.text,dialog_text_truncated:dialog.text_truncated,dialog_closed:true,
    native_owner_verified:true};
  await record({phase:'wizard_error_observed',...result});
  return result;
}
