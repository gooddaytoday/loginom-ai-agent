// Private headed entrypoint; root owns the fresh assigned profile and live run.
import {runJavascriptOperator} from './javascript-live.mjs';
import {javascriptBatchOrder,javascriptBatchCases} from './javascript-batch-plan.mjs';

const args=process.argv.slice(2);
if(args.includes('--help'))console.log('javascript-batch-live.mjs --config ABS --profile FRESH_ABS --browser ABS --evidence NEW_ABS [--cases '+javascriptBatchOrder.join(',')+']');
else {
  const index=args.indexOf('--cases');
  const cases=index<0?javascriptBatchOrder:javascriptBatchCases(args[index+1]?.split(','));
  if(index>=0)args.splice(index,2);
  await runJavascriptOperator(args,{batchCases:cases});
}
