// Exact default kinds observed by the owned Loginom 7.4.2 column editor.
// Non-default kinds are readable, but the v1 writer cannot select them.
export const JAVASCRIPT_DECLARED_COLUMN_LIMIT=64;
export const JAVASCRIPT_DECLARED_TYPES=Object.freeze({
  boolean:Object.freeze({value:1,label:'Логический',kind:'Дискретный'}),
  datetime:Object.freeze({value:2,label:'Дата/Время',kind:'Непрерывный'}),
  real:Object.freeze({value:3,label:'Вещественный',kind:'Непрерывный'}),
  integer:Object.freeze({value:4,label:'Целый',kind:'Непрерывный'}),
  string:Object.freeze({value:5,label:'Строковый',kind:'Дискретный'}),
});
