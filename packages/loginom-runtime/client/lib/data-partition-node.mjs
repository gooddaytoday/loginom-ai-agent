import {createSequentialNodeSupport} from './sampling-node.mjs';
import {validateDataPartitionParameters} from './data-partition-parameters.mjs';
import {dataPartitionParametersSchema} from './node-api.mjs';
export function createDataPartitionNodeSupport(config){return createSequentialNodeSupport(config,{type:'preprocessing.data_partition',validate:validateDataPartitionParameters,parameterSchema:dataPartitionParametersSchema});}
