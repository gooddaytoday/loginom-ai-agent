// Count UTF-8 bytes for the backend's 50 KiB limit as well as the legacy
// JSON-wrapped envelope. Leave room for the caller's row/NULL limitations. Native full-table evidence
// has a separate strict contract and is never reduced here.
export const USER_PREVIEW_WIRE_BUDGET=46000;
export const previewWireSize=value=>Buffer.byteLength(JSON.stringify({result:JSON.stringify(value)}),'utf8');
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));

export function budgetUserPreview(reply) {
 if(previewWireSize(reply)<=USER_PREVIEW_WIRE_BUDGET)return;
 const ports=reply.output?.ports??[];
 if(ports.some(p=>p.exact_table||p.read_coverage||p.cell_precision||p.sample?.some(r=>r.some(c=>c.precision==='exact_native'))))return;
 for(const port of ports)for(const row of port.sample??[])for(const cell of row){
  // Decimal is the already verified round-trip binary64 value. Remove only
  // equivalent display/number duplicates, never infer numbers from UI text.
  if(cell.is_null===false&&cell.type==='real'&&cell.precision==='17_significant_digits'&&cell.representation==='binary64'
    &&typeof cell.decimal==='string'&&Number.isFinite(Number(cell.decimal))
    &&typeof cell.value==='number'&&Object.is(Number(cell.decimal),cell.value)){
   // A shorter decimal is safe only when it round-trips to the identical
   // binary64, including signed zero. This changes spelling, not precision.
   const shortest=Object.is(cell.value,-0)?'-0':String(cell.value);
   if(shortest.length<cell.decimal.length&&Object.is(Number(shortest),cell.value))cell.decimal=shortest;
   delete cell.value;
   if(typeof cell.display_text==='string'&&Object.is(Number(cell.display_text.replace(',','.')),Number(cell.decimal)))delete cell.display_text;
   delete cell.representation;
  }else if(cell.is_null===false&&cell.type==='integer'&&cell.precision==='exact_integer'&&cell.representation==='decimal_integer'
    &&typeof cell.value==='string'&&/^-?\d+$/.test(cell.value))delete cell.representation;
  else if(cell.is_null===false&&cell.type==='string'&&cell.precision==='display_text'&&cell.representation==='cached_display_text'
    &&typeof cell.value==='string')delete cell.representation;
 }
 if(previewWireSize(reply)>USER_PREVIEW_WIRE_BUDGET&&reply.configuration){
  reply.configuration={...pick(reply.configuration,['verified','mode']),
   readback:pick(reply.configuration.readback,['kind','scope','node','values_are','receipt_ids','package_persistence_verified']),
   readback_summary:true};
 }
 let omitted=0;
 while(previewWireSize(reply)>USER_PREVIEW_WIRE_BUDGET){
  const candidates=ports.filter(p=>p.sample?.length);
  if(!candidates.length)break;
  const port=candidates.reduce((a,b)=>JSON.stringify(a.sample).length>=JSON.stringify(b.sample).length?a:b);
  port.sample.pop();port.sample_rows=port.sample.length;port.sample_complete=false;omitted++;
 }
 if(omitted)reply.limitations.push('Preview response budget omitted '+omitted+' already-read rows. Full local receipts are retained. Returned samples are incomplete; use smaller analytical outputs, not an unavailable filesystem tool.');
}
