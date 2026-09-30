import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-public-required-live.mjs --case required-code|required-declared --config PRIVATE --profile NEW --browser ABS --evidence NEW --package OWN_SAVED\nOrdinary headed; required native source fields, manual label/autosync false, unsupported public mapping edit refusal, public source edit and full output; no Save.');
else {
  if(index<0||args.lastIndexOf('--case')!==index||!['required-code','required-declared'].includes(args[index+1]))
    throw Error('Fixed public required case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence','--package'].includes(arg)))
    throw Error('Only assigned public required paths permitted');
  await runJavascriptOperator(paths,{coldReader:true,existingLifecycle:args[index+1].slice('required-'.length),publicRequiredCaseId:args[index+1]});
}
