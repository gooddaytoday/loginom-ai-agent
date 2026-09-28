// Exact ROOT-reviewed proposal bytes. Requested names are never physical observations.
import {createHash} from 'node:crypto';
const cases={
  "T-schema-control": {
    "id": "T-schema-control",
    "source_sha256": "3bacbef1f54c300d654bff729469dcdc2233f03423ffe07be27878d8b5fadf9b",
    "requested_name": "Value",
    "requested_display_name": "Value",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_TELEMETRY_INPUT_SHAPE\");\nconst value=InputTable.Get(1,\"Value\");\nif (typeof value !== \"number\" || value !== -9007199254740991) throw Error(\"JS_TELEMETRY_INPUT_VALUE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Value\",DataType:DataType.Integer},{Name:\"__JS_Metadata\",DisplayName:\"__JS_Metadata\",DataType:DataType.String}]);\nfunction snapshot() {\n  if (OutputTable.ColumnCount !== 2) throw Error(\"JS_TELEMETRY_COLUMN_COUNT\");\n  return [0,1].map(function(index) {\n    const column=OutputTable.GetColumn(index);\n    if (column.Index !== index || typeof column.Name !== \"string\" || typeof column.DisplayName !== \"string\" || column.Name.length > 128 || column.DisplayName.length > 128 || column.DataType !== (index === 0 ? DataType.Integer : DataType.String)) throw Error(\"JS_TELEMETRY_METADATA_SHAPE\");\n    return {index:column.Index,name:column.Name,display_name:column.DisplayName,data_type:column.DataType};\n  });\n}\nconst before=snapshot();\nOutputTable.Append();\nOutputTable.Set(0,value);\nconst after=snapshot();\nconst telemetry=JSON.stringify({version:1,probe_id:\"T-schema-control\",column_count:2,before:before,after:after});\nif (telemetry.length > 8192) throw Error(\"JS_TELEMETRY_JSON_BOUND\");\nOutputTable.Set(1,telemetry);\n",
    "input_fixture_id": "integer-safe"
  },
  "T-schema-cyrillic": {
    "id": "T-schema-cyrillic",
    "source_sha256": "f89d16bc25a7cf5c1ff5adfb5c498e2a0701021e8b13842c272e55bfa1c0f4e3",
    "requested_name": "Сумма",
    "requested_display_name": "Value",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_TELEMETRY_INPUT_SHAPE\");\nconst value=InputTable.Get(1,\"Value\");\nif (typeof value !== \"number\" || value !== -9007199254740991) throw Error(\"JS_TELEMETRY_INPUT_VALUE\");\nOutputTable.AssignColumns([{Name:\"Сумма\",DisplayName:\"Value\",DataType:DataType.Integer},{Name:\"__JS_Metadata\",DisplayName:\"__JS_Metadata\",DataType:DataType.String}]);\nfunction snapshot() {\n  if (OutputTable.ColumnCount !== 2) throw Error(\"JS_TELEMETRY_COLUMN_COUNT\");\n  return [0,1].map(function(index) {\n    const column=OutputTable.GetColumn(index);\n    if (column.Index !== index || typeof column.Name !== \"string\" || typeof column.DisplayName !== \"string\" || column.Name.length > 128 || column.DisplayName.length > 128 || column.DataType !== (index === 0 ? DataType.Integer : DataType.String)) throw Error(\"JS_TELEMETRY_METADATA_SHAPE\");\n    return {index:column.Index,name:column.Name,display_name:column.DisplayName,data_type:column.DataType};\n  });\n}\nconst before=snapshot();\nOutputTable.Append();\nOutputTable.Set(0,value);\nconst after=snapshot();\nconst telemetry=JSON.stringify({version:1,probe_id:\"T-schema-cyrillic\",column_count:2,before:before,after:after});\nif (telemetry.length > 8192) throw Error(\"JS_TELEMETRY_JSON_BOUND\");\nOutputTable.Set(1,telemetry);\n",
    "input_fixture_id": "integer-safe"
  },
  "T-schema-space": {
    "id": "T-schema-space",
    "source_sha256": "3785f9a020f3aa569c6daf78f0a640f5194df945144136668bdd27f872179326",
    "requested_name": "Value Total",
    "requested_display_name": "Value",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_TELEMETRY_INPUT_SHAPE\");\nconst value=InputTable.Get(1,\"Value\");\nif (typeof value !== \"number\" || value !== -9007199254740991) throw Error(\"JS_TELEMETRY_INPUT_VALUE\");\nOutputTable.AssignColumns([{Name:\"Value Total\",DisplayName:\"Value\",DataType:DataType.Integer},{Name:\"__JS_Metadata\",DisplayName:\"__JS_Metadata\",DataType:DataType.String}]);\nfunction snapshot() {\n  if (OutputTable.ColumnCount !== 2) throw Error(\"JS_TELEMETRY_COLUMN_COUNT\");\n  return [0,1].map(function(index) {\n    const column=OutputTable.GetColumn(index);\n    if (column.Index !== index || typeof column.Name !== \"string\" || typeof column.DisplayName !== \"string\" || column.Name.length > 128 || column.DisplayName.length > 128 || column.DataType !== (index === 0 ? DataType.Integer : DataType.String)) throw Error(\"JS_TELEMETRY_METADATA_SHAPE\");\n    return {index:column.Index,name:column.Name,display_name:column.DisplayName,data_type:column.DataType};\n  });\n}\nconst before=snapshot();\nOutputTable.Append();\nOutputTable.Set(0,value);\nconst after=snapshot();\nconst telemetry=JSON.stringify({version:1,probe_id:\"T-schema-space\",column_count:2,before:before,after:after});\nif (telemetry.length > 8192) throw Error(\"JS_TELEMETRY_JSON_BOUND\");\nOutputTable.Set(1,telemetry);\n",
    "input_fixture_id": "integer-safe"
  },
  "T-schema-leading-digit": {
    "id": "T-schema-leading-digit",
    "source_sha256": "ce1d18d4a12339bf0f28b0da006c75f4c4f2b8a451a1389f1bdff56b3c217427",
    "requested_name": "1Value",
    "requested_display_name": "Value",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_TELEMETRY_INPUT_SHAPE\");\nconst value=InputTable.Get(1,\"Value\");\nif (typeof value !== \"number\" || value !== -9007199254740991) throw Error(\"JS_TELEMETRY_INPUT_VALUE\");\nOutputTable.AssignColumns([{Name:\"1Value\",DisplayName:\"Value\",DataType:DataType.Integer},{Name:\"__JS_Metadata\",DisplayName:\"__JS_Metadata\",DataType:DataType.String}]);\nfunction snapshot() {\n  if (OutputTable.ColumnCount !== 2) throw Error(\"JS_TELEMETRY_COLUMN_COUNT\");\n  return [0,1].map(function(index) {\n    const column=OutputTable.GetColumn(index);\n    if (column.Index !== index || typeof column.Name !== \"string\" || typeof column.DisplayName !== \"string\" || column.Name.length > 128 || column.DisplayName.length > 128 || column.DataType !== (index === 0 ? DataType.Integer : DataType.String)) throw Error(\"JS_TELEMETRY_METADATA_SHAPE\");\n    return {index:column.Index,name:column.Name,display_name:column.DisplayName,data_type:column.DataType};\n  });\n}\nconst before=snapshot();\nOutputTable.Append();\nOutputTable.Set(0,value);\nconst after=snapshot();\nconst telemetry=JSON.stringify({version:1,probe_id:\"T-schema-leading-digit\",column_count:2,before:before,after:after});\nif (telemetry.length > 8192) throw Error(\"JS_TELEMETRY_JSON_BOUND\");\nOutputTable.Set(1,telemetry);\n",
    "input_fixture_id": "integer-safe"
  },
  "T-schema-unicode-label": {
    "id": "T-schema-unicode-label",
    "source_sha256": "cc5ee23e4eba1c7dfee77ad63b72eaa982f60361490d83a3316a0b397596b779",
    "requested_name": "Value",
    "requested_display_name": "Сумма ё",
    "source": "import {InputTable,OutputTable,DataType} from \"builtIn/Data\";\nif (InputTable.RowCount !== 4 || InputTable.ColumnCount !== 1) throw Error(\"JS_TELEMETRY_INPUT_SHAPE\");\nconst value=InputTable.Get(1,\"Value\");\nif (typeof value !== \"number\" || value !== -9007199254740991) throw Error(\"JS_TELEMETRY_INPUT_VALUE\");\nOutputTable.AssignColumns([{Name:\"Value\",DisplayName:\"Сумма ё\",DataType:DataType.Integer},{Name:\"__JS_Metadata\",DisplayName:\"__JS_Metadata\",DataType:DataType.String}]);\nfunction snapshot() {\n  if (OutputTable.ColumnCount !== 2) throw Error(\"JS_TELEMETRY_COLUMN_COUNT\");\n  return [0,1].map(function(index) {\n    const column=OutputTable.GetColumn(index);\n    if (column.Index !== index || typeof column.Name !== \"string\" || typeof column.DisplayName !== \"string\" || column.Name.length > 128 || column.DisplayName.length > 128 || column.DataType !== (index === 0 ? DataType.Integer : DataType.String)) throw Error(\"JS_TELEMETRY_METADATA_SHAPE\");\n    return {index:column.Index,name:column.Name,display_name:column.DisplayName,data_type:column.DataType};\n  });\n}\nconst before=snapshot();\nOutputTable.Append();\nOutputTable.Set(0,value);\nconst after=snapshot();\nconst telemetry=JSON.stringify({version:1,probe_id:\"T-schema-unicode-label\",column_count:2,before:before,after:after});\nif (telemetry.length > 8192) throw Error(\"JS_TELEMETRY_JSON_BOUND\");\nOutputTable.Set(1,telemetry);\n",
    "input_fixture_id": "integer-safe"
  }
};
Object.values(cases).forEach(Object.freeze);Object.freeze(cases);
export const javascriptTelemetryIds=Object.freeze(Object.keys(cases));
export function javascriptTelemetryCase(id){
 if(!Object.hasOwn(cases,id))throw Error('Unknown fixed telemetry case');
 return cases[id];
}
export function javascriptTelemetryProbe(id){
 const c=javascriptTelemetryCase(id);
 if(createHash('sha256').update(c.source).digest('hex')!==c.source_sha256)throw Error('Telemetry source pin differs');
 return Object.freeze({id:'native-'+id,telemetry_case_id:id,input_fixture_id:'integer-safe',schema_mode:'code',source:c.source,source_sha256:c.source_sha256});
}
export function requireJavascriptTelemetryMode(id,{namedCaseId,calibrationId,metadataDiagnostic=false}={}){
 if(id===undefined)return;
 javascriptTelemetryCase(id);
 if(namedCaseId!==undefined||calibrationId!==undefined||metadataDiagnostic)throw Error('Telemetry identity conflict');
}
