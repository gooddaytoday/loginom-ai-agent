// XLSX remains a file sink. This separate expectation reads its saved input
// schema/values; the approved ZIP/XML oracle independently checks the workbook.
export function excelColdExpected(expected){
 if(expected.excel_books){
  const sinks=expected.excel_books;
  if(!sinks.length||sinks.some(s=>s.output_node_type!=='exports.excel'||s.output_port!==null||!['xls','xlsx'].includes(s.format)))throw Error('EXCEL_SINK_EXPECTED');
  const sink=sinks[0];
  return {package_path:expected.package_path,nodes:expected.nodes,xlsx_sink:sink,excel_sinks:sinks,outputs:[{
   output_node_type:'export_input',export_destination:sink.export_destination,ordered:true,
   columns:sink.columns,rows:sink.rows.map(row=>Object.fromEntries(sink.columns.map((c,i)=>[c.name,row[i]])))
  }]};
 }
 const sink=expected.outputs?.[0]??expected;
 if(sink.output_node_type!=='exports.excel'||sink.format!=='xlsx')return null;
 if(sink.output_port!==null||expected.outputs&&expected.outputs.length!==1)throw Error('XLSX_SINK_EXPECTED');
 return {package_path:expected.package_path,nodes:expected.nodes,xlsx_sink:sink,outputs:[{
  output_node_type:'export_input',export_destination:sink.export_destination,ordered:true,
  columns:sink.columns.map(c=>{const {tolerance,...column}=c;return c.type==='datetime'?column:c;}),
  rows:sink.rows.map(row=>Object.fromEntries(sink.columns.map((c,i)=>[c.name,row[i]])))
 }]};
}
export function verifyExcelColdSettings(destinations,sink){
 const matches=destinations.filter(d=>d.destination===sink.export_destination);
 if(matches.length!==1)throw Error('XLSX_COLD_DESTINATION');
 const s=matches[0].excel_settings;
 if(!s||s.sheet_name!==sink.sheet_name||s.header!=={none:0,names:1,labels:2}[sink.header]
  ||s.file_type!==(sink.format==='xls'?0:1)||s.number_format!==(sink.number_format??0)||s.divide_thousands!==(sink.divide_thousands??false)||sink.number_format===1&&s.decimal_count!==sink.decimal_count)throw Error('XLSX_COLD_SETTINGS');
 return true;
}
