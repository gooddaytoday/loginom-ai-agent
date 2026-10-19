import {createExcelImportNodeSupport} from './imports-excel-node.mjs';
import {createRestRequestNodeSupport} from './rest-request-node.mjs';
import {createLinRegressionNodeSupport} from './linregression-node.mjs';
import {createClusteringNodeSupport} from './clustering-node.mjs';
import {createCrossTableNodeSupport} from './crosstable-node.mjs';
import {createReplacementNodeSupport} from './replacement-node.mjs';
import {createDuplicatesNodeSupport} from './duplicates-node.mjs';
import {createDateTimeNodeSupport} from './date-time-node.mjs';
import {createMissingValuesNodeSupport} from './missing-values-node.mjs';
import {createCollapseNodeSupport} from './collapse-node.mjs';
import {createUnionNodeSupport} from './union-node.mjs';
import {createTextExportNodeSupport} from './text-export-node.mjs';
import {createJoinNodeSupport} from './join-node.mjs';
import {createFilterNodeSupport} from './filter-node.mjs';
import {createTextImportNodeSupport} from './text-import-node.mjs';
import {createSortingNodeSupport} from './sorting-node.mjs';
import {createGroupingNodeSupport} from './grouping-node.mjs';
import {createReformNodeSupport} from './reform-node.mjs';
import {createCalculatorNodeSupport} from './calculator-node.mjs';
import {createJavascriptCodeNodeSupport} from './javascript-code-node.mjs';
import {createRedactor} from './redact.mjs';
import {NODE_READ_MODE} from './node-read-contract.mjs';
import {createNodeReadDrivers} from './node-read-driver.mjs';

// The journal canonicalizes JSON text and redacts URL credentials. Prepare
// public table evidence the same way before the existing exact ACK comparison.
export function nodeOutputForJournal(value,redactor){
 const cleaned=redactor.redact(value);
 if(cleaned?.type==='redaction_failure')throw Error('Node output could not be redacted');
 return cleaned;
}

// Candidate implementations share one lifecycle, gate and browser. Dispatch by
// the already validated request; never infer a handler from the current UI.
export function createCandidateNodeSupport(config) {
 const linregression=createLinRegressionNodeSupport(config),clustering=createClusteringNodeSupport(config),crosstable=createCrossTableNodeSupport(config),exports=createTextExportNodeSupport(config),collapse=createCollapseNodeSupport(config),missingValues=createMissingValuesNodeSupport(config),dateTime=createDateTimeNodeSupport(config),duplicates=createDuplicatesNodeSupport(config),replacement=createReplacementNodeSupport(config),union=createUnionNodeSupport(config),join=createJoinNodeSupport(config),filter=createFilterNodeSupport(config),imports=createTextImportNodeSupport(config),calculator=createCalculatorNodeSupport(config),grouping=createGroupingNodeSupport(config),sorting=createSortingNodeSupport(config),reform=createReformNodeSupport(config);
 const excel=createExcelImportNodeSupport(config),rest=createRestRequestNodeSupport(config);
 const redactor=config.redactor??createRedactor();
 const javascript=config.targetBuild==='7.4.2'&&typeof config.targetOrigin==='string'&&config.targetOrigin.length>0
  ?createJavascriptCodeNodeSupport({targetOrigin:config.targetOrigin,targetBuild:config.targetBuild,redactor}):null;
 const nodeApplyHandlers=new Map([...excel.nodeApplyHandlers,...linregression.nodeApplyHandlers,...clustering.nodeApplyHandlers,...rest.nodeApplyHandlers,...crosstable.nodeApplyHandlers,...exports.nodeApplyHandlers,...collapse.nodeApplyHandlers,...missingValues.nodeApplyHandlers,...dateTime.nodeApplyHandlers,...duplicates.nodeApplyHandlers,...replacement.nodeApplyHandlers,...imports.nodeApplyHandlers,...calculator.nodeApplyHandlers,...grouping.nodeApplyHandlers,...sorting.nodeApplyHandlers,...reform.nodeApplyHandlers,...filter.nodeApplyHandlers,...join.nodeApplyHandlers,...union.nodeApplyHandlers,...(javascript?.nodeApplyHandlers??[])]);
 return {nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  const type=options.operation.parameters?.target?.type;
  if(options.operation.parameters?.mode===NODE_READ_MODE||['integration.rest_request','transform.join_data'].includes(type)){
   const drivers=options.operation.parameters?.mode===NODE_READ_MODE?createNodeReadDrivers(options,{...config,redactor})
    :(type==='integration.rest_request'?rest:join).nodeApplyDriverFactory(options);
   return {...drivers,readOutput:async(...args)=>nodeOutputForJournal(await drivers.readOutput(...args),redactor)};
  }
  if(type==='datamining.lin_regression')return linregression.nodeApplyDriverFactory(options);
  if(type==='datamining.clustering')return clustering.nodeApplyDriverFactory(options);
  if(type==='preprocessing.data_recovery')return missingValues.nodeApplyDriverFactory(options);
  if(type==='exports.text')return exports.nodeApplyDriverFactory(options);
  if(type==='transform.collapse_columns')return collapse.nodeApplyDriverFactory(options);
  if(type==='transform.date_time')return dateTime.nodeApplyDriverFactory(options);
  if(type==='research.duplicates')return duplicates.nodeApplyDriverFactory(options);
  if(type==='transform.union_data')return union.nodeApplyDriverFactory(options);
  if(type==='transform.filter_data')return filter.nodeApplyDriverFactory(options);
  if(type==='imports.excel')return excel.nodeApplyDriverFactory(options);
  if(type==='imports.text')return imports.nodeApplyDriverFactory(options);
  if(type==='transform.reform_columns')return reform.nodeApplyDriverFactory(options);
  if(type==='transform.replace_columns')return replacement.nodeApplyDriverFactory(options);
  if(type==='transform.sorting')return sorting.nodeApplyDriverFactory(options);
  if(type==='transform.group_data')return grouping.nodeApplyDriverFactory(options);
  if(type==='transform.cross_table')return crosstable.nodeApplyDriverFactory(options);
  if(type==='transform.calculator')return calculator.nodeApplyDriverFactory(options);
  if(type==='programming.javascript'){
   if(!javascript)throw Error('JavaScript requires the validated 7.4.2 target and origin');
   const drivers=javascript.nodeApplyDriverFactory(options);
   return {...drivers,readOutput:async(...args)=>nodeOutputForJournal(await drivers.readOutput(...args),redactor)};
  }
  throw Error('No candidate driver for '+type);
 }};
}
