// Offline documentation proposal only. Never registers a production handler.
import {readFile,writeFile} from 'node:fs/promises';
import {nodeApiTools} from '../../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {userNodeTool,userActionInventory} from '../../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';
import {createActionRuntime} from '../../../../../../packages/loginom-runtime/client/lib/executor.mjs';
import {createCandidateNodeSupport} from '../../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {pinActionCatalog,BUNDLED_CATALOG_RELEASES} from '../../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';

const bytes=x=>Buffer.byteLength(typeof x==='string'?x:JSON.stringify(x));
const release=JSON.parse(await readFile(new URL('../../../../../../packages/product/loginom-release.json',import.meta.url)));
const pinned=await pinActionCatalog({callTool:()=>{throw Error('unexpected remote call');}},{
 manifestUri:release.actionManifestUri,manifestSha256:release.actionManifestSha256,
 allowCandidate:true,releases:BUNDLED_CATALOG_RELEASES});
const runtime=createActionRuntime({pinned,...createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'}),
 allowCandidate:true,execute:()=>{throw Error('measurement is offline');}});
const baseline=userActionInventory(runtime.describe({node_types:['datamining.log_regression']})).node_types[0];
const card=structuredClone(baseline);
const string={type:'string',minLength:1,maxLength:128};
const enumeration=(...values)=>({type:'string',enum:values});
const object=properties=>({type:'object',properties,additionalProperties:false});
Object.assign(card.parameter_schema.properties.logistic.properties,{
 weight_field:{...string,description:'Real positive training frequency weight; native Integer has no Weight role. Exclude it from predictors. Omit for unweighted training.'},
 normalization:{...enumeration('none','scale_min_max','scale_minus_one_one','scale_zero_one','absolute_scale','standardize','ratio'),
  description:'Uniform predictor normalization. Preserve native categorical target encoding; denormalize coefficients to original units.'},
 partition:{...object({sampling:enumeration('random','sequential','column'),train_percent:{type:'number',minimum:0,maximum:100},test_percent:{type:'number',minimum:0,maximum:100},
  column:string,seed:{type:'integer',minimum:0,maximum:2147483647}}),
  description:'Train/test allocation. Column names an observed partition field; percentages apply only to random/sequential. All predictions still include input rows.'},
 validation:{...object({method:enumeration('none','kfold','monte_carlo'),folds:{type:'integer',minimum:2},
  sampling:enumeration('random','sequential','column'),column:string,iterations:{type:'integer',minimum:1},
  train_percent:{type:'number',exclusiveMinimum:0,exclusiveMaximum:100}}),
  description:'Validation within the training allocation. Explicit folds/iterations and seed required when applicable; no guessed PRNG expectations.'},
 regularization:{...object({lasso:{type:'number',minimum:0},ridge:{type:'number',minimum:0}}),
  description:'Manual nonnegative penalties: summed negative log likelihood + lasso*abs(beta) + ridge*beta^2/2; intercept unpenalized. Require the mode-specific penalties.'}
});
card.modes=[...baseline.modes,'apply','ridge','lasso','elastic_net'];
card.candidate_modes=card.modes;
card.semantics='Proposed logistic training and saved-model apply; manual numeric predictors and binary string target, observed event label, explicit threshold. Original columns pass through; coefficient table 1 and variable summary 2 use their own read channels. This documentation does not register the extensions.';
card.limitations='Proposal, not callable: apply requires an existing trained node, identical saved roles, inputs:[], no Teach, fresh current-source execution. Training modes require explicit Teach. Ports 0/1 are tables; variable port 2 is the summary. Auto method, auto penalties, calibration/scoring, bindings and categorical predictors remain pending their separate cycle. Summary classification error needs owner decision.';
const sanitize=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)?'0'.repeat(64)
 :Array.isArray(value)?value.map(sanitize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/hash|sha256|cache_key|digest/.test(k)?'0'.repeat(64):sanitize(v)])):value;
const proposed=sanitize(card),full=nodeApiTools.find(t=>t.name==='dock_node_apply');
const {name,description,inputSchema}=userNodeTool(full);
const skill=await readFile(new URL('../../../../../../packages/product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8');
const ref=await readFile(new URL('node-reference-proposal.md',import.meta.url),'utf8');
const route='Логистическая регрессия → references/nodes/datamining.log_regression.md';
const measurement={base_sha:'4b202757f6d0021160dd4dfc104ee788ae33cbec',
 model_tool_bytes:bytes({name,description,inputSchema}),full_input_schema_bytes:bytes(full.inputSchema),
 baseline_type_card_bytes:bytes(baseline),proposed_type_card_bytes:bytes(proposed),type_card_limit:12000,
 skill_bytes:bytes(skill),skill_limit:40000,routing_proposal_bytes:bytes(route),
 node_reference_proposal_bytes:bytes(ref),node_reference_limit:6000,
 note:'Manual-mode proposal only; auto/calibration/bindings are separate cycles. Full input schema has no limit. Compact apply is unchanged because it routes via the type card.'};
await writeFile(new URL('type-card-proposal.json',import.meta.url),JSON.stringify(proposed,null,2)+'\n');
await writeFile(new URL('budgets.json',import.meta.url),JSON.stringify(measurement,null,2)+'\n');
console.log(JSON.stringify(measurement));
