// Fixed public existing source cases; only assigned paths and saved package.
import {runJavascriptOperator} from './javascript-live.mjs';
import {javascriptPublicSourceIds,javascriptPublicSourceCase} from './javascript-public-source-cases.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help')){
  console.log('node javascript-public-source-live.mjs --case '+javascriptPublicSourceIds.join('|')+' --config PRIVATE --profile NEW --browser ABS --evidence NEW --package OWN_SAVED\nOrdinary headed; fixed source only; no Save.');
}else{
  if(index<0||args.lastIndexOf('--case')!==index||!javascriptPublicSourceIds.includes(args[index+1]))throw Error('Fixed public source case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence','--package'].includes(arg)))throw Error('Only assigned public source paths permitted');
  await runJavascriptOperator(paths,{coldReader:true,existingLifecycle:javascriptPublicSourceCase(args[index+1]).schema_mode,
    publicSourceCaseId:args[index+1]});
}
