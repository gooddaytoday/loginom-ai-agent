import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-public-lost-reply-live.mjs --case lost-apply-execute-code --config PRIVATE --profile NEW --browser ABS --evidence NEW --package OWN_SAVED\nOrdinary headed; controlled public apply reply loss after Execute/inspect same worker/Stop/NEW same-node repair; no Save. Browser receipts remain real.');
else {
  if(index<0||args.lastIndexOf('--case')!==index||args[index+1]!=='lost-apply-execute-code')throw Error('Fixed public lost reply case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence','--package'].includes(arg)))
    throw Error('Only assigned public lost reply paths permitted');
  await runJavascriptOperator(paths,{coldReader:true,existingLifecycle:'code',publicLostReplyCaseId:'lost-apply-execute-code'});
}
