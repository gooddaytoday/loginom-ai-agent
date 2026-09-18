const requireValue=(v,m)=>{if(!v)throw Error(m);};
const sameTable=(a,b)=>a&&b&&['view_guid','port_guid','table_tid'].every(k=>a[k]===b[k]);

// Decimal strings preserve integer precision across JSON clients. Real values
// use the explicit 17-significant-digit UI format; keep both canonical decimal
// text and its binary64 value. Other display formats retain explicit limits.
export function decodeTableOutput(output,{formatProof,readSettings,expectedColumns,requireExactNumbers=false}) {
  const {table,columns,rows}=output;
  const applied=output.applied_format,expectedMask=columns.length===1&&formatProof?.fields?.length===1
    ?[...(formatProof.numeric_formats??[]),...(formatProof.datetime_formats??[])].filter(f=>f.index===0&&f.key===columns[0].name&&f.type===columns[0].type):[];
  const appliedSingle=formatProof?.format_application_pending===true&&applied?.verified===true&&sameTable(table,applied.table)
    &&applied.source==='applied_table_format_ui_cache'&&applied.result==='ok'&&applied.modal_tid===table.table_tid+';ModalWindow_BrowseFormat'
    &&expectedMask.length===1&&applied.fields?.length===1&&applied.fields[0].index===0&&applied.fields[0].key===columns[0].name
    &&applied.fields[0].type===columns[0].type&&applied.fields[0].mask===expectedMask[0].mask;
  const displayOnly = formatProof === null && requireExactNumbers === false;
  requireValue((displayOnly || (sameTable(table,formatProof?.table)
    &&(formatProof.dialog_readback_verified===true||appliedSingle)))&&sameTable(table,readSettings?.table)&&readSettings.settings_applied===true
    &&readSettings.filter_enabled===false&&readSettings.null_display===true&&readSettings.type_icons===true,'Table settings proof is missing or foreign');
  requireValue(Array.isArray(expectedColumns)&&columns.length===expectedColumns.length&&columns.length===output.column_total
    &&columns.every((c,i)=>c.index===i&&['name','label','type'].every(k=>c[k]===expectedColumns[i][k])),'Table schema differs from the configured output');
  requireValue(displayOnly || (formatProof.fields?.length===columns.length&&formatProof.fields.every((f,i)=>f.index===i&&f.key===columns[i].name&&f.type===columns[i].type)),
    'Table formatting schema differs');
  const schema=columns.map((c,i)=>({...c,data_kind:expectedColumns[i].data_kind})),limits=new Set();
  const values=rows.map((r,i)=>{
    requireValue(r.index===i&&r.cells.length===schema.length,'Incomplete typed Table row');
    return r.cells.map((cell,j)=>{
      const type=schema[j].type;requireValue(cell.column===j&&typeof cell.is_null==='boolean','Typed Table cell identity differs');
      if(cell.is_null){requireValue(cell.text===null,'Null cell carries text');return {type,is_null:true,value:null,precision:'exact_null'};}
      requireValue(typeof cell.text==='string','Table cell text is missing');
      if(type==='integer'||type==='real') {
        const proofs=(formatProof?.numeric_formats??[]).filter(f=>f.index===j&&f.key===schema[j].name&&f.type===type);
        const mask=type==='integer'?'0':'0.################E+00';
        const precision=proofs.length===1&&proofs[0].mask===mask&&proofs[0].verified_format?.mask===mask&&proofs[0].verified_format.index===j&&proofs[0].verified_format.key===schema[j].name&&proofs[0].verified_format.type===type;
        if(precision&&type==='integer'&&/^-?(?:0|[1-9][0-9]*)$/.test(cell.text))return {type,is_null:false,value:BigInt(cell.text).toString(),representation:'decimal_integer',precision:'exact_integer',display_text:cell.text};
        if(precision&&type==='real'&&/^-?[0-9](?:[.,][0-9]{1,16})?E[+-][0-9]{2,3}$/i.test(cell.text)) {
          const canonical=cell.text.replace(',','.').replace('e','E'),value=Number(canonical);
          if(Number.isFinite(value)&&(value!==0||/^-?0(?:[.]0+)?E/i.test(canonical)))return {type,is_null:false,value,decimal:canonical,representation:'binary64',precision:'17_significant_digits',display_text:cell.text};
        }
        requireValue(!requireExactNumbers,'Exact numeric Table value is not verified');limits.add('numeric_display_precision');
      } else if(type==='boolean' && ['Истина','Ложь'].includes(cell.text))return {
        type,is_null:false,value:cell.text==='Истина',representation:'native_boolean_label',precision:'exact_boolean',display_text:cell.text};
      else if(type==='datetime') {
        const proofs=(formatProof?.datetime_formats??[]).filter(f=>f.index===j&&f.key===schema[j].name&&f.type===type);
        const mask='yyyy-mm-dd hh:nn:ss.zzz',proof=proofs[0];
        const m=/^([0-9]{4})-([0-9]{2})-([0-9]{2}) ([0-9]{2}):([0-9]{2}):([0-9]{2})[.]([0-9]{3})$/.exec(cell.text);
        if(proofs.length===1&&proof.mask===mask&&proof.verified_format?.mask===mask
          &&proof.verified_format.index===j&&proof.verified_format.key===schema[j].name&&proof.verified_format.type===type&&m) {
          const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number);
          const leap=year%4===0&&(year%100!==0||year%400===0);
          const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
          if(year>=1&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<24&&minute<60&&second<60)
            return {type,is_null:false,value:cell.text.replace(' ','T'),representation:'local_datetime',precision:'millisecond',timezone:'unspecified',display_text:cell.text};
        }
        limits.add('datetime_display_precision');
      }
      else if(type==='string')return {type,is_null:false,value:cell.text,representation:'cached_display_text',precision:'display_text'};
      else {requireValue(type!=='variant'||!requireExactNumbers,'Exact variant value and native subtype are not verified');limits.add(type+'_display_precision');}
      return {type,is_null:false,display_text:cell.text,representation:'formatted_display',precision:'unverified'};
    });
  });
  return {table,schema,row_count:output.row_total,sample:values,sample_rows:values.length,sample_complete:output.sample_complete,
    precision:{numbers_verified:!limits.has('numeric_display_precision')&&!limits.has('variant_display_precision'),limitations:[...limits],strings:'cached UI text; source completeness requires independent audit'},
    table_schema_id:output.schema_id,filter_enabled:false,...(output.read_limit?{limitations:[output.read_limit]}:{})};
}
