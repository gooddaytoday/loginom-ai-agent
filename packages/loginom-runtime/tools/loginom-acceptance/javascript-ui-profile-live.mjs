import {runJavascriptOperator} from './javascript-live.mjs';
const args=process.argv.slice(2),index=args.indexOf('--case');
if(args.includes('--help'))console.log('node javascript-ui-profile-live.mjs --case ui-code|ui-declared --config PRIVATE --profile NEW --browser ABS --evidence NEW --package OWN_SAVED\nOrdinary headed; two independent preserved source/settings openings, retained Columns/Code visible controls and cached engine identity. No helper, engine switch, Done, Save or explicit Execute.');
else{
  if(index<0||args.lastIndexOf('--case')!==index||!['ui-code','ui-declared'].includes(args[index+1]))
    throw Error('Fixed UI profile case required');
  const paths=args.filter((_,i)=>i!==index&&i!==index+1);
  if(paths.length!==10||paths.some((arg,i)=>i%2===0&&!['--config','--profile','--browser','--evidence','--package'].includes(arg)))
    throw Error('Only assigned UI profile paths permitted');
  await runJavascriptOperator(paths,{coldReader:true,uiProfileMode:args[index+1].slice(3)});
}
