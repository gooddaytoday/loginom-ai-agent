import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-public-stop-live.mjs --case stop-code --config PRIVATE --profile NEW --browser ABS --evidence NEW --package OWN_SAVED\nOrdinary headed; fixed 45s finite loop/native Stop and NEW same-node short repair; no Save.');
else {
  if(index<0||args.lastIndexOf('--case')!==index||args[index+1]!=='stop-code')throw Error('Fixed public Stop case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence','--package'].includes(arg)))
    throw Error('Only assigned public Stop paths permitted');
  await runJavascriptOperator(paths,{coldReader:true,existingLifecycle:'code',publicStopCaseId:'stop-code'});
}
