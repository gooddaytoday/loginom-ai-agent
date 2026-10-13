export function decodePreReadyRejection(value) {
  if(value?.kind==='Error'){const error=new Error(value.message,'cause' in value?{cause:decodePreReadyRejection(value.cause)}:undefined);error.name=value.name;return error}
  return value?.is_undefined?undefined:value?.value;
}
