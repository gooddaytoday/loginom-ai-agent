// Documentation estimate: clones only, no runtime registration or mutation.
import {readFileSync, writeFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {describeNodeTypes} from '../../../../../packages/loginom-runtime/client/lib/node-contracts.mjs';
import {userNodeTool} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const parameters=JSON.parse(readFileSync(new URL('./parameter-schema.proposal.json',import.meta.url)));
const current=nodeApiTools.find(t=>t.name==='dock_node_apply');
const proposed=structuredClone(current);
proposed.inputSchema.properties.target.properties.type.enum.push('research.factor_analysis');
proposed.inputSchema.properties.mode.enum.push('pca_fixed');
Object.assign(proposed.inputSchema.properties.parameters.properties,parameters.properties);
const semantics='Correlation-matrix PCA of complete finite continuous Integer/Real features. parameters.factor_analysis supplies the full features set, fixed factors and rotation none. New nodes require all three; existing omitted settings persist. Execute trains/retrains current input, then executes; ordinary native activation applies the saved model. Read ports 0 (scores and original fields) and 1 (ColumnName, ColumnDisplayName, loadings). P feature columns Factor1..FactorP exist even with K<P: unused scores NULL, unused loadings zero. Scores use population-SD normalization. Preserve original values and rows; explicit output mappings with autosync=false are needed for stable field order after reopen. Constants, missing training features, rank-deficient inputs, automatic selection, rotations and saved-model apply are outside this slice.';
const card=describeNodeTypes(['datamining.clustering'],{},new Map(),new Map([['datamining.clustering',{
  revision:'factor-analysis-v1-internal-1',modes:['pca_fixed'],parameter_schema:parameters,
}]]),'7.4.2')[0];
Object.assign(card,{type:'research.factor_analysis',title:'Факторный анализ',palette_group:'Исследование',
  icon_class:'bg-vendor-icon-factoranalysis',modes:['pca_fixed'],candidate_modes:['pca_fixed'],semantics,
  cache_key:'0'.repeat(64),sources:{help_path:'data/processors/scrutiny/factor-analysis.md'}});
const bytes=v=>Buffer.byteLength(JSON.stringify(v));
const definition=t=>({name:t.name,description:t.description,parameters:t.inputSchema});
const fileBytes=name=>readFileSync(new URL(name,import.meta.url)).byteLength;
const skill=readFileSync(new URL('../../../../../packages/product/skills/loginom-automation/SKILL.md',import.meta.url)).byteLength;
const result={full_input_schema:{base:bytes(current.inputSchema),proposal:bytes(proposed.inputSchema)},
  compact_input_schema:{base:bytes(userNodeTool(current).inputSchema),proposal:bytes(userNodeTool(proposed).inputSchema)},
  compact_function_definition:{base:bytes(definition(userNodeTool(current))),proposal:bytes(definition(userNodeTool(proposed))),limit:20000},
  type_card:{proposal:bytes(card),limit:12000,session_pins:'empty in estimate; reserve 1200 B for issued session pins'},
  skill:{base:skill,routing_line:fileBytes('./skill-routing.proposal.md'),proposal:skill+fileBytes('./skill-routing.proposal.md'),limit:40000},
  node_reference:{proposal:fileBytes('./skill-node.proposal.md'),limit:6000},
  note:'Estimates omit future conditional guards and other concurrent node additions. outputSchema is not part of the provider function definition.'};
if(process.argv.includes('--write-card'))writeFileSync(new URL('./type-card.proposal.json',import.meta.url),JSON.stringify(card,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
