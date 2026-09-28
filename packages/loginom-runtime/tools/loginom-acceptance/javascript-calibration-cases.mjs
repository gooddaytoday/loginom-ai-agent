import {createHash} from 'node:crypto';
const prefix='import {InputTable,OutputTable,DataType} from "builtIn/Data";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error("JS_NAMED_INPUT_SHAPE");\nOutputTable.AssignColumns([{Name:"Value",DisplayName:"Value",DataType:DataType.Integer}]);\n';
const cases={
 'K1-parse-v1':{source:prefix+'const result=(1 + );\n',source_sha256:'721161cd4f4c0de387cefeef03b2425fd20f5645c05bff724103e330acd1620f'},
 'K2-sync-v1':{source:prefix+'throw new Error("JS_CAL_K2_SYNC_V1");\n',source_sha256:'3f7350f5f9e7cb30107fb314643ae844477a7b87610132036e995f556fe983c2'},
 'K3-shift-v1':{source:prefix+'\n  throw new Error("JS_CAL_K3_SYNC_SHIFT_V1");\n',source_sha256:'02b7e36c08e2d1f18fe83e60ed145d00bef83746fbe14b1328b1b6ba91ab76b3'}
};
export const javascriptCalibrationIds=Object.freeze(Object.keys(cases));
export function javascriptCalibrationCase(id){
 if(!Object.hasOwn(cases,id))throw Error('Unknown fixed calibration case');
 const c=cases[id];
 if(createHash('sha256').update(c.source,'utf8').digest('hex')!==c.source_sha256)throw Error('Calibration source pin differs');
 return Object.freeze({id:'calibration-'+id,calibration_id:id,input_fixture_id:'integer-safe',schema_mode:'code',...c,
  output_schema:Object.freeze([Object.freeze({name:'Value',label:'Value',type:4})])});
}

// Observations only. In particular, even an exact literal header is a candidate
// for independent review, never automatic source-coordinate/B attribution.
export function calibrationDiagnostic(proof,id){
 javascriptCalibrationCase(id);
 const text=proof.error_details;
 if(typeof text!=='string'||!Number.isSafeInteger(proof.native_text_length)||proof.native_text_length<1
  ||text.length!==Math.min(proof.native_text_length,1000)||proof.native_error_complete!==(proof.native_text_length===text.length))throw Error('Calibration raw completeness differs');
 const complete=proof.native_error_complete,lines=text.trim().split(/\r?\n/);
 const header=/^(Error|SyntaxError|TypeError|RangeError|ReferenceError): ([^\r\n]*)$/.exec(lines[0]);
 const frames=lines.slice(1).map(line=>/^\s+at (Anonymous function|module) \((<main>|<preview>):([1-9][0-9]*):([1-9][0-9]*)\)$/.exec(line));
 const recognized=!!header&&frames.every(f=>f&&Number.isSafeInteger(Number(f[3]))&&Number.isSafeInteger(Number(f[4])));
 return {diagnostic_origin:'native_child',native_text_complete:complete,native_text_length:proof.native_text_length,
  truncated:!complete,normalization_applied:'parser trim/CRLF split; raw preserved; receipt separately trimmed',
  class_observed:recognized?header[1]:null,class_source:recognized?'native_header_closed_grammar_v1':null,
  position_status:!complete?'incomplete':!recognized?'unrecognized':frames.length?'observed':'absent',
  frames:recognized?frames.map(f=>({raw:f[0],function:f[1],module:f[2],line:Number(f[3]),column:Number(f[4])})):[],
  literal_header_candidate:complete&&recognized&&(id==='K2-sync-v1'&&header[0]==='Error: JS_CAL_K2_SYNC_V1'
   ||id==='K3-shift-v1'&&header[0]==='Error: JS_CAL_K3_SYNC_SHIFT_V1'),
  parse_header_observed:complete&&recognized&&header[1]==='SyntaxError',
  attribution:'execution_only',controlled_throw_verified:false,mapping_status:'unverified',source_span:null,
  rejection_attributed:false,case_complete:false,g6_complete:false,j25_complete:false,server_os:{status:'not_observed'}};
}

export {captureCalibrationWizard} from './javascript-calibration-wizard.mjs';
