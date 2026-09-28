// Root-reviewed stages A/B/C only. Input fixture identity is deliberately separate.
import {createHash} from 'node:crypto';
const cases={
  "A-get-index": {
    "id": "A-get-index",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nfor (let row=0;row<4;row++) {\n  const value=InputTable.Get(row,0);\n  if (row === 0 ? value !== undefined && value !== null : typeof value !== \"number\") throw Error(\"JS_NAMED_VALUE_KIND\");\n  OutputTable.Append();\n  OutputTable.Set(\"Value\",value);\n}\n",
    "source_sha256": "ade8e3b5195f4c6cd81c09ced0836e909d1ad037b99b40ac152805630ffd8782",
    "oracle": "copy"
  },
  "A-get-exact": {
    "id": "A-get-exact",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nfor (let row=0;row<4;row++) {\n  const value=InputTable.Get(row,\"Value\");\n  if (row === 0 ? value !== undefined && value !== null : typeof value !== \"number\") throw Error(\"JS_NAMED_VALUE_KIND\");\n  OutputTable.Append();\n  OutputTable.Set(\"Value\",value);\n}\n",
    "source_sha256": "6befc43d503c85db5063fe2ae128cdbfc52db37f26cf449610639e3280079ab5",
    "oracle": "copy"
  },
  "A-getcolumn-index": {
    "id": "A-getcolumn-index",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst column=InputTable.GetColumn(0);\nif (column.Index !== 0 || column.Name !== \"Value\" || column.DisplayName !== \"Value\") throw Error(\"JS_NAMED_COLUMN_IDENTITY\");\nfor (let row=0;row<4;row++) {\n  const value=column.Get(row);\n  if (row === 0 ? value !== undefined && value !== null : typeof value !== \"number\") throw Error(\"JS_NAMED_VALUE_KIND\");\n  OutputTable.Append();\n  OutputTable.Set(\"Value\",value);\n}\n",
    "source_sha256": "bb2b3bbd7adf0204483b9a3367ba1506f2fc4fd9b89d45ce9381147ac8868766",
    "oracle": "copy"
  },
  "A-getcolumn-exact": {
    "id": "A-getcolumn-exact",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst column=InputTable.GetColumn(\"Value\");\nif (column.Index !== 0 || column.Name !== \"Value\" || column.DisplayName !== \"Value\") throw Error(\"JS_NAMED_COLUMN_IDENTITY\");\nfor (let row=0;row<4;row++) {\n  const value=column.Get(row);\n  if (row === 0 ? value !== undefined && value !== null : typeof value !== \"number\") throw Error(\"JS_NAMED_VALUE_KIND\");\n  OutputTable.Append();\n  OutputTable.Set(\"Value\",value);\n}\n",
    "source_sha256": "ddda422a0d6a06aa08ad0743fdfb616f18641e232aaa5b9921d8b752aa777ee1",
    "oracle": "copy"
  },
  "A-columns-index": {
    "id": "A-columns-index",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst column=InputTable.Columns[0];\nif (column.Index !== 0 || column.Name !== \"Value\" || column.DisplayName !== \"Value\") throw Error(\"JS_NAMED_COLUMN_IDENTITY\");\nfor (let row=0;row<4;row++) {\n  const value=column.Get(row);\n  if (row === 0 ? value !== undefined && value !== null : typeof value !== \"number\") throw Error(\"JS_NAMED_VALUE_KIND\");\n  OutputTable.Append();\n  OutputTable.Set(\"Value\",value);\n}\n",
    "source_sha256": "5410965b02be2a044a1973b31ca2290d60ee935a817109329728a4fa21021032",
    "oracle": "copy"
  },
  "A-columns-exact": {
    "id": "A-columns-exact",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst column=InputTable.Columns[\"Value\"];\nif (column.Index !== 0 || column.Name !== \"Value\" || column.DisplayName !== \"Value\") throw Error(\"JS_NAMED_COLUMN_IDENTITY\");\nfor (let row=0;row<4;row++) {\n  const value=column.Get(row);\n  if (row === 0 ? value !== undefined && value !== null : typeof value !== \"number\") throw Error(\"JS_NAMED_VALUE_KIND\");\n  OutputTable.Append();\n  OutputTable.Set(\"Value\",value);\n}\n",
    "source_sha256": "752e74be9ab4fb53adece872ec1492ee7fd761f4ec086229187965120eec902e",
    "oracle": "copy"
  },
  "A-isnull-index": {
    "id": "A-isnull-index",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nfor (let row=0;row<4;row++) {\n  const missing=InputTable.IsNull(row,0);\n  if (typeof missing !== \"boolean\") throw Error(\"JS_NAMED_NULL_KIND\");\n  const value=missing ? 1 : 0;\n  OutputTable.Append();\n  OutputTable.Set(\"Value\",value);\n}\n",
    "source_sha256": "1ab38e09307a876f96b6e3b83e2a46f3b34da9cb4f90a759413cd4d36dd0dc98",
    "oracle": "isnull"
  },
  "A-isnull-exact": {
    "id": "A-isnull-exact",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nfor (let row=0;row<4;row++) {\n  const missing=InputTable.IsNull(row,\"Value\");\n  if (typeof missing !== \"boolean\") throw Error(\"JS_NAMED_NULL_KIND\");\n  const value=missing ? 1 : 0;\n  OutputTable.Append();\n  OutputTable.Set(\"Value\",value);\n}\n",
    "source_sha256": "57ceade9570a31dc76f0e2a94e514c1ad7d4474470467ba69649d3dc2b4fb34c",
    "oracle": "isnull"
  },
  "B-get-case": {
    "id": "B-get-case",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst result=InputTable.Get(1,\"value\");\nconst code=result === undefined ? 10 : result === null ? 11 : result === -9007199254740991 ? 12 : 99;\nOutputTable.Append();\nOutputTable.Set(\"Value\",code);\n",
    "source_sha256": "ca569c1320bf7c160803b9031524feaadf4adecf87f1bd00ee4eff043599c505",
    "oracle": "get-return",
    "output_rows": 1
  },
  "B-get-missing": {
    "id": "B-get-missing",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst result=InputTable.Get(1,\"Missing\");\nconst code=result === undefined ? 10 : result === null ? 11 : result === -9007199254740991 ? 12 : 99;\nOutputTable.Append();\nOutputTable.Set(\"Value\",code);\n",
    "source_sha256": "8e2ed7bf78ccb567121f257dc43058dddc284ef7384df4a45eeabdbfa0e7329c",
    "oracle": "get-return",
    "output_rows": 1
  },
  "B-getcolumn-case": {
    "id": "B-getcolumn-case",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst result=InputTable.GetColumn(\"value\");\nconst code=result === undefined ? 10 : result === null ? 11 : (typeof result === \"object\" && result.Index === 0 && result.Name === \"Value\" && result.DisplayName === \"Value\" && result.Get(1) === -9007199254740991) ? 13 : 99;\nOutputTable.Append();\nOutputTable.Set(\"Value\",code);\n",
    "source_sha256": "08054f2f62477f665c8b92bd0414755dc0e66e3ba8008439aa05d28500c3eb30",
    "oracle": "column-return",
    "output_rows": 1
  },
  "B-getcolumn-missing": {
    "id": "B-getcolumn-missing",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst result=InputTable.GetColumn(\"Missing\");\nconst code=result === undefined ? 10 : result === null ? 11 : (typeof result === \"object\" && result.Index === 0 && result.Name === \"Value\" && result.DisplayName === \"Value\" && result.Get(1) === -9007199254740991) ? 13 : 99;\nOutputTable.Append();\nOutputTable.Set(\"Value\",code);\n",
    "source_sha256": "4832a8582d5af517d8f60c2a2c8499ce8b4c131a3ba78b952bcd3f9dfd3f038d",
    "oracle": "column-return",
    "output_rows": 1
  },
  "B-columns-case": {
    "id": "B-columns-case",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst result=InputTable.Columns[\"value\"];\nconst code=result === undefined ? 10 : result === null ? 11 : (typeof result === \"object\" && result.Index === 0 && result.Name === \"Value\" && result.DisplayName === \"Value\" && result.Get(1) === -9007199254740991) ? 13 : 99;\nOutputTable.Append();\nOutputTable.Set(\"Value\",code);\n",
    "source_sha256": "d60e2aa72f3585e87c09073c0c002cc465846b39a146f719c494276f8271cc19",
    "oracle": "column-return",
    "output_rows": 1
  },
  "B-columns-missing": {
    "id": "B-columns-missing",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst result=InputTable.Columns[\"Missing\"];\nconst code=result === undefined ? 10 : result === null ? 11 : (typeof result === \"object\" && result.Index === 0 && result.Name === \"Value\" && result.DisplayName === \"Value\" && result.Get(1) === -9007199254740991) ? 13 : 99;\nOutputTable.Append();\nOutputTable.Set(\"Value\",code);\n",
    "source_sha256": "13c5ccc3c6aec7723b5401b1853ee4d2f343444a566e0d37a7f520e4173e766f",
    "oracle": "column-return",
    "output_rows": 1
  },
  "B-isnull-case": {
    "id": "B-isnull-case",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst result=InputTable.IsNull(0,\"value\");\nconst code=result === true ? 14 : result === false ? 15 : result === undefined ? 10 : result === null ? 11 : 99;\nOutputTable.Append();\nOutputTable.Set(\"Value\",code);\n",
    "source_sha256": "dc8be58b76ab183e2b3be3921886a2bac1fc37eb0ea30470d763c37522cf4c1b",
    "oracle": "isnull-return",
    "output_rows": 1
  },
  "B-isnull-missing": {
    "id": "B-isnull-missing",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nconst result=InputTable.IsNull(0,\"Missing\");\nconst code=result === true ? 14 : result === false ? 15 : result === undefined ? 10 : result === null ? 11 : 99;\nOutputTable.Append();\nOutputTable.Set(\"Value\",code);\n",
    "source_sha256": "7133ef6538cd9f2d09e652df0eafcdba8fe89d8619b8a8be22fa898368b577c4",
    "oracle": "isnull-return",
    "output_rows": 1
  },
  "C-set-index": {
    "id": "C-set-index",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nconst value=InputTable.Get(1,\"Value\");\nif (typeof value !== \"number\" || value !== -9007199254740991) throw Error(\"JS_NAMED_INPUT_VALUE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",0);\nOutputTable.Set(0,value);\n",
    "source_sha256": "83cac05c5b23db232bd5a89d522e15a6665997cb9083b451c855e914f3186b2e",
    "oracle": "set-exact",
    "output_rows": 1
  },
  "C-set-exact": {
    "id": "C-set-exact",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nconst value=InputTable.Get(1,\"Value\");\nif (typeof value !== \"number\" || value !== -9007199254740991) throw Error(\"JS_NAMED_INPUT_VALUE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",0);\nOutputTable.Set(\"Value\",value);\n",
    "source_sha256": "3e840949275b92e7a275458ee0abb27d02fd16fc8483b7877a1d927338ccd05d",
    "oracle": "set-exact",
    "output_rows": 1
  },
  "C-set-case": {
    "id": "C-set-case",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nconst value=InputTable.Get(1,\"Value\");\nif (typeof value !== \"number\" || value !== -9007199254740991) throw Error(\"JS_NAMED_INPUT_VALUE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",0);\nOutputTable.Set(\"value\",value);\n",
    "source_sha256": "f7ddd2dec629713271d2158b23e9f923ab152c538601b38c9b114a1797599557",
    "oracle": "set-value",
    "output_rows": 1
  },
  "C-set-missing": {
    "id": "C-set-missing",
    "input_fixture_id": "integer-safe",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_NAMED_INPUT_SHAPE\");\nconst value=InputTable.Get(1,\"Value\");\nif (typeof value !== \"number\" || value !== -9007199254740991) throw Error(\"JS_NAMED_INPUT_VALUE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",0);\nOutputTable.Set(\"Missing\",value);\n",
    "source_sha256": "511b1301e74288974c138b8af0207b332277d0d95af9e7daa5f066375b4d6a26",
    "oracle": "set-value",
    "output_rows": 1
  }
};
Object.values(cases).forEach(Object.freeze);Object.freeze(cases);
export const javascriptNamedIds=Object.freeze(Object.keys(cases));
export function javascriptNamedCase(id){
 if(!Object.hasOwn(cases,id))throw Error('Unknown fixed stage A/B/C named case');
 return cases[id];
}
export function javascriptNamedProbe(id){
 const c=javascriptNamedCase(id);
 if(createHash('sha256').update(c.source).digest('hex')!==c.source_sha256)throw Error('Named source pin differs');
 return Object.freeze({id:'native-'+id,named_case_id:c.id,input_fixture_id:c.input_fixture_id,schema_mode:'code',source:c.source,source_sha256:c.source_sha256,
  output_schema:Object.freeze([Object.freeze({name:'Value',label:'Value',type:4})])});
}
