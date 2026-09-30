import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-public-context-live.mjs --case context-code|context-declared --config PRIVATE --profile NEW --browser ABS --evidence NEW --package OWN_SAVED\nOrdinary headed; fixed source/comment and label data, current public context before/after with exact retry and full business output; no Save.');
else{
  if(index<0||args.lastIndexOf('--case')!==index||!['context-code','context-declared'].includes(args[index+1]))
    throw Error('Fixed public context case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence','--package'].includes(arg)))
    throw Error('Only assigned public context paths permitted');
  await runJavascriptOperator(paths,{coldReader:true,existingLifecycle:args[index+1].slice('context-'.length),publicContextCaseId:args[index+1]});
}
