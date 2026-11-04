// Offline proposal only. No registration or change to production objects.
import {readFileSync} from 'node:fs';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';
import {describeNodeTypes} from '../../../../../packages/loginom-runtime/client/lib/node-contracts.mjs';
import {userNodeTool} from '../../../../../packages/loginom-runtime/client/lib/user-workflow.mjs';

const bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const parameter=JSON.parse(read('parameter-schema.json'));
const full=structuredClone(nodeApiTools.find(t=>t.name==='dock_node_apply'));
const before=bytes(full.inputSchema), compactBefore=bytes(userNodeTool(full).inputSchema);
full.inputSchema.properties.target.properties.type.enum.push('preprocessing.coarse_classes');
full.inputSchema.properties.parameters.properties.coarse_classes=parameter;
const parameterSchema={type:'object',properties:{coarse_classes:parameter},required:[],additionalProperties:false};
const card=describeNodeTypes(['preprocessing.binning'],{},new Map(),new Map([
  ['preprocessing.binning',{revision:'coarse-classes-v1-internal-1',modes:['internal','apply'],parameter_schema:parameterSchema}]
]))[0];
Object.assign(card,{type:'preprocessing.coarse_classes',title:'Конечные классы',
  icon_class:'bg-vendor-icon-coarseclasses',tabular_outputs:3,additional_tabular_inputs:false,
  semantics:'One discrete string predictor and binary string target. parameters.coarse_classes assigns input/target/event and automatic partition with explicit percent/count settings; unlisted fields are unused and preserved. internal explicitly trains current input, then executes. Existing apply requires saved classes and parameters:{}, inputs:[], mappings:[], finish:execute; no training or settings commit. Explicitly read ports [0,1,2]: rows, class WoE/IV, feature IV. ClassSignificant is class IV. Preserve input row/field order and NULL versus empty string. No continuous/external/manual/frozen bins, variables, unseen/NULL predictors or zero-frequency training classes.'});
card.sources.help_path='data/processors/preprocessing/coarse-classes.md';
const skill=readFileSync(new URL('../../../../../packages/product/skills/loginom-automation/SKILL.md',import.meta.url),'utf8');
const result={full_apply_base:before,full_apply_proposal:bytes(full.inputSchema),
  full_apply_growth:bytes(full.inputSchema)-before,compact_apply_base:compactBefore,
  compact_apply_proposal:bytes(userNodeTool(full).inputSchema),type_card_proposal:bytes(card),
  parameter_schema:bytes(parameter),main_skill_base:bytes(skill),routing_line:bytes(read('skill-routing.txt')),
  main_skill_proposal:bytes(skill)+bytes(read('skill-routing.txt')),node_reference:bytes(read('skill-node.md'))};
console.log(JSON.stringify(result,null,2));
