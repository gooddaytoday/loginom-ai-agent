import {createVariablesCalculatorNodeSupport} from './variables-calculator-node.mjs';
import {createDataToVarNodeSupport} from './variables-datatovar-node.mjs';
import {createUserVariablesNodeSupport} from './crosstable-variables.mjs';
import {createQualityNodeSupport} from './quality-node.mjs';
import {createColUnionNodeSupport} from './col-union-node.mjs';
import {createLgdImportNodeSupport} from './lgd-import-node.mjs';
import {createLgdExportNodeSupport} from './lgd-export-node.mjs';
import {createCoarseClassesNodeSupport} from './coarse-classes-node.mjs';
import {createTreeConversionNodeSupport} from './tree-conversion-node.mjs';
import {createAssnRulesNodeSupport} from './assn-rules-node.mjs';
import {createExcelExportNodeSupport} from './exports-excel-node.mjs';
import {createTreeNodeSupport} from './tree-node.mjs';
import {createBinningNodeSupport} from './binning-node.mjs';
import {createSamplingNodeSupport} from './sampling-node.mjs';
import {createDataPartitionNodeSupport} from './data-partition-node.mjs';
import {createLogRegressionNodeSupport} from './log-regression-node.mjs';
import {createExcelImportNodeSupport} from './imports-excel-node.mjs';
import {createRestRequestNodeSupport} from './rest-request-node.mjs';
import {createLinRegressionNodeSupport} from './linregression-node.mjs';
import {createAutoCorrelationNodeSupport} from './auto-correlation-node.mjs';
import {createCorrAnalysisNodeSupport} from './corr-analysis-node.mjs';
import {createElimOutlierNodeSupport} from './elim-outlier-node.mjs';
import {createFactorAnalysisNodeSupport} from './factor-analysis-node.mjs';
import {createClusteringNodeSupport} from './clustering-node.mjs';
import {createCrossTableNodeSupport} from './crosstable-node.mjs';
import {createReplacementNodeSupport} from './replacement-node.mjs';
import {createDuplicatesNodeSupport} from './duplicates-node.mjs';
import {createSmoothingNodeSupport} from './smoothing-node.mjs';
import {createSlidingWindowNodeSupport} from './sliding-window-node.mjs';
import {createDateTimeNodeSupport} from './date-time-node.mjs';
import {createMissingValuesNodeSupport} from './missing-values-node.mjs';
import {createCollapseNodeSupport} from './collapse-node.mjs';
import {createEnrichNodeSupport} from './enrich-node.mjs';
import {createUnionNodeSupport} from './union-node.mjs';
import {createTextExportNodeSupport} from './text-export-node.mjs';
import {createUngroupNodeSupport} from './ungroup-node.mjs';
import {createJoinNodeSupport} from './join-node.mjs';
import {createFilterNodeSupport} from './filter-node.mjs';
import {createTextImportNodeSupport,verifyDeferredTextImportSources} from './text-import-node.mjs';
import {createSortingNodeSupport} from './sorting-node.mjs';
import {createGroupingNodeSupport} from './grouping-node.mjs';
import {createReformNodeSupport} from './reform-node.mjs';
import {createCalculatorNodeSupport} from './calculator-node.mjs';
import {createJavascriptCodeNodeSupport} from './javascript-code-node.mjs';
import {createRedactor} from './redact.mjs';
import {NODE_READ_MODE,isUnchangedTextImportExecution,isUnchangedTransformExecution} from './node-read-contract.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {createNodeReadDrivers} from './node-read-driver.mjs';

// The journal canonicalizes JSON text and redacts URL credentials. Prepare
// public port evidence the same way before the existing exact ACK comparison.
export function nodeOutputForJournal(value,redactor){
 const cleaned=redactor.redact(value);
 if(cleaned?.type==='redaction_failure')throw Error('Node output could not be redacted');
 return cleaned;
}

