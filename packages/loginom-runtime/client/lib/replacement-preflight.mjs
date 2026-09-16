import {preflightTabularSource} from './sorting-preflight.mjs';
import {resolveReplacementParameters} from './replacement-parameters.mjs';
export function preflightReplacementSource(options,ctx,config){return preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.rules!==undefined,resolve:resolveReplacementParameters,label:'replacement'});}
