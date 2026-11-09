import test from 'node:test';import assert from 'node:assert/strict';
import {configureUngroup,configureUngroupSeasonality,supportedUngroupConfiguration} from '../lib/ungroup-procedure.mjs';
const root='MF;TF;WizrdMCF',page=root+';UngroupDataWizard;';
const fields=[[['Group','string',6],['Period','datetime',8],['Total','integer',7]],[['Group','string',6],['Period','datetime',8],['Item','string',4],['Weight','integer',9]]]
 .map((fs,port)=>fs.map(([name,type,usage],index)=>({record_id:port+name,name,type,index,usage})));
const u={keys:[{total:'Group',support:'Group'}],value_field:'Total',item_field:'Item',share_field:'Weight',rounding:{format:'none'},balance:'none'};
const season={total_order_field:'Period',support_order_field:'Period',period:'year',multiplier:1,index_count:12,rare_density:0.25,absent_periods:1,novelty_periods:1,max_history_periods:0};
test('seasonal writer sets balance before the native seasonal method, which disables balancing',async()=>{
 const c={verified:true,inventory_complete:true,method:'shares',input_fields:fields,
  ungroup:{keys:u.keys,value_fields:['Total'],item_fields:['Item'],share_fields:['Weight'],order_fields:[['Period'],['Period']],rounding:{format:'none'},balance:'proportional'}};
 const tids=['pedBalanceMethod;ValueControl;trg_picker','pedBalanceMethod;ValueControl;boundlist;Нет_балансировки','pedUngroupMethod;ValueControl;trg_picker',
  'pedUngroupMethod;ValueControl;boundlist;С_учётом_временных_колебаний_и_сезонности_опорных_данных'].map(t=>page+t);
 const s={wizard:{stage:'ungroup',root_tid:root},node_ungroup:c,ui:{elements:tids.map(tid=>({tid,ref:tid,allowed_actions:['click']}))}},actions=[];
 const channel={observe:async o=>{assert.ok(o.ready(s),o.condition);return s;},perform:async o=>{assert.ok(o.ready(s));const a=o.resolve(s);actions.push(a.ref);
  if(a.ref===tids[1])c.ungroup.balance='none';if(a.ref===tids[3]){assert.equal(c.ungroup.balance,'none');c.method='seasonal';}}};
 const r=await configureUngroup(channel,{ungroup:u,seasonality:season},{request:{mode:'seasonal',finish:'execute'}});
 assert.deepEqual(actions,tids);assert.equal(r.configuration.method,'seasonal');
 assert.deepEqual([supportedUngroupConfiguration(c).total_order_field,supportedUngroupConfiguration(c).support_order_field],['Period','Period']);
 c.ungroup.order_fields=[['Period'],[]];assert.throws(()=>supportedUngroupConfiguration(c),/order field/);
});
test('seasonality page is only observed when it matches and edits one owned numeric draft otherwise',async()=>{
 const values={pedSeasonalityPeriod:0,pedSeasonalityMultiplier:1,pedNumSeasonalIndexes:12,pedMaxRareDensity:0.5,pedAbsentPeriodFraction:1,pedNoveltyPeriodFraction:1,pedMaxDepthPeriodFraction:0,pedAbsentDataPoints:10,pedMaxDepthDataPoints:100};
 const binding={verified:true,node_id:'n'},anchor=root+';UngroupDataWizard-1;pedMaxRareDensity;ValueControl',identity={anchor_tid:anchor,path:[0]};
 let draft='0.5';const actions=[];
 const snap=read=>({wizard:{stage:'ungroup_seasonal',root_tid:root},prepared_node_context:binding,ui:{elements:[{ref:'rare',tid:null,identity,value:draft,allowed_actions:['fill','press']}]},
  ...(read?{node_ungroup:String(values.pedMaxRareDensity)===draft?{verified:true,kind:'seasonality',values:{...values},disabled:{}}:{verified:false}}:{})});
 const channel={observe:async o=>{const s=snap(o.readUngroup);assert.ok(o.ready(s),o.condition);return s;},
  perform:async o=>{const s=snap(true);const a=o.resolve(s);actions.push(a);if(a.verb==='fill')draft=a.text;if(a.verb==='press')values.pedMaxRareDensity=Number(draft);}};
 const changed=await configureUngroupSeasonality(channel,season);
 assert.deepEqual(actions,[{verb:'fill',ref:'rare',text:'0.25'},{verb:'press',ref:'rare',key:'Tab'}]);
 assert.deepEqual(changed.seasonality,{period:'year',multiplier:1,index_count:12,rare_density:0.25,absent_periods:1,novelty_periods:1,max_history_periods:0});
 actions.length=0;const kept=await configureUngroupSeasonality(channel,null);assert.equal(kept.effect_possible,false);assert.deepEqual(actions,[]);
 values.pedSeasonalityPeriod=2;await assert.rejects(configureUngroupSeasonality(channel,null),/only year/);
});
