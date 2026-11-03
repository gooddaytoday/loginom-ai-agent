import {validateSequentialParameters} from './sampling-parameters.mjs';
export function validateDataPartitionParameters(p,mode,request){
 validateSequentialParameters(p,mode,request,['train_count','test_count','allocation_order']);
 for(const key of ['train_count','test_count'])if(p[key]!==undefined&&(!Number.isSafeInteger(p[key])||p[key]<0||p[key]>2147483647))throw Error(key+' must be a nonnegative row count');
 if(p.allocation_order!==undefined&&p.allocation_order!=='test_train_unused')throw Error('Unsupported sequential allocation order');
}
