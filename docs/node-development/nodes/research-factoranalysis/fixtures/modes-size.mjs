// Stage-0 proposal sizing; does not register modes or mutate runtime schemas.
import {readFileSync, writeFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {createCandidateNodeSupport} from '../../../../../packages/loginom-runtime/client/lib/node-support.mjs';
import {describeNodeTypes} from '../../../../../packages/loginom-runtime/client/lib/node-contracts.mjs';
import {pinActionCatalog, BUNDLED_CATALOG_RELEASES} from '../../../../../packages/loginom-runtime/client/lib/action-catalog.mjs';
import {userNodeTool} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const root = new URL('../', import.meta.url);
const skill = new URL('../../../../../packages/product/skills/loginom-automation/', import.meta.url);
const currentSkill = readFileSync(new URL('SKILL.md',skill),'utf8');
let proposedSkill = currentSkill;
const release = JSON.parse(readFileSync(new URL('../../../../../packages/product/loginom-release.json', import.meta.url)));
const pinned = await pinActionCatalog({callTool:()=>{throw Error('Unexpected remote access');}}, {
  manifestUri:release.actionManifestUri, manifestSha256:release.actionManifestSha256,
  allowCandidate:true, releases:BUNDLED_CATALOG_RELEASES,
});
const support = createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai', targetBuild:pinned.compatibility.loginom_build});
const zero = '0'.repeat(64);
const scrub = value => typeof value === 'string' && /^[a-f0-9]{40,64}$/.test(value) ? zero :
  Array.isArray(value) ? value.map(scrub) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,scrub(v)])) : value;
