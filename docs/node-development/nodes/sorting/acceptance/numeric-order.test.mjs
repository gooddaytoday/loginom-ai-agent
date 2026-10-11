import test from 'node:test';import assert from 'node:assert/strict';
import {auditNumericOrder} from './numeric-order.mjs';
const schema=[{name:'RowID',type:'integer'},{name:'Value',type:'real'},{name:'Second',type:'real'},{name:'Payload',type:'string'}];
const input=[[1,'2','0','a'],[2,'-1','0','b'],[3,'2','0','c'],[4,'0','0','d'],[5,'3','0','e'],[3,'2','0','c']];
const key=(field,direction)=>({field,direction});
test('numeric DESC and RowID tie-break retain exact duplicate multiplicity',()=>assert.equal(auditNumericOrder({schema,input,output:[input[4],input[0],input[2],input[5],input[3],input[1]],keys:[key('Value','DESC'),key('RowID','ASC')]}).rows,6));
test('numeric ASC preserves all rows and duplicate cells',()=>assert.equal(auditNumericOrder({schema,input,output:[input[1],input[3],input[0],input[2],input[5],input[4]],keys:[key('Value','ASC'),key('RowID','ASC')]}).ordered,true));
test('equal keys allow any permutation inside their group',()=>{for(const equal of [[input[0],input[2],input[5]],[input[5],input[0],input[2]]])assert.equal(auditNumericOrder({schema,input,output:[input[4],...equal,input[3],input[1]],keys:[key('Value','DESC')]}).stable_ties_promised,false)});
test('full composite priority and unrounded decimal values',()=>{
 const rows=[[1,'1.004','-2','x'],[2,'1.005','-3','y'],[3,'1.004','-1','z'],[4,'1.004','-1','q']];
 assert.equal(auditNumericOrder({schema,input:rows,output:[rows[2],rows[3],rows[0],rows[1]],keys:[key('Value','ASC'),key('Second','DESC'),key('RowID','ASC')]}).ordered,true);
 assert.throws(()=>auditNumericOrder({schema,input:rows,output:[rows[1],rows[2],rows[3],rows[0]],keys:[key('Value','ASC'),key('Second','DESC'),key('RowID','ASC')]}),/ORDER/);
});
test('exact large integer order does not round through Number',()=>{
 const s=[{name:'Id',type:'integer'}],r=[['9007199254740993'],['9007199254740992']];
 assert.equal(auditNumericOrder({schema:s,input:r,output:[r[1],r[0]],keys:[key('Id','ASC')]}).ordered,true);
 assert.throws(()=>auditNumericOrder({schema:s,input:r,output:r,keys:[key('Id','ASC')]}),/ORDER/);
});
test('empty output needs the complete positional schema',()=>assert.equal(auditNumericOrder({schema,input:[],output:[],keys:[key('Value','ASC')]}).rows,0));
for(const mutate of [r=>r.reverse(),r=>r.pop(),r=>r.push(r[0]),r=>r[0][3]='changed',r=>r[0]=r[1],r=>r[0][1]='2.00'])test('wrong order or cell/multiplicity corruption rejected '+String(mutate),()=>{
 const output=structuredClone([input[4],input[0],input[2],input[5],input[3],input[1]]);mutate(output);
 assert.throws(()=>auditNumericOrder({schema,input,output,keys:[key('Value','DESC'),key('RowID','ASC')]}));
});
test('explicit numeric-only boundary rejects string locale oracle and unpinned NULL',()=>{
 assert.throws(()=>auditNumericOrder({schema,input,output:input,keys:[key('Payload','ASC')]}),/NUMERIC_ORACLE_ONLY/);
 assert.throws(()=>auditNumericOrder({schema,input:[[1,null,'0','']],output:[[1,null,'0','']],keys:[key('Value','ASC')]}),/FINITE_DECIMAL/);
});
test('audit rejects duplicate/missing keys, invalid direction and partial rows',()=>{
 for(const keys of [[key('Value','ASC'),key('Value','DESC')],[key('Missing','ASC')],[key('Value','asc')]])assert.throws(()=>auditNumericOrder({schema,input:[],output:[],keys}));
 assert.throws(()=>auditNumericOrder({schema,input:[[1]],output:[[1]],keys:[key('Value','ASC')]}),/POSITIONAL/);
});
