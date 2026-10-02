// Operator-only P1 business source. The expected cells are read from the
// independently authored fixture and never inserted into the JavaScript body.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const prefix='import {InputTable,OutputTable,DataType} from "builtIn/Data";\n';
const columns='OutputTable.AssignColumns([{Name:"RowID",DataType:DataType.Integer},'
  +'{Name:"CustomerKey",DataType:DataType.String},{Name:"NetCents",DataType:DataType.Integer},'
  +'{Name:"Status",DataType:DataType.String}]);\n';
const body='for (var row=0;row<InputTable.RowCount;row++) {\n'
  +'  var id=InputTable.Get(row,"RowID");\n'
  +'  var customer=String(InputTable.Get(row,"Customer")).trim().toLowerCase();\n'
  +'  var quantity=InputTable.Get(row,"Qty");\n'
  +'  var price=InputTable.Get(row,"UnitPriceCents");\n'
  +'  var discount=InputTable.Get(row,"DiscountPct");\n'
  +'  var net=quantity*price*(100-discount)/100;\n'
  +'  OutputTable.Append();\n'
  +'  OutputTable.Set("RowID",id);\n'
  +'  OutputTable.Set("CustomerKey",customer);\n'
  +'  OutputTable.Set("NetCents",net);\n'
  +'  OutputTable.Set("Status",net<0?"возврат":net===0?"ноль":"продажа");\n'
  +'}\n';

export function javascriptBusinessProbes() {
  // Cold readers import the operator graph without loading business oracles.
  const root=new URL('../../../../docs/node-development/nodes/programming-javascript/fixtures/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
  const bytes=readFileSync(new URL('operator-only/expected.json',root));
  const pin=manifest.files.find(file=>file.path==='operator-only/expected.json');
  if(!pin||pin.bytes!==bytes.length||pin.sha256!==createHash('sha256').update(bytes).digest('hex'))
    throw Error('JavaScript business oracle fixture pin differs');
  const oracle=JSON.parse(bytes.toString('utf8'));
  if(oracle.kind!=='independent_business_oracle_specification'||oracle.status!=='authored_not_live_validated'
    ||oracle.schema?.length!==4||oracle.ordered_rows?.length!==6||oracle.numeric_tolerance!==0)
    throw Error('JavaScript business oracle shape differs');

  return ['code','declared'].flatMap(schema_mode=>['base','changed','reordered'].map(input_variant=>{
    const source=prefix+(schema_mode==='code'?columns:'')+body;
    const rows=structuredClone(oracle.ordered_rows);
    if(input_variant==='changed')rows[0][2]=oracle.changed.net_cents;
    return {id:'p1-business-'+schema_mode+'-'+input_variant,scope:'P1-business',schema_mode,input_variant,source,
      source_sha256:createHash('sha256').update(source,'utf8').digest('hex'),
      schema:oracle.schema.map(column=>({name:column.name,label:column.name,type:column.type})),
      expected:rows.map(row=>row.map((value,index)=>
        oracle.schema[index].type==='integer'?String(value):value)),
      oracle_sha256:pin.sha256,expectation:'fixed',build:'7.4.2',status:'not_run'};
  }));
}
