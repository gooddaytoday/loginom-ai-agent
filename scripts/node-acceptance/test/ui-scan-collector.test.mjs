import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {writeFileSync,readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {NavigationPage} from './ui-scan-receiving-fixture.mjs';
import {makeWorkspaceUiCode} from '../../../packages/loginom-runtime/client/lib/workspace-ui.mjs';
import {collectUiScan,observerSha256} from '../ui-scan-collector.mjs';
const options={mode:'observe',expected_build:'7.5.0-alpha+build.49202',expected_origin:'https://loginom.test'};
function fixture(){
 let elapsed=0;class Clock extends Date{static now(){return elapsed;}}
 const page=new NavigationPage({clock:Clock});page.context.performance=performance;page.context.innerWidth=1000;page.context.innerHeight=800;
 page.evaluate=(fn,arg)=>vm.runInContext('('+fn.toString()+')',page.context)(arg);
 const root=page.add('div','MF;TF-1;WizrdMCF');
 page.add('div','MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;edtValueNull','',undefined,root);
 const base='MF;TF-1;WizrdMCF;ImportTextFileParamsWizard;ColumnDefsTuning;grdSettings;grd-1;normalHeaderCt;1';
 page.add('div',base,'Amount',{x:200,y:170,width:70,height:25},root);
 for(const [i,value] of ['Amount','Amount','Строковый','Дискретный',''].entries()){const cell=page.add('td',base+'_'+i,value,{x:200,y:200+i*30,width:70,height:25},root);if(i===4)page.add('img',null,'',cell.box,cell).attrs.class='x-grid-checkcolumn x-grid-checkcolumn-checked';}
 const sentinel=page.add('button','Safe;btnProbe','',undefined,root);
 return {page,sentinel,advance:n=>{elapsed+=n;}};
}
const execute=(source,page)=>vm.runInContext('('+source+')',page.context)(page);
const collect=(page,opts=options)=>collectUiScan(page,opts,execute,{expectedObserverSha256:observerSha256});

test('collector preserves exact observer selection and counts without persisting field values',async()=>{
 const f=fixture(),before=await execute(makeWorkspaceUiCode(options),f.page);
 const report=await collect(f.page),after=await execute(makeWorkspaceUiCode(options),f.page);
 assert.deepEqual(after,before);
 assert.equal(report.receipt.status,before.status);assert.equal(report.omitted_scans,0);
 const scan=report.scans[0];
 for(const stage of ['collect','metadata','output_definitions','import_definitions','filter','sort','render'])assert.ok(scan.stages.some(s=>s.name===stage),stage);
 assert.equal(scan.counts.returned,before.output.ui.elements.length);
 assert.ok(scan.counts.candidate>=scan.counts.filtered);assert.ok(scan.counts.filtered>=scan.counts.returned);
 for(const category of ['geometry','style','hit_test']){assert.ok(scan.calls[category].count>0,JSON.stringify(scan.calls));assert.ok(scan.calls[category].ms>=0);}
 if(process.env.LOGINOM_COLLECTOR_PROOF_FILE)writeFileSync(process.env.LOGINOM_COLLECTOR_PROOF_FILE,JSON.stringify(report,null,2)+'\n');
 const serialized=JSON.stringify(report);assert.equal(serialized.includes('Строковый'),false);assert.equal(serialized.includes('Amount'),false);
 assert.equal(scan.clock,'performance.now');assert.ok(scan.stages.every(s=>Number.isFinite(s.ms)&&s.ms>=0));
});

test('measured call cost is distinct from artificial Date budget overrun',async()=>{
 const f=fixture();const closest=f.sentinel.closest.bind(f.sentinel);let injected=false;
 f.sentinel.closest=s=>{if(!injected&&s==='[data-tid="mnContextMenu"]'){injected=true;f.advance(2000);}return closest(s);};
 const report=await collect(f.page);assert.equal(report.receipt.status,'NOT_APPLIED');assert.equal(report.receipt.error_code,'UI_SCAN_LIMIT');
 assert.equal(report.receipt.scan.complete,false);assert.equal(report.receipt.failed_scans[0].elapsed_ms,2000);
 assert.equal(report.scans[0].counts.returned,0);
 assert.notEqual(report.scans[0].elapsed_ms,2000,'performance measurement must not substitute injected Date duration');
 assert.equal(report.receipt.effect_possible,false);assert.deepEqual(f.page.events,[]);
});

test('explicit observer binding is required before any Page read',async()=>{
 let reads=0;await assert.rejects(collectUiScan({evaluate:()=>{reads++;}},options,execute,{expectedObserverSha256:'foreign'}),/SHA256/);assert.equal(reads,0);
});

test('geometry/style/hit-test instrumentation preserves DOM call order and budget work',async()=>{
 const f=fixture(),calls=[];
 const style=f.page.context.getComputedStyle;
 f.page.context.getComputedStyle=e=>{calls.push('style');return style(e);};
 const hit=f.page.document.elementFromPoint.bind(f.page.document);
 f.page.document.elementFromPoint=(x,y)=>{calls.push('hit');return hit(x,y);};
 for(const e of f.page.document.all()) {const box=e.getBoundingClientRect.bind(e);e.getBoundingClientRect=()=>{calls.push('box');return box();};}
 await execute(makeWorkspaceUiCode(options),f.page);calls.length=0;
 const before=await execute(makeWorkspaceUiCode(options),f.page),order=[...calls];calls.length=0;
 const report=await collect(f.page);
 assert.deepEqual(calls,order);assert.equal(report.scans[0].scan.max_ms,before.output.scan.max_ms);
 assert.equal(report.scans[0].scan.visited_elements,before.output.scan.visited_elements);
 for(const stage of report.scans[0].stages){assert.ok(stage.work_end>=stage.work_start);assert.ok(stage.visited_end>=stage.visited_start);}
});

test('collector retains one postgesture effect without partial action references',async()=>{
 const f=fixture(),snapshot=await execute(makeWorkspaceUiCode(options),f.page);
 const field=snapshot.output.wizard.import_columns.fields.find(x=>x.index===1);
 const closest=f.sentinel.closest.bind(f.sentinel);let injected=false;
 f.sentinel.closest=s=>{if(!injected&&s==='[data-tid="mnContextMenu"]'&&f.page.events.includes('double_click')){injected=true;f.advance(2000);}return closest(s);};
 const report=await collect(f.page,{...options,mode:'act',action:{verb:'double_click',ref:field.cell_refs.type},snapshot:snapshot.output});
 assert.equal(report.receipt.status,'AMBIGUOUS');assert.equal(report.receipt.phase,'observing');assert.equal(report.receipt.effect_possible,true);
 assert.equal(report.receipt.error_code,'UI_SCAN_LIMIT');assert.equal(report.scans.at(-1).counts.returned,0);
 assert.equal(f.page.events.filter(x=>x==='double_click').length,1);
 assert.equal(report.receipt.ui,undefined);assert.equal(report.receipt.output,undefined);
});

test('collector bounds retained scans without truncating native observer execution',async()=>{
 const f=fixture();let reads=0;
 const report=await collectUiScan(f.page,options,async(source,page)=>{
  let result;for(let i=0;i<9;i++){result=await execute(source,page);reads++;}return result;
 },{expectedObserverSha256:observerSha256});
 assert.equal(reads,9);assert.equal(report.scans.length,8);assert.equal(report.omitted_scans,1);
});

test('receiving contract pins the retained production observer explicitly',()=>{
 const pin='e0e045f97840e18e68a22154a3035007be2915497c7fc68bb1bade572fcc3238';
 assert.equal(observerSha256,pin);
 assert.ok(readFileSync(new URL('../ui-scan-capture-contract.md',import.meta.url),'utf8').includes('`'+pin+'`'));
});

test('source observer pin is refused before reading the receiving Page',async()=>{
 let reads=0;
 await assert.rejects(collectUiScan({evaluate:()=>{reads++;}},options,execute,
  {expectedObserverSha256:'6dceec2e2eb910d5e3e2b3d521c325883cbcce4e56152213ac0127d166e70eae'}),/SHA256/);
 assert.equal(reads,0);
});

test('changed serialized callback cannot produce an accepted collector report',async()=>{
 const f=fixture();let executions=0;
 await assert.rejects(collectUiScan(f.page,options,async(source,page)=>{
  executions++;
  return execute(source.replace("scanStage='controls';","scanStage='controls';/* foreign callback */"),page);
 },{expectedObserverSha256:observerSha256}),/No exact serialized observer scan/);
 assert.equal(executions,1);
});

test('receiving collector propagates a lost postgesture reply without replay',async()=>{
 const f=fixture(),snapshot=await execute(makeWorkspaceUiCode(options),f.page);
 const field=snapshot.output.wizard.import_columns.fields.find(x=>x.index===1);
 let executions=0;
 await assert.rejects(collectUiScan(f.page,{...options,mode:'act',action:{verb:'double_click',ref:field.cell_refs.type},snapshot:snapshot.output},async(source,page)=>{
  executions++;await execute(source,page);throw Error('lost reply');
 },{expectedObserverSha256:observerSha256}),/lost reply/);
 assert.equal(executions,1);assert.equal(f.page.events.filter(x=>x==='double_click').length,1);
});
