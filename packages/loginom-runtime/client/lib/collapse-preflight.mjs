import {requireCollapseSourceReady} from './collapse-source-readiness.mjs';
import {preflightTabularSource} from './sorting-preflight.mjs';
import {resolveCollapseParameters} from './collapse-parameters.mjs';
import {checkCollapseExistingInput} from './collapse-existing-input.mjs';
export async function preflightCollapseSource(options,ctx,config){
 await requireCollapseSourceReady(options,ctx,config);
 await checkCollapseExistingInput(options,ctx,config);
 return preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.information!==undefined,resolve:resolveCollapseParameters,label:'collapse'});
}
