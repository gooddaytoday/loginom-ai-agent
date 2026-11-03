// XLSX remains a file sink. This separate expectation reads its saved input
// schema/values; the approved ZIP/XML oracle independently checks the workbook.
export function excelColdExpected(expected){
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
  ||s.file_type!==1||s.number_format!==0||s.divide_thousands!==false)throw Error('XLSX_COLD_SETTINGS');
 return true;
}
