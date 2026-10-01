// Operator-only, bounded read-only discovery. Never calls UI handlers/getters,
// reveals hidden exception text, or authorizes a gesture.
export function readJavascriptNativeDetailsInventory({held,owner,source_sha256,ok_tid}) {
  const own=(object,key)=>Object.getOwnPropertyDescriptor(object??{},key)?.value;
  const visible=element=>!!element?.isConnected&&element.getBoundingClientRect().width>0
    &&element.getBoundingClientRect().height>0&&getComputedStyle(element).visibility!=='hidden';
  const dialogs=[...document.querySelectorAll('.x-message-box')].filter(visible);
  const root=held.errorDialogRoot;
  if(dialogs.length!==1||dialogs[0]!==root||ok_tid!==root.getAttribute('data-tid')+';tlb;ok')
    throw Error('Native details discovery captured modal changed');
  const instance=own(globalThis.bg?.ext?.errormessage?.ErrorMsg,'FInstance');
  const message=own(instance,'FMessageBox'),details=own(instance,'FDetails');
  const elements=[...root.querySelectorAll('[data-tid]')];
  if(elements.length>256)throw Error('Native details discovery control bound exceeded');
  const keys=object=>Reflect.ownKeys(object??{}).filter(key=>typeof key==='string').slice(0,64);
  const controls=elements.map(element=>{
    const component=globalThis.Ext?.getCmp?.(element.id);
    return {tid:element.getAttribute('data-tid'),id:element.id,visible:visible(element),
      native_el:component?.el?.dom===element,disabled:own(component,'disabled')===true,
      pressed:own(component,'pressed')??null,text:(element.innerText??'').slice(0,160),
      own_keys:keys(component)};
  });
  const result={owner,source_sha256,dialog_tid:root.getAttribute('data-tid'),
    native_details_owner_verified:own(message,'el')?.dom===root&&!!details,
    instance_own_keys:keys(instance),details_own_keys:keys(details),controls,
    text_truncated:root.innerText.length>4096,read_only:true,explicit_execute_requested:false};
  if(new TextEncoder().encode(JSON.stringify(result)).length>65536)
    throw Error('Native details discovery response bound exceeded');
  return result;
}

export async function captureJavascriptNativeDetailsInventory(page,event) {
  if(event.phase!=='javascript_managed_error_ok_prepared')throw Error('Native details discovery requires prepared owned OK');
  const lease=page[Symbol.for('loginom-dock.javascript-owned-selection-v1')]?.get(event.operation_id);
  if(!lease?.handle||lease.codeNextAttempted!==true||lease.sourceDraftSha256!==event.source_sha256
    ||lease.errorOkAttempted===true||Date.now()>=event.deadline)
    throw Error('Native details discovery lease unavailable');
  return page.evaluate(readJavascriptNativeDetailsInventory,{held:lease.handle,owner:event.owner,
    source_sha256:event.source_sha256,ok_tid:event.point.tid});
}

export function javascriptImportRefusalSource(source) {
  return source+'\nimport { E_JS_UNKNOWN_EXPORT_'+ 'Z'.repeat(4500)+' } from "builtIn/Data";\n';
}
