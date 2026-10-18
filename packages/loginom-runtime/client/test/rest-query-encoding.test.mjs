import test from 'node:test';
import assert from 'node:assert/strict';
import {restQueryEncoderRequest} from '../lib/rest-request-node.mjs';
import {createJavascriptCodeNodeSupport} from '../lib/javascript-code-node.mjs';
import {createRedactor} from '../lib/redact.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';

const request=()=>({operation_id:'rest',contract_revision:'1.0.0',document_id:'doc',
 workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'module',label:'Module'},{tid:'flow',label:'Flow'}]},
 inputs:[{source:{document_id:'doc',workflow_id:'flow',node_id:'import'},output:0,input:0}],
 parameters:{query_parameters:[{name:'Key',field:'Key'}]},budgets:{total_ms:600000}});

function encode(source,rows){
 const output=[];
 const InputTable={RowCount:rows.length,Get:(row,name)=>rows[row][name]};
 const OutputTable={Append:()=>output.push({}),Set:(name,value)=>{output.at(-1)[name]=value;}};
 new Function('InputTable','OutputTable',source.slice(source.indexOf('\n')+1))(InputTable,OutputTable);
 return output;
}

test('REST-generated codec preserves raw query values through URL parsing, including ampersands and UTF-8',()=>{
 const original=request(),before=structuredClone(original),child=restQueryEncoderRequest(original,2500,1000);
 const raw=['a b&я','x/y?','%26+#+=','😀\r\n','',null];
 const rows=encode(child.parameters.source_text,raw.map(Key=>({Key})));
 assert.deepEqual(rows.map(r=>r.Key===null?null:new URL('https://echo.test/?Key='+r.Key).searchParams.get('Key')),raw);
 assert.equal(rows[0].Key,'a%20b%26%D1%8F');
 assert.equal(rows[2].Key,'%2526%2B%23%2B%3D');
 assert.throws(()=>encode(child.parameters.source_text,[{Key:1}]),/raw string fields/);
 assert.deepEqual(original,before);
 assert.deepEqual(child.budgets,{configure_ms:1500,execute_ms:1500,total_ms:1500});
 assert.equal(child.finish,'execute');
 assert.deepEqual(child.read.ports,[]);
});

test('codec deduplicates bound fields and quotes their technical names as data',()=>{
 const r=request(),name='Key");throw Error("injected");/*';
 r.parameters.query_parameters=[{name:'a',field:name},{name:'b',field:name}];
 const child=restQueryEncoderRequest(r,2500,1000);
 assert.equal(child.parameters.columns.length,1);
 assert.deepEqual(encode(child.parameters.source_text,[{[name]:'&'}]),[{[name]:'%26'}]);
 assert.throws(()=>restQueryEncoderRequest({...r,inputs:[]},2500,1000),/explicit table input/);
 assert.throws(()=>restQueryEncoderRequest(r,1000,1000),/deadline elapsed/);
});

test('generated child request uses the installed JavaScript contract and bounded operation IDs',()=>{
 const r=request();r.operation_id='x'.repeat(128);
 const child=restQueryEncoderRequest(r,2500,1000);
 const support=createJavascriptCodeNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2',redactor:createRedactor()});
 assert.doesNotThrow(()=>validateNodeApplyRequest(child,support.nodeApplyHandlers));
 assert.ok(child.operation_id.length<=128);
 assert.notEqual(child.operation_id,restQueryEncoderRequest({...r,operation_id:'y'.repeat(128)},2500,1000).operation_id);
});
