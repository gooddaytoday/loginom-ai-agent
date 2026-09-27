// Root-reviewed stage A only. Input fixture identity is deliberately separate.
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
  }
};
Object.values(cases).forEach(Object.freeze);Object.freeze(cases);
export const javascriptNamedIds=Object.freeze(Object.keys(cases));
export function javascriptNamedCase(id){
 if(!Object.hasOwn(cases,id))throw Error('Unknown fixed stage A named case');
 return cases[id];
}
export function javascriptNamedProbe(id){
 const c=javascriptNamedCase(id);
 if(createHash('sha256').update(c.source).digest('hex')!==c.source_sha256)throw Error('Named source pin differs');
 return Object.freeze({id:'native-'+id,named_case_id:c.id,input_fixture_id:c.input_fixture_id,schema_mode:'code',source:c.source,source_sha256:c.source_sha256,
  output_schema:Object.freeze([Object.freeze({name:'Value',label:'Value',type:4})])});
}
