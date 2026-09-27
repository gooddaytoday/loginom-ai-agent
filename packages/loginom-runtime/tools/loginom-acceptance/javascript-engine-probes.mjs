// Operator-only discovery inputs. Importing this module never runs a snippet.
// These sources execute in Loginom, not Node/Chromium. Each needs its own
// observed native execution and typed output; a source hash is not a PASS.
import {createHash} from 'node:crypto';

const prefix = `import { InputTable, OutputTable, DataType } from "builtIn/Data";
OutputTable.AssignColumns([{Name: "Result", DataType: DataType.String}]);
`;

const cases = [
  {id:'data-smoke', scope:'v1', expression:'"Data ready"', expected:['Data ready']},
  {id:'literal-trim', scope:'v1', expression:'" \\tЁж 😀\\n ".trim()', expected:['Ёж 😀']},
  {id:'literal-lower', scope:'v1', expression:'"АБВЁЖ".toLowerCase()', expected:['абвёж']},
  {id:'literal-upper', scope:'v1', expression:'"абвёж".toUpperCase()', expected:['АБВЁЖ']},
  {id:'nullish', scope:'characterization', expression:'null ?? "fallback"', expected:['fallback']},
  {id:'optional-chain', scope:'characterization', expression:'({a:{b:"nested"}}).a?.b', expected:['nested']},
  {id:'lookbehind', scope:'characterization', expression:'String(/(?<=a)b/.test("ab"))', expected:['true']},
  {id:'bigint', scope:'characterization', expression:'String(1n + 2n)', expected:['3']},
  {id:'global-this', scope:'characterization', expression:'typeof globalThis', expected:['object']},
  {id:'async-declaration', scope:'characterization', declaration:'async function probe() { return "unused"; }\n',
    expression:'typeof probe', expected:['function'], note:'Declaration syntax only; function is never called.'},
  {id:'top-level-await', scope:'characterization', expression:'await Promise.resolve("resolved")',
    expected:['resolved'], note:'Outside v1; native completion must be observed independently.'},
  {id:'strict-error', scope:'diagnostics', declaration:'"use strict";\n',
    expression:'(function () { "use strict"; jsDiscoveryUndeclared = 1; return "unexpected"; })()',
    expectedError:'native synchronous error; preserve actual class/text/position'},
  {id:'sync-throw', scope:'diagnostics', expression:'(function () { throw new Error("JS_DISCOVERY_SYNC_THROW"); })()',
    expectedError:'native synchronous error containing JS_DISCOVERY_SYNC_THROW'},
  {id:'native-parse-error', scope:'diagnostics', expression:'(1 + )',
    expectedError:'native syntax error; preserve actual class/text/position'},
];

export const javascriptEngineProbes = cases.map(probe => {
  const source = prefix + (probe.declaration ?? '') + 'OutputTable.Append();\nOutputTable.Set("Result", ' + probe.expression + ');\n';
  return Object.freeze({...probe, source, source_sha256:createHash('sha256').update(source,'utf8').digest('hex'),
    schema_mode:'code', build:'7.4.2', status:'not_checked'});
});

// Call only after observing the input schema. A technical name is quoted as
// data, never interpolated as JavaScript syntax or inferred from a display label.
export function inputTextProbe(technicalName) {
  if (typeof technicalName !== 'string' || !technicalName || /[\r\n\0]/.test(technicalName)) throw Error('Observed technical name required');
  const source = prefix + `for (let row = 0; row < InputTable.RowCount; row++) {
    const value = InputTable.Get(row, ${JSON.stringify(technicalName)});
    OutputTable.Append();
    OutputTable.Set("Result", value === null || value === undefined ? null : JSON.stringify([value.trim(), value.toLowerCase(), value.toUpperCase()]));
}
`;
  return {id:'input-text-primitives', scope:'v1', source,
    source_sha256:createHash('sha256').update(source,'utf8').digest('hex'),
    schema_mode:'code', build:'7.4.2', status:'not_checked', input_technical_name:technicalName};
}
