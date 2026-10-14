export type UnionInvocation = {guard():void; invoke():Promise<unknown>; facts():{deadline:number;budget_ms:number;pending:boolean;failed:boolean;first?:{value:unknown};secondary:unknown[];nativeAuthority:false;creationAuthority:false;releaseAuthority:false}}
export function retainUnionInvocation(source:object):UnionInvocation|undefined
export function originalUnionInvocation(packet:object,owner:object):Readonly<{purpose:string;owner:object;generation:number;request:unknown;operation:string;signature:string;signal:AbortSignal;deadline:number;callId:string;session:string;message:string;userMessage:string}>
export function registerUnionInvocationCarrier(owner:object):void
export function bindUnionInvocationProcessor(processor:object,message:object):void
