import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLgdFields} from '../lgd-cold.mjs';
test('LGD cold checks exact names, labels, types, kinds, order and exclusions',()=>{
 const expected=[{name:'RecordId',label:'Идентификатор',type:'integer',data_kind:'discrete'},{name:'Amount',label:'Сумма',type:'real',data_kind:'continuous'}];
 const fields=expected.map(f=>({...f,data_kind:f.data_kind==='discrete'?'Дискретный':'Непрерывный',excluded:false}));
 assert.equal(verifyLgdFields(fields,expected),true);
 for(const [key,value]of Object.entries({name:'Id',label:'RecordId',type:'real',data_kind:'Непрерывный',excluded:true})){
  const bad=structuredClone(fields);bad[0][key]=value;assert.throws(()=>verifyLgdFields(bad,expected),/LGD_COLD_FIELD_PROPERTIES/);
 }
 assert.throws(()=>verifyLgdFields([...fields].reverse(),expected));
});