const pins = {...pinned.pins, skillRevision:zero, loginomProfile:pinned.compatibility};
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const leaf = (type, description, extra={}) => ({type, description, ...extra});
const list = description => leaf('array', description, {minItems:1, maxItems:128, uniqueItems:true, items:leaf('string','Exact technical field name.',{minLength:1,maxLength:128})});
const modes = {
  'research.factor_analysis': {
    slug:'research-factoranalysis', modes:['pca_fixed','pca_auto','apply'],
    semantics:'Correlation PCA with fixed count or eigenvalue/variance selection, explicit none or Kaiser-normalized varimax/quartimax rotation, optional output cap. Execute explicitly trains current input; apply uses only the saved fit on its existing node. Read scores 0 and loadings 1. Without cap all P factor columns remain; cap limits physical columns on both ports. Constants have zero loadings; zero eigenvalues have NULL scores. NULL training uses marginal means/SD and paired raw moments; incomplete rows have NULL scores. Preserve input rows; never impute or silently change features.',
    properties:{factor_analysis:{type:'object',additionalProperties:false,description:'Proposal: new nodes require features, rotation and factors OR selection. Existing omissions preserve settings; apply preserves the saved model.',properties:{
      features:{...list('Complete continuous numeric feature set in source order.'),minItems:2},
      factors:leaf('integer','Requested count. Zero-eigenvalue components have NULL scores and zero loadings.',{minimum:1,maximum:128}),
      selection:{type:'object',additionalProperties:false,description:'Auto selection. Equality on an eigenvalue cutoff is outside the proposed cases.',properties:{criterion:leaf('string','Choose one criterion.',{enum:['eigenvalue','variance']}),threshold:leaf('number','Eigenvalue cutoff 0.1..1.5 or cumulative variance percent 1..100.')},required:['criterion','threshold'],oneOf:[{properties:{criterion:{const:'eigenvalue'},threshold:{minimum:.1,maximum:1.5}}},{properties:{criterion:{const:'variance'},threshold:{minimum:1,maximum:100}}}]},
      rotation:leaf('string','Explicit orthogonal rotation.',{enum:['none','varimax','quartimax']}),
      output_cap:leaf(['integer','null'],'Integer limits physical factor columns; null disables the cap; omission preserves existing state.',{minimum:1,maximum:128}),
    },required:[]}},
    routing:'| Факторный анализ | `research.factor_analysis` | [читать](references/nodes/research.factor_analysis.md) |\n',
  },
  'research.corr_analysis': {
    slug:'research-corranalysis', modes:['pearson','spearman','kendall','cross_correlation'],
    semantics:'Two complete field sets; Pearson, tied-rank Spearman, Kendall tau-b or cross-correlation extremum with native lag. Output 0 preserves pair identities and native pair order. Numeric discrete fields retain their values. ASCII text categories use lexical equally spaced ordinal codes, not first appearance; do not invent codes. Unicode/case collation is unverified. Execute without training. Empty input requires a fresh result or readable refusal; never reuse a previous table.',
    properties:{first_set:list('Complete first field set.'),second_set:list('Complete second field set.')},
    routing:'| Корреляция | `research.corr_analysis` | [читать](references/nodes/research.corr_analysis.md) |\n',
  },
  'research.auto_correlation': {
    slug:'research-autocorrelation', modes:['time_domain','frequency_domain'],
    semantics:'ACF in explicit time or frequency domain, one or several numeric series in input row order, optional PACF. lag_count includes lag zero. Output 0 has Lag, every series ACF/StdErr/Significant block, then each requested PACF field. Native PACF is the partial correlation of overlapping lag endpoints conditional on intermediate lags and an intercept. No training. NULL input refuses; never fill, drop observations or return stale output.',
    properties:{autocorrelation:{type:'object',additionalProperties:false,description:'Series selection and lag settings. field remains for the existing single-series mode; do not combine it with fields.',properties:{field:leaf('string','Existing single-series technical name.'),fields:list('Complete numeric series selection in input order.'),lag_count:leaf('integer','Count including lag zero.',{minimum:1,maximum:9007199254740991}),pacf:leaf('boolean','Request partial autocorrelation in addition to ACF.')},required:[]}},
    routing:'| АКФ и ЧАКФ | `research.auto_correlation` | [читать](references/nodes/research.auto_correlation.md) |\n',
  },
};
const result = [];
for (const [type, proposal] of Object.entries(modes)) {
  const current = describeNodeTypes([type], pins, pinned.actions, support.nodeApplyHandlers, pinned.compatibility.loginom_build)[0];
  const baseline = bytes(current), card = scrub(current);
  card.modes = card.candidate_modes = proposal.modes;
  card.semantics = proposal.semantics;
  card.parameter_schema = {type:'object',additionalProperties:false,description:'Stage-0 proposal; not a published contract.',properties:proposal.properties,required:[]};
  const directory = new URL(`../${proposal.slug}/`, root);
  const oldRouting = currentSkill.split('\n').filter(line=>line.includes('`'+type+'`'));
  if(oldRouting.length!==1)throw Error('Expected one existing routing row: '+type);
  proposedSkill = proposedSkill.replace(oldRouting[0]+'\n',proposal.routing);
  if (process.argv.includes('--write')) {
    writeFileSync(new URL('fixtures/modes-type-card.proposal.json', directory), JSON.stringify(card,null,2)+'\n');
    writeFileSync(new URL('fixtures/modes-skill-routing.proposal.md', directory), proposal.routing);
  }
  result.push({type, current_card_bytes:baseline, proposed_card_bytes:bytes(card),
    routing_current_bytes:Buffer.byteLength(oldRouting[0]+'\n'),routing_bytes:Buffer.byteLength(proposal.routing),
    reference_current_bytes:readFileSync(new URL('references/nodes/'+type+'.md',skill)).length,
    reference_proposed_bytes:readFileSync(new URL('fixtures/modes-skill-node.proposal.md',directory)).length});
}
const full = nodeApiTools.find(t=>t.name==='dock_node_apply');
const {name,description,inputSchema} = userNodeTool(full);
const proposedFull = structuredClone(full);
for (const proposal of Object.values(modes)) {
  proposedFull.inputSchema.properties.mode.enum = [...new Set([...proposedFull.inputSchema.properties.mode.enum,...proposal.modes])];
  Object.assign(proposedFull.inputSchema.properties.parameters.properties,proposal.properties);
}
const proposedTool = userNodeTool(proposedFull);
console.log(JSON.stringify({full_input_schema_bytes:bytes(full.inputSchema),model_tool_bytes:bytes({name,description,inputSchema}),
  full_input_schema_proposed_bytes:bytes(proposedFull.inputSchema),
  model_tool_proposed_bytes:bytes({name:proposedTool.name,description:proposedTool.description,inputSchema:proposedTool.inputSchema}),
  skill_current_bytes:Buffer.byteLength(currentSkill),skill_proposed_bytes:Buffer.byteLength(proposedSkill),
  cards:result},null,2));
