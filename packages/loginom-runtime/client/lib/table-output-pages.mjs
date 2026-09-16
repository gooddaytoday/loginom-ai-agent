const requireValue=(value,message)=>{if(!value)throw Error(message);};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

// Assemble bounded native Table pages. No freshness/precision claim is added:
// the enclosing node operation must bind execution, settings and source audit.
export async function readTableOutputPages(channel,table,{sampleRows=10}={}) {
  requireValue(Number.isInteger(sampleRows)&&sampleRows>=0&&sampleRows<=10,'Table sample must be within 0–10');
  const columns=[],rows=[];let offset=0,limit=8,total=null,rowTotal=null,segment=null,scrolls=0,previousScroll=null,schemaId=null;
  for(let reads=0;reads<2300;reads++) {
    const s=await channel.observe({condition:'Table output columns at '+offset,tablePage:{table,page:{row_offset:0,row_limit:sampleRows,column_offset:offset,column_limit:limit}},
      ready:s=>s.node_table?.verified===true||s.node_table?.reason==='cell_not_visible'});
    const t=s.node_table;
    requireValue(typeof t.schema_id==='string'&&t.schema_id.length>0&&(!schemaId||schemaId===t.schema_id),'Table schema changed between pages');
    schemaId=t.schema_id;
    if(!t.verified) {
      // Keep a painted prefix rather than scrolling it out of view while trying
      // to read a page wider than the viewport.
      if(t.column_index>offset) {limit=t.column_index-offset;continue;}
      const w=t.horizontal_window;
      requireValue(t.column_index===offset&&w&&w.row_visible&&same(w.table,table)
        &&['left','max_left','viewport_left','viewport_right','cell_left','cell_right'].every(k=>Number.isFinite(w[k]))
        &&w.cell_right>w.cell_left&&w.cell_right-w.cell_left<=w.viewport_right-w.viewport_left+1,'Table cell cannot be revealed horizontally');
      requireValue(++scrolls<=1000,'Table output scroll budget exceeded');
      const controls=s.ui.elements.filter(e=>same(e.table_scroller,table)&&e.tid===w.tid&&e.horizontal_scroll?.ref===e.ref
        &&e.horizontal_scroll.left===w.left&&e.horizontal_scroll.max_left===w.max_left&&e.allowed_actions.includes('scroll_horizontal'));
      requireValue(controls.length===1,'Bound Table horizontal control unavailable');
      const to=Math.max(0,Math.min(w.max_left,w.left+w.cell_left-w.viewport_left)),delta=Math.max(-1000,Math.min(1000,Math.round(to-w.left)));
      requireValue(delta!==0&&previousScroll!==w.left,'Table horizontal scroll made no progress');
      previousScroll=w.left;
      await channel.perform({condition:'reveal Table output column '+offset,initialObservation:s,
        ready:s=>s.node_table?.horizontal_window?.left===w.left,
        resolve:s=>({verb:'scroll_horizontal',ref:s.ui.elements.find(e=>e.tid===w.tid&&same(e.table_scroller,table)).ref,delta_x:delta}),
        identity:()=>({table,column:offset})});
      continue;
    }
    requireValue(same(t.table,table)&&Number.isSafeInteger(t.row_total)&&t.row_total>=0
      &&Number.isInteger(t.column_total)&&t.column_total>=0&&t.column_total<=1000
      &&t.page.column_offset===offset&&t.page.column_limit===limit&&t.page.row_offset===0&&t.page.row_limit===sampleRows
      &&t.columns.length===Math.min(limit,t.column_total-offset)&&t.rows.length===Math.min(sampleRows,t.row_total)
      &&t.page.column_returned===t.columns.length&&t.page.row_returned===t.rows.length,'Invalid Table output page');
    if(total===null){total=t.column_total;rowTotal=t.row_total;segment=t.segment;}
    requireValue(total===t.column_total&&rowTotal===t.row_total&&same(segment,t.segment),'Table output changed between pages');
    requireValue(t.columns.every((c,i)=>c.index===offset+i),'Table output column order changed');
    for(const [i,row] of t.rows.entries()) {
      requireValue(row.index===i&&typeof row.record_id==='string'&&row.cells.length===t.columns.length
        &&row.cells.every((c,j)=>c.column===offset+j),'Table output row identity changed');
      if(offset===0)rows.push({index:i,record_id:row.record_id,cells:[]});
      requireValue(rows[i]?.record_id===row.record_id,'Table records changed between pages');
      rows[i].cells.push(...structuredClone(row.cells));
    }
    columns.push(...structuredClone(t.columns));offset+=t.columns.length;
    requireValue(t.page.next_column_offset===(offset===total?null:offset),'Table output cursor differs');
    if(offset===total) {
      requireValue(new Set(columns.map(c=>c.name)).size===columns.length,'Duplicate Table output column names');
      return {table,schema_id:schemaId,columns,rows,row_total:rowTotal,column_total:total,sample_complete:rows.length===rowTotal,
        ...(total===1&&t.applied_format?{applied_format:structuredClone(t.applied_format)}:{}),value_source:t.value_source,unfiltered_verified:false,execution_freshness_verified:false,numeric_precision_verified:false};
    }
    requireValue(t.columns.length>0,'Table output page did not advance');limit=8;previousScroll=null;
  }
  throw Error('Table output page budget exceeded');
}
