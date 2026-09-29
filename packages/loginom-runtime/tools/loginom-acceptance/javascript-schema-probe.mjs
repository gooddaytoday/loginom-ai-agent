import {createHash} from 'node:crypto';
import {readJavascriptSchema} from '../../client/lib/javascript-schema-browser.mjs';
export {readJavascriptSchema};
import {openJavascriptColumnEditor,verifyJavascriptColumnEditor,settleJavascriptColumnEditor,fillJavascriptColumnField,recordJavascriptColumnHelperSource,openJavascriptColumnTypePicker,selectJavascriptColumnTypeOption,openJavascriptColumnUsagePicker,selectJavascriptColumnUsageOption} from './javascript-column-editor.mjs';

export function javascriptDeclaredColumnsMatch(snapshot,fixedCase) {
  const fields=snapshot?.grids?.find(grid=>grid.tid===snapshot.page_tid+';grdTargetColumns;tbl')?.fields;
  if(fixedCase==='cardinality-empty')return snapshot?.verified===true&&snapshot.inventory_complete===true&&snapshot.generation?.checked===false&&fields?.length===1
    &&fields[0].Name==='Value'&&fields[0].DisplayName==='Value'&&fields[0].DataType===4&&fields[0].Index===0&&typeof fields[0].Required==='boolean'&&fields[0].Broken!==true;
  return snapshot?.verified===true&&snapshot.generation?.checked===false&&fields?.length===2
    &&fields.every((field,i)=>field.Name===['ObservedID','PhaseMarker'][i]&&field.DataType===[4,5][i])
    &&(fixedCase!=='usage-output'||fields[0].DefaultUsageType===4);
}

export async function configureJavascriptSchema({page,context,mode,once,record,deadline,columnState,fixedCase}) {
  if(fixedCase!==undefined&&(!['cardinality-empty','usage-output'].includes(fixedCase)||mode!=='declared'))throw Error('Fixed declared schema mode required');
  let applied;
  const names=fixedCase==='cardinality-empty'?['Value']:['ObservedID','PhaseMarker'];
  const read=()=>page.evaluate(readJavascriptSchema,context);
  const first=await read();await record({phase:'javascript_schema_before',snapshot:first});
  if(first.verified!==true||first.form!=='JavaScriptColumnsWizard')throw Error('JavaScript output schema contract unconfirmed');
  const at=tid=>page.locator('[data-tid='+JSON.stringify(tid)+']').filter({visible:true});
  const click=async(id,tid)=>{
    const current=await read();if(!current.verified)throw Error('JavaScript schema changed before '+id);
    await once(id,{page_tid:current.page_tid,tid},()=>at(tid).click({timeout:Math.min(10000,deadline-Date.now())}));
  };
  if(first.generation.checked!==(mode==='code')) {
    if(first.generation.disabled)throw Error('JavaScript generation checkbox disabled');
    await click('schema-mode',first.generation.tid);
    const after=await read();
    if(after.generation.checked!==(mode==='code'))throw Error('JavaScript generation mode did not change');
  }
  if(mode==='declared') {
    const baseline=await read(),fields=baseline.grids.find(grid=>grid.tid===baseline.page_tid+';grdTargetColumns;tbl').fields;
    if(fields.length)throw Error('New declared trial must start with an empty schema');
    for(const [index,name] of names.entries()) {
      const editor=await openJavascriptColumnEditor({page,context,index,state:columnState,once,record,deadline,
        add:()=>at(baseline.page_tid+';btnAddMappingColumn').click({timeout:Math.max(1,Math.min(10000,deadline-Date.now()))})});
      if(index===0)await recordJavascriptColumnHelperSource({page,state:columnState,record});
      const base=editor.base;
      const effect=async(id,identity,target,kind,perform)=>once(id,identity,async()=>{
        await verifyJavascriptColumnEditor({page,state:columnState,record,deadline,target,kind});
        await perform();
      });
      const fill=async(suffix,value)=>{
        const field=at(base+';'+suffix).locator('input');
        await fillJavascriptColumnField({page,state:columnState,record,once,deadline,id:'schema-'+index+'-'+suffix,target:suffix,expected:value,
          fill:text=>field.fill(text,{timeout:Math.max(1,deadline-Date.now())})});
      };
      await fill('edtName',name);await fill('edtDisplayName',name);
      const expectedType=[4,5][index],expectedLabel=['Целый','Строковый'][index];
      await openJavascriptColumnTypePicker({page,state:columnState,record,once,deadline,id:'schema-type-open-'+index,expectedType,expectedLabel,
        click:(tid,timeout)=>at(tid).click({timeout})});
      await selectJavascriptColumnTypeOption({page,state:columnState,record,once,deadline,id:'schema-type-select-'+index,expectedType,expectedLabel});
      if(fixedCase==='usage-output'&&index===0){
        await openJavascriptColumnUsagePicker({page,state:columnState,record,once,deadline,id:'schema-usage-open',
          click:(tid,timeout)=>at(tid).click({timeout})});
        const selected=await selectJavascriptColumnUsageOption({page,state:columnState,record,once,deadline,id:'schema-usage-select'});
        if(selected.usage_picker?.cached_value!==4)throw Error('Declared output usage selection differs before Apply');
      }
      await effect('schema-apply-'+index,{base,name},'btnApply','click',async()=>{columnState.pending.applyDispatched=true;await at(base+';btnApply').click({timeout:Math.max(1,deadline-Date.now())});});
      applied=await settleJavascriptColumnEditor({page,state:columnState,record,deadline,phase:'applied'});
      const added=await read();await record({phase:'javascript_schema_added',index,snapshot:added});
      const observed=added.grids.find(grid=>grid.tid===added.page_tid+';grdTargetColumns;tbl').fields;
      if(observed.length!==index+1||observed[index].Name!==name||observed[index].DataType!==[4,5][index]
        ||fixedCase==='usage-output'&&index===0&&observed[index].DefaultUsageType!==4)throw Error('Declared column readback differs');
    }
  }
  const after=await read();await record({phase:'javascript_schema_after',snapshot:after});
  if(mode==='declared'&&!javascriptDeclaredColumnsMatch(after,fixedCase)||mode==='code'&&after.generation?.checked!==true)throw Error('JavaScript schema mode readback differs');
  if(fixedCase==='cardinality-empty'){
    if(applied?.status!=='settled'||applied.checks?.applied!==true)throw Error('Owned declared Apply settlement required');
    const field=after.grids.find(g=>g.tid===after.page_tid+';grdTargetColumns;tbl').fields[0];
    const declaration={fixture_id:fixedCase,schema_mode:'declared',generation:false,apply_verified:true,
      page_tid:after.page_tid,field:{record_id:field.record_id,name:field.Name,label:field.DisplayName,type:field.DataType,index:field.Index,required:field.Required}};
    Object.freeze(declaration.field);Object.freeze(declaration);
    const declaration_sha256=createHash('sha256').update(JSON.stringify(declaration)).digest('hex');
    const saved=await record({phase:'javascript_declared_empty_verified',declaration,declaration_sha256});
    if(saved?.phase!=='javascript_declared_empty_verified'||JSON.stringify(saved?.declaration)!==JSON.stringify(declaration)||saved?.declaration_sha256!==declaration_sha256)throw Error('Declared empty journal ACK differs');
    return {...after,declaration,declaration_sha256};
  }
  return after;
}
