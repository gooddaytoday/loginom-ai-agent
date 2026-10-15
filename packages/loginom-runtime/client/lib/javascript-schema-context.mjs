import {readPreparedNodeContext,validatePreparedNodeContext} from './node-context.mjs';
import {readJavascriptSchema} from './javascript-schema-browser.mjs';

export function makeJavascriptSchemaContextCode(binding) {
  validatePreparedNodeContext(binding);
  return `async page=>(${readJavascriptSchemaContext.toString()})(page,${JSON.stringify(binding)},${readPreparedNodeContext.toString()},${readJavascriptSchema.toString()})`;
}

// The prepared owner is checked on both sides of the native-cache read. The
// browser reader independently binds its current wizard/node to that owner.
export async function readJavascriptSchemaContext(page,binding,readNode=readPreparedNodeContext,readBrowser=readJavascriptSchema) {
  const before=await readNode(page,binding);
  if(before.verified!==true||before.surface!=='wizard'||before.input_port||before.output_port)
    return {verified:false,reason:'javascript_node_surface'};
  const result=await page.evaluate(readBrowser,{prepared:binding});
  const after=await readNode(page,binding);
  if(JSON.stringify(before)!==JSON.stringify(after))return {verified:false,reason:'javascript_node_changed'};
  return {...result,node_context:after};
}
