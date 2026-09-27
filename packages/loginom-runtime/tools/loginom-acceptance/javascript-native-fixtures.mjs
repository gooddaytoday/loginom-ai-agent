import {javascriptCoercionCases} from './javascript-native-coercion-cases.mjs';
// Fixed private slices only. CSV pins and oracles are not native evidence.
const fixtures={
  ...javascriptCoercionCases,
  "real": {
    "id": "real",
    "file": "javascript-native-input-real.csv",
    "rows": 4,
    "columns": 1,
    "bytes": 33,
    "sha256": "4d731645c25b4aafbdd4c96a477341fcc5ef086ad2bda3dc9a2bfcce7966df84",
    "type": "real",
    "native_type": 3,
    "js_type": "Float",
    "data_kind": "Непрерывный",
    "values": [
      null,
      0,
      -1.25,
      10.125
    ],
    "expected_bytes": [
      null,
      "0000000000000000",
      "000000000000f4bf",
      "0000000000402440"
    ]
  },
  "boolean": {
    "id": "boolean",
    "file": "javascript-native-input-boolean.csv",
    "rows": 3,
    "columns": 1,
    "bytes": 29,
    "sha256": "bb1c31553e26a6c0a82e2c947df83a4491ff2b81761d069a0ce4c6f7272d3d46",
    "type": "boolean",
    "native_type": 1,
    "js_type": "Boolean",
    "data_kind": "Дискретный",
    "values": [
      null,
      false,
      true
    ],
    "expected_bytes": [
      null,
      "00",
      "01"
    ]
  },
  "string": {
    "id": "string",
    "file": "javascript-native-input-string.csv",
    "rows": 8,
    "columns": 1,
    "bytes": 94,
    "sha256": "c3adece846a9998d8003d2b4de019a4dda7940b471166ab0ca4c9fa364b34ce6",
    "type": "string",
    "native_type": 5,
    "js_type": "String",
    "data_kind": "Дискретный",
    "values": [
      null,
      "",
      "null",
      "NULL",
      "0",
      "false",
      "Привет, Ёж 😀",
      "quote\"\\slash\nline"
    ],
    "expected_bytes": [
      null,
      "",
      "6e756c6c",
      "4e554c4c",
      "30",
      "66616c7365",
      "d09fd180d0b8d0b2d0b5d1822c20d081d0b620f09f9880",
      "71756f7465225c736c6173680a6c696e65"
    ]
  },
  "integer-safe": {
    "id": "integer-safe",
    "file": "javascript-native-input-integer-safe.csv",
    "rows": 4,
    "columns": 1,
    "bytes": 55,
    "sha256": "86983c730cec045020a014b5bd365b2cf604c5f214774eb4a31b9344f6d0865d",
    "type": "integer",
    "native_type": 4,
    "js_type": "Integer",
    "data_kind": "Дискретный",
    "values": [
      null,
      "-9007199254740991",
      "0",
      "9007199254740991"
    ],
    "expected_bytes": [
      null,
      "010000000000e0ff",
      "0000000000000000",
      "ffffffffffff1f00"
    ]
  },
  "integer-outside-safe": {
    "id": "integer-outside-safe",
    "file": "javascript-native-input-integer-outside-safe.csv",
    "rows": 3,
    "columns": 1,
    "bytes": 58,
    "sha256": "606534ae7c03a4cc31c963a14b3029576e2f7867411d27347ab9548ccf8aa1f6",
    "type": "integer",
    "native_type": 4,
    "js_type": "Integer",
    "data_kind": "Дискретный",
    "values": [
      "-9007199254740992",
      "9007199254740992",
      "9007199254740993"
    ],
    "expected_bytes": [
      "000000000000e0ff",
      "0000000000002000",
      "0100000000002000"
    ]
  },
  "civil-datetime": {
    "id": "civil-datetime",
    "file": "javascript-native-input-civil-datetime.csv",
    "rows": 3,
    "columns": 1,
    "bytes": 66,
    "sha256": "38f67790aa3c944c1fb465023157a128087e6781c9b8e22eca9e277468cdc708",
    "type": "datetime",
    "native_type": 2,
    "js_type": "DateTime",
    "data_kind": "Непрерывный",
    "values": [
      null,
      "2024-02-29T23:59:59.123",
      "2026-03-29T01:59:59.999"
    ],
    "expected_bytes": null
  },
  "cardinality-keep2": {
    "id": "cardinality-keep2",
    "file": "javascript-native-input-cardinality.csv",
    "rows": 3,
    "columns": 1,
    "bytes": 12,
    "sha256": "10dd7b1596d2eab4d6145699462eb2cc7c30508f78d4c5b2760c207dbb427dd5",
    "type": "integer",
    "native_type": 4,
    "js_type": "Integer",
    "data_kind": "Дискретный",
    "values": [
      "1",
      "2",
      "3"
    ],
    "expected_bytes": [
      "0100000000000000",
      "0200000000000000",
      "0300000000000000"
    ],
    "output_values": [
      "2"
    ],
    "output_rows": 1,
    "output_input_rows": [
      1
    ]
  },
  "cardinality-odd": {
    "id": "cardinality-odd",
    "file": "javascript-native-input-cardinality.csv",
    "rows": 3,
    "columns": 1,
    "bytes": 12,
    "sha256": "10dd7b1596d2eab4d6145699462eb2cc7c30508f78d4c5b2760c207dbb427dd5",
    "type": "integer",
    "native_type": 4,
    "js_type": "Integer",
    "data_kind": "Дискретный",
    "values": [
      "1",
      "2",
      "3"
    ],
    "expected_bytes": [
      "0100000000000000",
      "0200000000000000",
      "0300000000000000"
    ],
    "output_values": [
      "1",
      "3"
    ],
    "output_rows": 2,
    "output_input_rows": [
      0,
      2
    ]
  },
  "cardinality-duplicate": {
    "id": "cardinality-duplicate",
    "file": "javascript-native-input-cardinality.csv",
    "rows": 3,
    "columns": 1,
    "bytes": 12,
    "sha256": "10dd7b1596d2eab4d6145699462eb2cc7c30508f78d4c5b2760c207dbb427dd5",
    "type": "integer",
    "native_type": 4,
    "js_type": "Integer",
    "data_kind": "Дискретный",
    "values": [
      "1",
      "2",
      "3"
    ],
    "expected_bytes": [
      "0100000000000000",
      "0200000000000000",
      "0300000000000000"
    ],
    "output_values": [
      "1",
      "1",
      "2",
      "2",
      "3",
      "3"
    ],
    "output_rows": 6,
    "output_input_rows": [
      0,
      0,
      1,
      1,
      2,
      2
    ]
  },
  "cardinality-empty": {
    "id": "cardinality-empty",
    "file": "javascript-native-input-cardinality.csv",
    "rows": 3,
    "columns": 1,
    "bytes": 12,
    "sha256": "10dd7b1596d2eab4d6145699462eb2cc7c30508f78d4c5b2760c207dbb427dd5",
    "type": "integer",
    "native_type": 4,
    "js_type": "Integer",
    "data_kind": "Дискретный",
    "values": [
      "1",
      "2",
      "3"
    ],
    "expected_bytes": [
      "0100000000000000",
      "0200000000000000",
      "0300000000000000"
    ],
    "output_values": [],
    "output_rows": 0,
    "output_input_rows": []
  }
};
for(const f of Object.values(fixtures)){Object.freeze(f.values);Object.freeze(f.expected_bytes);Object.freeze(f.output_values);Object.freeze(f.output_input_rows);Object.freeze(f);}
Object.freeze(fixtures);
export function javascriptNativeFixture(id='real'){
  if(!Object.hasOwn(fixtures,id))throw Error('Unknown private native fixture');return fixtures[id];
}

// Host-owned fixed case/role resolver. No request can supply an arbitrary count,
// row map, schema or script. Canonical empty uses only its fixed declared-mode probe.
export function javascriptNativeReadFixture(id='real',role='input'){
  if(!['input','output','upstream'].includes(role))throw Error('Unknown native read role');
  const f=javascriptNativeFixture(id);
  if(f.coercion&&role==='output')return Object.freeze({...f,type:'integer',native_type:4,js_type:'Integer',values:undefined,expected_bytes:undefined});
  if(role!=='output'||!f.output_input_rows)return f;
  return Object.freeze({...f,rows:f.output_rows,values:f.output_values,
    expected_bytes:Object.freeze(f.output_input_rows.map(row=>f.expected_bytes[row]))});
}
