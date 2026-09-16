import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readCollapseInputBrowser} from '../lib/collapse-existing-input-browser.mjs';
function fixture({emptyHash=false,changedUsage=false,invalidUsage=false}={}){
 const state={columnUsage:1,definitionUsage:invalidUsage?65536:192,released:0,hashMasks:[],names:0};
 const session={$FDisposed:false,$FPendingDisconnect:false,$FTransportStatus:0};
 const task=value=>({continueWith:fn=>queueMicrotask(()=>fn({getAwaitedResult:()=>value}))});
 class Base{constructor(){this.$S=session;this.$={};}disposeAsync(){state.released++;return task(null);}QueryInterface(){return task(tune);}}
 class Node extends Base{}
 class Input extends Base{get_Socket(){return task(socket);}}
 class Tune extends Base{get_TuneDataSource(){return task(ds);}}
 class DS extends Base{get_Columns(){return task(columns);}get_ColumnDefs(){return task(defs);}get_Active(){return task(false);}GetColumnsHash(mask){state.hashMasks.push(mask);return task(new Uint8Array(emptyHash||mask!==193?[]:[7,8,9]));}}
 class Columns extends Base{get_Count(){return task(2);}get_PresentUsageTypes(){return task(state.columnUsage);}getItem(i){return task(new Column(i));}}
 class Defs extends Base{get_Count(){return task(2);}get_PresentUsageTypes(){return task(state.definitionUsage);}getItem(i){return task(new Def(i));}}
 class Column extends Base{constructor(i){super();this.i=i;}get_Index(){return task(this.i);}get_ID(){return task(this.i);}get_Name(){if(changedUsage&&++state.names===1)state.definitionUsage=64;return task(['Id','M1'][this.i]);}get_DataType(){return task(4);}}
 class Def extends Column{get_InputColumnInfoName(){return task(['Id','M1'][this.i]);}}
 const socket=new Base(),tune=new Tune(),ds=new DS(),columns=new Columns(),defs=new Defs();
 const source={FGuid:'source'},sourcePort={parent:source,FGuid:'sp',FStatus:1};
 const node={FGuid:'n',FIconCls:'bg-vendor-icon-columnflipping',FStatus:0,FState:1,FLocked:false,data:new Node()};
 const port={FGuid:'p',FType:0,FSubType:1,FParam:0,FStatus:0,parent:node,data:new Input()};node.FPorts=[{FCollection:[port]}];
 const link={FGuid:'l',FSourcePort:sourcePort,FTargetPort:port},diagram={FNodes:{FCollection:[node]},FLinks:{FCollection:[link]}};
 const model={FDiagram:diagram},card={Controller:{FController:model}},workspace={getActiveTab:()=>card},document={};
 const classes={TIBGModelNodeInputPort_Proxy:Input,TIBGTuneDataSourceSocket_Proxy:Tune,TIBGTuneDataSource_Proxy:DS,TIBGColumns_Proxy:Columns,TIBGTuneColumnDefs_Proxy:Defs,TIBGColumn_Proxy:Column,TIBGTuneColumnDef_Proxy:Def};
 const methods={proxy:['QueryInterface','disposeAsync'],TIBGModelNodeInputPort_Proxy:['get_Socket'],TIBGTuneDataSourceSocket_Proxy:['get_TuneDataSource'],TIBGTuneDataSource_Proxy:['get_Columns','get_ColumnDefs','get_Active','GetColumnsHash'],TIBGColumns_Proxy:['get_Count','get_PresentUsageTypes','getItem'],TIBGTuneColumnDefs_Proxy:['get_Count','get_PresentUsageTypes','getItem'],TIBGColumn_Proxy:['get_Index','get_ID','get_Name','get_DataType'],TIBGTuneColumnDef_Proxy:['get_Index','get_ID','get_Name','get_DataType','get_InputColumnInfoName']};
 const sources=Object.fromEntries(Object.entries(methods).flatMap(([k,names])=>names.map(n=>[k+'.'+n,Function.prototype.toString.call((k==='proxy'?Base:classes[k]).prototype[n])])));
 const context={document,Uint8Array,bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{Items:{Workspace:workspace}}}}},rpc:classes,IBGTuneDataSourceSocket:1},rpc:{TBGMessageDynamicData:class{}},__loginomDockPreparationV1:{document,id:'d'},__loginomDockCollapseRuntimeV1:{binding_id:'bound',session,check(){}},args:{binding:{document_id:'d',workflow_ref:{workflow_id:'w'},node:{node_id:'n'}},sources,budgetMs:1000,runtimeBinding:'bound'}};
 return {state,run:()=>vm.runInNewContext(`(${readCollapseInputBrowser.toString()})(args)`,context)};
}
test('new unexecuted input hashes column and saved definition usage sets',async()=>{const f=fixture(),s=await f.run();assert.deepEqual(f.state.hashMasks,[193,193]);assert.equal(s.fields.length,2);assert.equal(s.active,false);assert.deepEqual(JSON.parse(JSON.stringify(s.usage_types)),{columns:1,definitions:192,hashed:193});assert.equal(s.references_acquired,s.references_released);assert.equal(s.references_released,f.state.released);});
for(const [name,options,cause] of [['empty native hash',{emptyHash:true},/fingerprint/],['invalid definition mask',{invalidUsage:true},/usage mask/],['usage changed across native awaits',{changedUsage:true},/usage masks changed/]])test(name+' refuses and releases acquired references',async()=>{const f=fixture(options);await assert.rejects(f.run(),cause);assert.ok(f.state.released>=5);});
