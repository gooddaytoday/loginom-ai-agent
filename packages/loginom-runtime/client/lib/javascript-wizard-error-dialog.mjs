// Bounded read-only native dialog snapshot. Its caller must establish the
// owned current wizard refusal before opening or dismissing any dialog.
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
