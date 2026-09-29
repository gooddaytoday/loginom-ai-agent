// Operator-only diagnostics. No DOM writes, native commands or epoch exemptions.
export async function captureJavascriptStopMutations(page) {
  const handle=await page.evaluateHandle(()=>{
    const targets=new Map(),ids=new WeakMap();let sequence=0,total=0,overflow=0;
    const capture=records=>{
      total+=records.length;
      for(const record of records.slice(0,256)) {
        const element=record.target.nodeType===1?record.target:record.target.parentElement;
        if(!element){overflow++;continue;}
        if(!ids.has(element))ids.set(element,++sequence);
        const key=ids.get(element)+':'+record.type+':'+(record.attributeName??'');
        if(!targets.has(key)) {
          if(targets.size>=64){overflow++;continue;}
          const path=[];
          for(let e=element,depth=0;e&&depth<4;e=e.parentElement,depth++)path.push({
            tag:e.tagName,tid:(e.getAttribute('data-tid')??'').slice(0,300),
            classes:[...e.classList].slice(0,12).map(x=>x.slice(0,100))});
          targets.set(key,{id:ids.get(element),type:record.type,attribute:record.attributeName??null,path,count:0,
            same_attribute_value:0,changed_attribute_value:0});
        }
        const entry=targets.get(key);entry.count++;
        if(record.type==='attributes')entry[record.oldValue===element.getAttribute(record.attributeName)
          ?'same_attribute_value':'changed_attribute_value']++;
      }
      overflow+=Math.max(0,records.length-256);
    };
    const observer=new MutationObserver(capture);
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,
      attributeOldValue:true,characterData:true});
    return {observer,read(){capture(observer.takeRecords());const result={total,overflow,targets:[...targets.values()]};
      targets.clear();total=0;overflow=0;return result;}};
  });
  return {
    read:()=>handle.evaluate(state=>state.read()),
    async close(){await handle.evaluate(state=>state.observer.disconnect());await handle.dispose();}
  };
}