// Candidate implementations share one lifecycle, gate and browser. Dispatch by
// the already validated request; never infer a handler from the current UI.
export function createCandidateNodeSupport(config) {
 const dataToVar=createDataToVarNodeSupport(config);
 const userVariables=createUserVariablesNodeSupport(config),variablesCalculator=createVariablesCalculatorNodeSupport(config);
 const lgdImport=createLgdImportNodeSupport(config),lgdExport=createLgdExportNodeSupport(config);
 const factorAnalysis=createFactorAnalysisNodeSupport(config);
 const tableTree=createTreeConversionNodeSupport(config,{table:true}),treeJson=createTreeConversionNodeSupport(config,{table:false});
 const assnRules=createAssnRulesNodeSupport(config);
 const enrich=createEnrichNodeSupport(config);
 const quality=createQualityNodeSupport(config);
 const colUnion=createColUnionNodeSupport(config);
 const ungroup=createUngroupNodeSupport(config);
 const excelExport=createExcelExportNodeSupport(config);
 const jsonTree=createTreeNodeSupport(config,{json:true}),treeTable=createTreeNodeSupport(config,{json:false});
 const autoCorrelation=createAutoCorrelationNodeSupport(config);
 const coarseClasses=createCoarseClassesNodeSupport(config);
 const binning=createBinningNodeSupport(config);
 const smoothing=createSmoothingNodeSupport(config);
 const slidingWindow=createSlidingWindowNodeSupport(config);
 const elimOutlier=createElimOutlierNodeSupport(config);
 const logregression=createLogRegressionNodeSupport(config),correlation=createCorrAnalysisNodeSupport(config),linregression=createLinRegressionNodeSupport(config),clustering=createClusteringNodeSupport(config),crosstable=createCrossTableNodeSupport(config),exports=createTextExportNodeSupport(config),collapse=createCollapseNodeSupport(config),missingValues=createMissingValuesNodeSupport(config),dateTime=createDateTimeNodeSupport(config),duplicates=createDuplicatesNodeSupport(config),replacement=createReplacementNodeSupport(config),union=createUnionNodeSupport(config),join=createJoinNodeSupport(config),filter=createFilterNodeSupport(config),imports=createTextImportNodeSupport(config),calculator=createCalculatorNodeSupport(config),grouping=createGroupingNodeSupport(config),sorting=createSortingNodeSupport(config),reform=createReformNodeSupport(config);
 const sampling=createSamplingNodeSupport(config),partition=createDataPartitionNodeSupport(config);
 const excel=createExcelImportNodeSupport(config),rest=createRestRequestNodeSupport(config);
 const redactor=config.redactor??createRedactor();
 const javascript=config.targetBuild==='7.4.2'&&typeof config.targetOrigin==='string'&&config.targetOrigin.length>0
  ?createJavascriptCodeNodeSupport({targetOrigin:config.targetOrigin,targetBuild:config.targetBuild,redactor}):null;
 const nodeApplyHandlers=new Map([...variablesCalculator.nodeApplyHandlers,...dataToVar.nodeApplyHandlers,...userVariables.nodeApplyHandlers,...quality.nodeApplyHandlers,...colUnion.nodeApplyHandlers,...lgdImport.nodeApplyHandlers,...lgdExport.nodeApplyHandlers,...coarseClasses.nodeApplyHandlers,...factorAnalysis.nodeApplyHandlers,...tableTree.nodeApplyHandlers,...treeJson.nodeApplyHandlers,...assnRules.nodeApplyHandlers,...enrich.nodeApplyHandlers,...ungroup.nodeApplyHandlers,...smoothing.nodeApplyHandlers,...binning.nodeApplyHandlers,...autoCorrelation.nodeApplyHandlers,...excelExport.nodeApplyHandlers,...jsonTree.nodeApplyHandlers,...treeTable.nodeApplyHandlers,...elimOutlier.nodeApplyHandlers,...logregression.nodeApplyHandlers,...correlation.nodeApplyHandlers,...sampling.nodeApplyHandlers,...partition.nodeApplyHandlers,...excel.nodeApplyHandlers,...linregression.nodeApplyHandlers,...clustering.nodeApplyHandlers,...rest.nodeApplyHandlers,...crosstable.nodeApplyHandlers,...exports.nodeApplyHandlers,...collapse.nodeApplyHandlers,...missingValues.nodeApplyHandlers,...dateTime.nodeApplyHandlers,...slidingWindow.nodeApplyHandlers,...duplicates.nodeApplyHandlers,...replacement.nodeApplyHandlers,...imports.nodeApplyHandlers,...calculator.nodeApplyHandlers,...grouping.nodeApplyHandlers,...sorting.nodeApplyHandlers,...reform.nodeApplyHandlers,...filter.nodeApplyHandlers,...join.nodeApplyHandlers,...union.nodeApplyHandlers,...(javascript?.nodeApplyHandlers??[])]);
 return {nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  const type=options.operation.parameters?.target?.type;
  const readOnly=options.operation.parameters?.mode===NODE_READ_MODE||isUnchangedTextImportExecution(options.operation.parameters)||isUnchangedTransformExecution(options.operation.parameters);
  const drivers=(()=>{
  if(type==='variables.calculator'&&!readOnly)return variablesCalculator.nodeApplyDriverFactory(options);
  if(type==='variables.user')return userVariables.nodeApplyDriverFactory(options);
  if(type==='variables.from_table'&&!readOnly)return dataToVar.nodeApplyDriverFactory(options);
  if(readOnly||['integration.rest_request','transform.join_data'].includes(type)){
   return readOnly?createNodeReadDrivers(options,{...config,redactor})
    :(type==='integration.rest_request'?rest:join).nodeApplyDriverFactory(options);
  }
  if(type==='research.quality')return quality.nodeApplyDriverFactory(options);
  if(type==='imports.lgd')return lgdImport.nodeApplyDriverFactory(options);
  if(type==='exports.lgd')return lgdExport.nodeApplyDriverFactory(options);
  if(type==='trees.from_table')return tableTree.nodeApplyDriverFactory(options);
  if(type==='trees.to_json')return treeJson.nodeApplyDriverFactory(options);
  if(type==='transform.ungroup_data')return ungroup.nodeApplyDriverFactory(options);
  if(type==='trees.from_json')return jsonTree.nodeApplyDriverFactory(options);
  if(type==='trees.to_table')return treeTable.nodeApplyDriverFactory(options);
  if(type==='preprocessing.coarse_classes')return coarseClasses.nodeApplyDriverFactory(options);
  if(type==='preprocessing.binning')return binning.nodeApplyDriverFactory(options);
  if(type==='preprocessing.smoothing')return smoothing.nodeApplyDriverFactory(options);
  if(type==='preprocessing.sampling')return sampling.nodeApplyDriverFactory(options);
  if(type==='preprocessing.data_partition')return partition.nodeApplyDriverFactory(options);
  if(type==='preprocessing.elim_outlier')return elimOutlier.nodeApplyDriverFactory(options);
  if(type==='datamining.log_regression')return logregression.nodeApplyDriverFactory(options);
  if(type==='datamining.lin_regression')return linregression.nodeApplyDriverFactory(options);
  if(type==='research.factor_analysis')return factorAnalysis.nodeApplyDriverFactory(options);
  if(type==='research.auto_correlation')return autoCorrelation.nodeApplyDriverFactory(options);
  if(type==='research.corr_analysis')return correlation.nodeApplyDriverFactory(options);
  if(type==='datamining.assn_rules')return assnRules.nodeApplyDriverFactory(options);
  if(type==='datamining.clustering')return clustering.nodeApplyDriverFactory(options);
  if(type==='preprocessing.data_recovery')return missingValues.nodeApplyDriverFactory(options);
  if(type==='exports.excel')return excelExport.nodeApplyDriverFactory(options);
  if(type==='exports.text')return exports.nodeApplyDriverFactory(options);
  if(type==='transform.collapse_columns')return collapse.nodeApplyDriverFactory(options);
  if(type==='transform.sliding_window')return slidingWindow.nodeApplyDriverFactory(options);
  if(type==='transform.date_time')return dateTime.nodeApplyDriverFactory(options);
  if(type==='research.duplicates')return duplicates.nodeApplyDriverFactory(options);
  if(type==='transform.enrich_data')return enrich.nodeApplyDriverFactory(options);
  if(type==='transform.col_union_data')return colUnion.nodeApplyDriverFactory(options);
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
   return javascript.nodeApplyDriverFactory(options);
  }
  throw Error('No candidate driver for '+type);
  })();
  return {...drivers,mapPorts:async(mappings,ctx)=>{
   const requested=mappings.filter(m=>m.kind!==undefined);if(!requested.length)return drivers.mapPorts(mappings,ctx);
   options.operation.deadline=ctx.deadline;
   const channel=createNodeProcedure({operation:options.operation,execute:options.execute,record:options.onRecord,now:options.now,maxSteps:512,
    targetOrigin:config.targetOrigin,targetBuild:config.targetBuild,signal:ctx.signal,preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
    wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...options.receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
   const variable_mappings=[];for(const mapping of requested){const value=await channel.mapVariablePort(mapping);variable_mappings.push({...value.mapping,node:ctx.node,source_identity_verified:true,independent_readback:value.independent_readback});}
   const result=await drivers.mapPorts(mappings.filter(m=>m.kind===undefined),ctx);
   return {...result,effect_possible:true,variable_mappings};
  },verifySource:async(...args)=>{
   const checked=await verifyDeferredTextImportSources(options.operation.parameters,options.nodeHistory?.(),options.resolveStorageSource);
   const value=await drivers.verifySource(...args);
   return checked.length?{...value,switched_sources:checked}:value;
  },readOutput:async(...args)=>{
   let value=await drivers.readOutput(...args);
   const [read,ctx]=args;
   if(type!=='variables.user'&&read.variable_ports?.length){
    options.operation.deadline=ctx.deadline;
    const execution=options.operation.nodeApply?.phases.findLast(p=>p.phase==='execute')?.value;
    if(execution?.verified!==true||execution.owner_verified!==true||execution.status!=='completed'||execution.execution_id!==ctx.execution.execution_id)throw Error('Variable output requires the accepted completed execution receipt');
    const channel=createNodeProcedure({operation:options.operation,execute:options.execute,record:options.onRecord,now:options.now,maxSteps:512,
     targetOrigin:config.targetOrigin,targetBuild:config.targetBuild,signal:ctx.signal,
     preparedNodeContext:{document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node},
     wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{...options.receiptOptions(r.id,r.action_key,r.signature),operation_id:r.id})});
    const variable_ports=[];
    for(const port of read.variable_ports){const result=await channel.readVariablePort({port,execution});variable_ports.push(result.output);}
    value={...value,variable_ports,no_output_requested:false};
   }

   return read.variable_ports?.length||readOnly||['integration.rest_request','transform.join_data','programming.javascript'].includes(type)
    ||value.ports?.some(port=>port.freshness_basis==='completed_execution_port_source')?nodeOutputForJournal(value,redactor):value;
  }};
 }};
}
