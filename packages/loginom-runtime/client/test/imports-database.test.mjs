import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDatabaseImportParameters,databaseImportParametersSchema,readOnlySelect} from '../lib/imports-database-parameters.mjs';
import {databaseImportReadback,createDatabaseImportNodeSupport} from '../lib/imports-database-node.mjs';
import {NODE_TYPES,describeNodeTypes} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';

const request=(over={})=>({target:{kind:'new',type:'imports.database'},inputs:[],variable_inputs:[],mappings:[],finish:'execute',read:{ports:[0]},...over});
const table={database:{database_path:'/own/people.db',table:'People'}};
const sql={database:{database_path:'/own/people.db',sql:'SELECT Amount, Id, Label FROM People WHERE Active = 1 ORDER BY Id DESC'}};

test('imports.database is a registered import with one table output and an own parameter key',()=>{
 const card=NODE_TYPES['imports.database'];
 assert.equal(card.title,'База данных');assert.equal(card.palette_group,'Импорт');assert.equal(card.icon_class,'bg-vendor-icon-dbimport');
 assert.deepEqual([card.tabular_inputs,card.tabular_outputs,card.modes],[0,1,['table','sql']]);
 assert.match(card.semantics,/SQLite/);
 assert.ok(nodeApplyInputSchema.properties.target.properties.type.enum.includes('imports.database'));
 assert.ok(['table','sql'].every(m=>nodeApplyInputSchema.properties.mode.enum.includes(m)));
 assert.deepEqual(nodeApplyInputSchema.properties.parameters.properties.database,databaseImportParametersSchema.properties.database);
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 assert.equal(support.nodeApplyHandlers.get('imports.database').revision,'database-import-sqlite-v1');
 const [described]=describeNodeTypes(['imports.database'],{},new Map(),support.nodeApplyHandlers,'7.4.2');
 assert.ok(Buffer.byteLength(JSON.stringify(described))<=12000);
});

test('table and sql modes accept exact settings',()=>{
 validateDatabaseImportParameters(table,'table',request());
 validateDatabaseImportParameters(sql,'sql',request());
 validateDatabaseImportParameters({},'table',request({target:{kind:'existing',type:'imports.database',ref:{}}}));
 validateDatabaseImportParameters(table,'table',request({finish:'done',read:{ports:[]}}));
});

test('refuses non-SELECT or compound SQL before any gesture',()=>{
 for(const q of ['DELETE FROM People','INSERT INTO People VALUES (7)','SELECT 1; DROP TABLE People','WITH x AS (SELECT 1) DELETE FROM People',
  'ATTACH DATABASE \'/x.db\' AS x','PRAGMA table_info(People)','SELECT * FROM People -- comment','SELECT /* c */ 1','UPDATE People SET Id=1',
  'SELECT * FROM People WHERE Id = :id','SELECT * FROM %Table%','select 1;select 2','  ','VACUUM','SELECT load_extension(\'x\')'])
  assert.throws(()=>validateDatabaseImportParameters({database:{database_path:'/own/people.db',sql:q}},'sql',request()),/Database import/,q);
 assert.equal(readOnlySelect("SELECT 'DELETE; --' AS t FROM \"Update\""),true);
 assert.equal(readOnlySelect('SELECT Id FROM People ORDER BY Id;'),true);
});

test('refuses paths, mode mixes and unsupported request shapes',()=>{
 const bad=[
  [{database:{database_path:'own/people.db',table:'People'}},'table'],
  [{database:{database_path:'/own/../people.db',table:'People'}},'table'],
  [{database:{database_path:'/own/people.csv',table:'People'}},'table'],
  [{database:{database_path:'/own/people.db',table:'People',sql:'SELECT 1'}},'table'],
  [{database:{database_path:'/own/people.db',sql:'SELECT 1'}},'table'],
  [{database:{database_path:'/own/people.db',table:'People'}},'sql'],
  [{database:{database_path:'/own/people.db',table:'People',fields:['Id']}},'table'],
  [{database:{database_path:'/own/people.db'}},'table'],
  [{},'table'],
  [{database:{database_path:'/own/people.db',table:'People'},source:{}},'table'],
 ];
 for(const [p,m] of bad)assert.throws(()=>validateDatabaseImportParameters(p,m,request()),/Database import/,JSON.stringify(p));
 assert.throws(()=>validateDatabaseImportParameters(table,'table',request({inputs:[{source:{},output:0,input:0}]})),/no table input/);
 assert.throws(()=>validateDatabaseImportParameters(table,'table',request({read:{ports:[1]}})),/output 0/);
 assert.throws(()=>validateDatabaseImportParameters(table,'table',request({mappings:[{direction:'output',port:0}]})),/mapping/);
});

test('readback reports observed connection, source and output fields of this node',()=>{
 const node={document_id:'d',workflow_id:'w',node_id:'n'},op='op';
 const ctx={...node,verified:true};
 const field=(name,type)=>({name,label:name,type,data_kind:type==='string'?'Дискретный':'Непрерывный',record_id:name});
 const fields=[field('Id','integer'),field('Label','string')];
 const phase=(phase,value)=>({phase,status:'verified',receipt_id:op+':'+phase,value:{verified:true,cleanup_complete:true,...value}});
 const phases=[
  phase('configure',{configuration:{verified:true,node_context:ctx,mode:'table',table:'People',database_path:'/own/people.db',connection:{database_path:'/own/people.db',reference_node_id:'c'}}}),
  phase('node_finish',{settings_applied:true,mode:'done',node_context:ctx}),
  phase('output_mapping',{native_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,autosync:true,source_fields:fields,
   target_fields:fields.map((f,index)=>({...f,index,excluded:false,source:f}))},finish:{verified:true}}),
  phase('finish',{settings_applied:true,mode:'execute',node_context:ctx}),
 ];
 const r=databaseImportReadback({node,phases,operation_id:op});
 assert.equal(r.kind,'database_import');assert.equal(r.mode,'table');assert.equal(r.table,'People');
 assert.deepEqual(r.connection,{database_path:'/own/people.db',reference_node_id:'c'});
 assert.deepEqual(r.output_mapping.fields.map(f=>[f.name,f.type]),[['Id','integer'],['Label','string']]);
 assert.throws(()=>databaseImportReadback({node:{...node,node_id:'other'},phases,operation_id:op}),/Database import/);
});

test('node support exposes the connection preflight and link before inputs',()=>{
 const support=createDatabaseImportNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 const drivers=support.nodeApplyDriverFactory({operation:{id:'op',parameters:{...request(),parameters:table,mode:'table'}},execute:async()=>{},onRecord:async v=>v,now:Date.now,receiptOptions:()=>({})});
 assert.equal(typeof drivers.beforeTarget,'function');assert.equal(typeof drivers.mapPorts,'function');
});
