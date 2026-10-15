// G2/G3 preparation only. Importing this module never executes a Loginom script.
import {createHash} from 'node:crypto';

export function javascriptExecutionProbes(inputTechnicalName) {
  if(typeof inputTechnicalName!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(inputTechnicalName))throw Error('Verified ASCII input technical name required');
  const columns=[{Name:'ObservedID',DataType:'Integer'},{Name:'PhaseMarker',DataType:'String'}];
  const generated='OutputTable.AssignColumns([{Name:"ObservedID",DataType:DataType.Integer},{Name:"PhaseMarker",DataType:DataType.String}]);\n';
  const prefix='import {InputTable,OutputTable,DataType} from "builtIn/Data";\n';
  const rows=`for (let row=0;row<InputTable.RowCount;row++) {
    OutputTable.Append();
    OutputTable.Set("ObservedID",InputTable.Get(row,${JSON.stringify(inputTechnicalName)}));
    OutputTable.Set("PhaseMarker","JS_G2_TABLE_V1");
}
`;
  return ['declared','code'].flatMap(mode=>[
    {id:mode+'-execution-sentinel',schema_mode:mode,source:'throw new Error("JS_G2_EXECUTION_SENTINEL_V1");\n',
      expectation:'Exact sentinel is positive evidence of execution; absence alone is not evidence of no execution.'},
    {id:mode+'-table-v1',schema_mode:mode,source:prefix+(mode==='code'?generated:'')+rows,
      expectation:'Six verified RowID input rows must produce six typed rows in original order.'}
  ]).map(p=>Object.freeze({...p,source_sha256:createHash('sha256').update(p.source,'utf8').digest('hex'),
    input_technical_name:inputTechnicalName,columns:Object.freeze(columns.map(c=>Object.freeze({...c}))),status:'not_run'}));
}
