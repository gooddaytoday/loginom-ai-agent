import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
if(!process.env.CAPTURE_RUNTIME_ROOT)throw Error('EXPLICIT_CAPTURE_RUNTIME_ROOT_REQUIRED');
export const runtimeImport=name=>import(pathToFileURL(resolve(process.env.CAPTURE_RUNTIME_ROOT,'client/lib',name)));
