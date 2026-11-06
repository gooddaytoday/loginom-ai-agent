import {preflightTabularSource} from './sorting-preflight.mjs';
import {preflightInactiveTabularSource} from './grouping-preflight.mjs';
import {resolveDataToVarParameters} from './variables-datatovar-parameters.mjs';

export function preflightDataToVarSource(options,ctx,config){
 return preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.fields!==undefined,
  label:'datatovar',resolve:resolveDataToVarParameters,inactiveSource:source=>preflightInactiveDataToVarSource(options,source)});
}

export function preflightInactiveDataToVarSource(options,source){
 return preflightInactiveTabularSource(options,source,{label:'datatovar',
  sourceIcons:['bg-vendor-icon-importtextfile'],resolve:resolveDataToVarParameters});
}
