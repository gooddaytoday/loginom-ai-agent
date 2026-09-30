const types={boolean:1,datetime:2,real:3,integer:4,string:5};
const kinds={'Неопределенное':0,'Непрерывный':1,'Дискретный':2};
const usages={'Не задано':0,'Активное':3,'Выходное':4,'Группа':6,'Показатель':7,'Транзакция':8,'Элемент':9};
const need=(value,message)=>{if(!value)throw Error(message);};

// Compare complete observed native declarations, never infer them from the JS
// output. DefaultUsageType is the editor's setting; UsageType remains separate.
export function readJavascriptDeclaredColumns(schema,columns) {
  need(schema?.verified===true&&schema.inventory_complete===true
    &&schema.form==='JavaScriptColumnsWizard'&&schema.generation?.checked===false
    &&typeof schema.page_tid==='string'&&Array.isArray(schema.grids)
    &&Array.isArray(columns)&&columns.length>0&&columns.length<=64,
  'JavaScript declared schema observation incomplete');
  const targets=schema.grids.filter(grid=>grid.tid===schema.page_tid+';grdTargetColumns;tbl');
  need(targets.length===1&&targets[0].count===columns.length&&targets[0].total===columns.length
    &&Array.isArray(targets[0].fields)&&targets[0].fields.length===columns.length,
  'JavaScript declared schema coverage differs');
  const fields=targets[0].fields;
  need(new Set(fields.map(field=>field.record_id)).size===fields.length
    &&new Set(columns.map(column=>column.name?.toLowerCase())).size===columns.length,
  'JavaScript declared column identity differs');
  return fields.map((field,index)=>{
    const expected=columns[index];
    need(Object.keys(expected).length===5
      &&['name','label','type','data_kind','usage'].every(key=>Object.hasOwn(expected,key))
      &&typeof expected.name==='string'&&typeof expected.label==='string'
      &&Object.hasOwn(types,expected.type)&&Object.hasOwn(kinds,expected.data_kind)
      &&Object.hasOwn(usages,expected.usage),
    'JavaScript declared column parameters unavailable');
    need(typeof field.record_id==='string'&&field.record_id.length>0
      &&field.Index===index&&field.Name===expected.name&&field.DisplayName===expected.label
      &&field.DataType===types[expected.type]&&field.DataKind===kinds[expected.data_kind]
      &&field.DefaultUsageType===usages[expected.usage]&&Number.isInteger(field.UsageType)
      &&typeof field.Required==='boolean'&&field.Broken===false,
    'JavaScript declared column readback differs at '+index);
    return {index,name:field.Name,label:field.DisplayName,type:expected.type,
      data_kind:expected.data_kind,usage:expected.usage,usage_type:field.UsageType,
      default_usage_type:field.DefaultUsageType,required:field.Required};
  });
}

// Existing-node preservation derives declarations only from the complete native
// editor cache. It never guesses columns or roles from JavaScript source.
export function readObservedJavascriptDeclaredColumns(schema) {
  need(schema?.verified===true&&schema.inventory_complete===true
    &&schema.generation?.checked===false&&typeof schema.page_tid==='string'
    &&Array.isArray(schema.grids),'JavaScript existing declared schema unavailable');
  const targets=schema.grids.filter(grid=>grid.tid===schema.page_tid+';grdTargetColumns;tbl');
  need(targets.length===1&&Array.isArray(targets[0].fields)
    &&targets[0].fields.length>0&&targets[0].fields.length<=64,
  'JavaScript existing declared columns unavailable');
  return readJavascriptDeclaredColumns(schema,targets[0].fields.map(field=>({
    name:field.Name,label:field.DisplayName,
    type:Object.keys(types).find(key=>types[key]===field.DataType),
    data_kind:Object.keys(kinds).find(key=>kinds[key]===field.DataKind),
    usage:Object.keys(usages).find(key=>usages[key]===field.DefaultUsageType)
  })));
}
