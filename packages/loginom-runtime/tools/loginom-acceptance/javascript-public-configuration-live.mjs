import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-public-configuration-live.mjs --case configuration-code|configuration-declared --config PRIVATE --profile NEW --browser ABS --evidence NEW --package OWN_SAVED\nOrdinary headed; fixed general Done/Close, independent source/settings/graph, exact same-ID retry and two NEW preserve Execute/full6x4; no Save.');
else {
  if(index<0||args.lastIndexOf('--case')!==index||!['configuration-code','configuration-declared'].includes(args[index+1]))
    throw Error('Fixed public configuration case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence','--package'].includes(arg)))
    throw Error('Only assigned public configuration paths permitted');
  await runJavascriptOperator(paths,{coldReader:true,existingLifecycle:args[index+1].endsWith('-declared')?'declared':'code',
    publicConfigurationCaseId:args[index+1]});
}
