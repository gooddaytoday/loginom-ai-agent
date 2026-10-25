import test from 'node:test';
import assert from 'node:assert/strict';
import {Page} from './support/workspace-ui-fixture.mjs';

// LAB-82 q7: the last completed storage scan has 58 file controls / 1047
// detail elements before three controls/time refusals. Rebuild that scale;
// the journal is an observation, not a complete historical DOM recording.
function storageFixture() {
  let elapsed=0,queries=0,ranges=0,loading=false;
  class Clock extends Date {static now(){return elapsed;}}
  const page=new Page({clock:Clock}),base='MF;TF-1;FileStorageForm;';
  const grid=page.add('div',base+'pnlFileStorage');grid.id='files-grid';
  const table=page.add('div',base+'pnlFileStorage;tbl','',undefined,grid);
  const records=[],rows=[],cells=[];
  for(let i=0;i<58;i++) {
    const name='export-'+i+'.csv',row=page.add('table',null,'',undefined,table);row.attrs.class='x-grid-item';
    const cell=page.add('td',base+'colName_'+name,name,undefined,row);
    page.add('td',base+'colFileType_'+name,'Текстовый файл',undefined,row);
    for(let n=0;n<15;n++)page.add('span',null,'',undefined,row);
    records.push({isModel:true,data:{id:'/user/'+name,FilePath:'/user/'+name,FileName:name,Type:0,Size:123}});
    rows.push(row);cells.push(cell);
  }
  const store={$className:'bg.filedialog.FileStore',isBufferedStore:false,isLoading:()=>loading,
    getCount:()=>records.length,getRange:()=>{ranges++;return [...records];}};
  const view={el:{dom:table},getRecord:row=>records[rows.indexOf(row)],getNode:record=>rows[records.indexOf(record)]};
  page.context.Ext={getCmp:id=>id===grid.id?{el:{dom:grid},getView:()=>view,getStore:()=>store}:null};
  const query=page.document.querySelectorAll.bind(page.document);
  page.document.querySelectorAll=selector=>{
    if([base+'pnlFileStorage',base+'pnlFileStorage;tbl'].some(tid=>selector==='[data-tid='+JSON.stringify(tid)+']')){
      queries++;elapsed+=10;
    }
    return query(selector);
  };
  return {page,table,cells,records,view,rows,
    reset(){elapsed=queries=ranges=0;},loading(value){loading=value;},counts:()=>({queries,ranges})};
}

test('q7 storage scan inventories its exact native grid once within the unchanged time budget',async()=>{
  const f=storageFixture();
  const roots=await f.page.execute({mode:'observe',discover_roots:true});
  const root=roots.output.ui.elements.find(e=>e.tid===f.table.attrs['data-tid']);
  assert.ok(root);f.reset();
  const read=()=>f.page.execute({mode:'observe',root_ref:root.ref});
  const result=await read();
  assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
  assert.equal(result.output.scan.max_ms,500);
  assert.equal(result.output.scan.max_work,250000);
  const files=result.output.ui.elements.filter(e=>e.storage_entry);
  assert.equal(files.length,58);
  assert.ok(files.every(e=>e.storage_entry.kind==='file'&&e.storage_entry.bytes===123));
  assert.deepEqual(f.counts(),{queries:2,ranges:1});
  f.loading(true);f.reset();
  const next=await read();
  assert.equal(next.status,'SUCCEEDED');
  assert.ok(next.output.ui.elements.filter(e=>e.storage_entry).every(e=>e.storage_entry.kind==='unknown'&&e.storage_entry.bytes===undefined));
  assert.equal(f.counts().ranges,0);
});

test('shared storage inventory still checks each row record and native view owner',async()=>{
  const f=storageFixture();
  f.view.getNode=record=>record===f.records[1]?f.rows[0]:f.rows[f.records.indexOf(record)];
  const result=await f.page.execute({mode:'observe'});
  assert.equal(result.status,'SUCCEEDED');
  const files=result.output.ui.elements.filter(e=>e.storage_entry);
  assert.equal(files.find(e=>e.tid===f.cells[0].attrs['data-tid']).storage_entry.kind,'file');
  assert.equal(files.find(e=>e.tid===f.cells[1].attrs['data-tid']).storage_entry.kind,'unknown');
});
