// Root-reviewed seven fixed private cases. Never a caller-supplied source or oracle.
const cases={
  "integer-coercion-fraction-positive": {
    "id": "integer-coercion-fraction-positive",
    "file": "javascript-native-input-integer-coercion-fraction-positive.csv",
    "rows": 1,
    "columns": 1,
    "bytes": 11,
    "sha256": "8bef552b1ef66cdeaf5e382ffc56658cb6c6117ff9e8ffd7bb2bf1a2f3bee765",
    "type": "real",
    "native_type": 3,
    "js_type": "Float",
    "data_kind": "Непрерывный",
    "values": [
      1.75
    ],
    "expected_bytes": [
      "000000000000fc3f"
    ],
    "coercion": true,
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 1 || InputTable.ColumnCount !== 1 || InputTable.IsNull(0,\"Value\")) throw Error(\"JS_INT_COERCION_INPUT_SHAPE\");\nconst input=InputTable.Get(0,\"Value\");\nif (typeof input !== \"number\" || input !== 1.75) throw Error(\"JS_INT_COERCION_INPUT_VALUE\");\nconst candidate=input;\nif (!(typeof candidate === \"number\" && candidate === 1.75)) throw Error(\"JS_INT_COERCION_CANDIDATE\");\nOutputTable.AssignColumns([{Name:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",candidate);\n",
    "source_sha256": "6392d7bd6ecfb37351160aef70a94fa52f4786124daf2d14d789120292173e4e"
  },
  "integer-coercion-fraction-negative": {
    "id": "integer-coercion-fraction-negative",
    "file": "javascript-native-input-integer-coercion-fraction-negative.csv",
    "rows": 1,
    "columns": 1,
    "bytes": 12,
    "sha256": "903706717263f47c0a16baf6780062e1334cd12b76e59c9a7b9ad8147ec4f66b",
    "type": "real",
    "native_type": 3,
    "js_type": "Float",
    "data_kind": "Непрерывный",
    "values": [
      -1.75
    ],
    "expected_bytes": [
      "000000000000fcbf"
    ],
    "coercion": true,
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 1 || InputTable.ColumnCount !== 1 || InputTable.IsNull(0,\"Value\")) throw Error(\"JS_INT_COERCION_INPUT_SHAPE\");\nconst input=InputTable.Get(0,\"Value\");\nif (typeof input !== \"number\" || input !== -1.75) throw Error(\"JS_INT_COERCION_INPUT_VALUE\");\nconst candidate=input;\nif (!(typeof candidate === \"number\" && candidate === -1.75)) throw Error(\"JS_INT_COERCION_CANDIDATE\");\nOutputTable.AssignColumns([{Name:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",candidate);\n",
    "source_sha256": "c6cc020cb53965aec934f072c82ecc0ea5fcaebe0385b650adfa889e478a15fa"
  },
  "integer-coercion-string-numeric": {
    "id": "integer-coercion-string-numeric",
    "file": "javascript-native-input-integer-coercion-string-numeric.csv",
    "rows": 1,
    "columns": 1,
    "bytes": 11,
    "sha256": "97a11b225d4b86224e07f533e327c4e1d8d9da458818a2dca5b76d170504ca19",
    "type": "string",
    "native_type": 5,
    "js_type": "String",
    "data_kind": "Дискретный",
    "values": [
      "42"
    ],
    "expected_bytes": [
      "3432"
    ],
    "coercion": true,
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 1 || InputTable.ColumnCount !== 1 || InputTable.IsNull(0,\"Value\")) throw Error(\"JS_INT_COERCION_INPUT_SHAPE\");\nconst input=InputTable.Get(0,\"Value\");\nif (typeof input !== \"string\" || input !== \"42\") throw Error(\"JS_INT_COERCION_INPUT_VALUE\");\nconst candidate=input;\nif (!(typeof candidate === \"string\" && candidate === \"42\")) throw Error(\"JS_INT_COERCION_CANDIDATE\");\nOutputTable.AssignColumns([{Name:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",candidate);\n",
    "source_sha256": "263d9de6fa75ce6c1ac9379eabeca1114407998ec00c5ff6fcaffe4a001306c6"
  },
  "integer-coercion-string-invalid": {
    "id": "integer-coercion-string-invalid",
    "file": "javascript-native-input-integer-coercion-string-invalid.csv",
    "rows": 1,
    "columns": 1,
    "bytes": 23,
    "sha256": "0b95bd2da8b44656df1d42d2734d0c7aa462a2802293e18b732e8db4515dfe89",
    "type": "string",
    "native_type": 5,
    "js_type": "String",
    "data_kind": "Дискретный",
    "values": [
      "not-an-integer"
    ],
    "expected_bytes": [
      "6e6f742d616e2d696e7465676572"
    ],
    "coercion": true,
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 1 || InputTable.ColumnCount !== 1 || InputTable.IsNull(0,\"Value\")) throw Error(\"JS_INT_COERCION_INPUT_SHAPE\");\nconst input=InputTable.Get(0,\"Value\");\nif (typeof input !== \"string\" || input !== \"not-an-integer\") throw Error(\"JS_INT_COERCION_INPUT_VALUE\");\nconst candidate=input;\nif (!(typeof candidate === \"string\" && candidate === \"not-an-integer\")) throw Error(\"JS_INT_COERCION_CANDIDATE\");\nOutputTable.AssignColumns([{Name:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",candidate);\n",
    "source_sha256": "cc7cbdfd0262956f66896395b8ad85e48879e8b5fac70a70be7bf21712b68fd2"
  },
  "integer-coercion-nan": {
    "id": "integer-coercion-nan",
    "file": "javascript-native-input-integer-coercion-nan.csv",
    "rows": 1,
    "columns": 1,
    "bytes": 8,
    "sha256": "cbae8bbee4380c47abea5ce84baeaf1391c345a8950e731fc77935afe4e4bad6",
    "type": "real",
    "native_type": 3,
    "js_type": "Float",
    "data_kind": "Непрерывный",
    "values": [
      0
    ],
    "expected_bytes": [
      "0000000000000000"
    ],
    "coercion": true,
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 1 || InputTable.ColumnCount !== 1 || InputTable.IsNull(0,\"Value\")) throw Error(\"JS_INT_COERCION_INPUT_SHAPE\");\nconst input=InputTable.Get(0,\"Value\");\nif (typeof input !== \"number\" || input !== 0) throw Error(\"JS_INT_COERCION_INPUT_VALUE\");\nconst candidate=input / input;\nif (!(typeof candidate === \"number\" && candidate !== candidate)) throw Error(\"JS_INT_COERCION_CANDIDATE\");\nOutputTable.AssignColumns([{Name:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",candidate);\n",
    "source_sha256": "e145174ca2472dab41c0d1433fd27c87aca7a2391459f04a0e579930ac7085ff"
  },
  "integer-coercion-positive-infinity": {
    "id": "integer-coercion-positive-infinity",
    "file": "javascript-native-input-integer-coercion-positive-infinity.csv",
    "rows": 1,
    "columns": 1,
    "bytes": 8,
    "sha256": "c4b301392924e65794be7ce5ade35a17462cefb36ea095c95b91a36d03c1bcf6",
    "type": "real",
    "native_type": 3,
    "js_type": "Float",
    "data_kind": "Непрерывный",
    "values": [
      1
    ],
    "expected_bytes": [
      "000000000000f03f"
    ],
    "coercion": true,
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 1 || InputTable.ColumnCount !== 1 || InputTable.IsNull(0,\"Value\")) throw Error(\"JS_INT_COERCION_INPUT_SHAPE\");\nconst input=InputTable.Get(0,\"Value\");\nif (typeof input !== \"number\" || input !== 1) throw Error(\"JS_INT_COERCION_INPUT_VALUE\");\nconst candidate=input / 0;\nif (!(typeof candidate === \"number\" && candidate === 1 / 0)) throw Error(\"JS_INT_COERCION_CANDIDATE\");\nOutputTable.AssignColumns([{Name:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",candidate);\n",
    "source_sha256": "7cae6b72caeadcc28d7c6a87e4cf7b9eb2c94daf5901369d2f099a239e3cdf16"
  },
  "integer-coercion-negative-infinity": {
    "id": "integer-coercion-negative-infinity",
    "file": "javascript-native-input-integer-coercion-negative-infinity.csv",
    "rows": 1,
    "columns": 1,
    "bytes": 9,
    "sha256": "ca5f305ca67f9fc14d2b368007174be77607635eb3c5e5f6cbb9fcd779352a2c",
    "type": "real",
    "native_type": 3,
    "js_type": "Float",
    "data_kind": "Непрерывный",
    "values": [
      -1
    ],
    "expected_bytes": [
      "000000000000f0bf"
    ],
    "coercion": true,
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 1 || InputTable.ColumnCount !== 1 || InputTable.IsNull(0,\"Value\")) throw Error(\"JS_INT_COERCION_INPUT_SHAPE\");\nconst input=InputTable.Get(0,\"Value\");\nif (typeof input !== \"number\" || input !== -1) throw Error(\"JS_INT_COERCION_INPUT_VALUE\");\nconst candidate=input / 0;\nif (!(typeof candidate === \"number\" && candidate === -1 / 0)) throw Error(\"JS_INT_COERCION_CANDIDATE\");\nOutputTable.AssignColumns([{Name:\"Value\",DataType:DataType.Integer}]);\nOutputTable.Append();\nOutputTable.Set(\"Value\",candidate);\n",
    "source_sha256": "d75c797c0915f0796b267e9b9a46c99db29b192db3aa2e3ef7a4cc0efb04e2d1"
  }
};
for(const f of Object.values(cases)){Object.freeze(f.values);Object.freeze(f.expected_bytes);Object.freeze(f);}
export const javascriptCoercionCases=Object.freeze(cases);
export function javascriptCoercionCase(id){if(!Object.hasOwn(cases,id))throw Error("Unknown fixed coercion case");return cases[id];}
export const javascriptCoercionIds=Object.freeze(Object.keys(cases));
