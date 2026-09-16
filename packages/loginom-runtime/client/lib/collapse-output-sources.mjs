export function collapseOutputSources(configuration){
 const types=new Set((configuration.transposed??[]).map(f=>f.type));
 // Loginom 7.4.2 preserves the scalar schema for a homogeneous role list.
 // The generated native source must still match this expected schema exactly.
 const valueType=types.size===1?[...types][0]:'variant';
 return [...configuration.information.map(f=>({name:f.name,label:f.label,type:f.type,used:true})),
  {name:'Names',label:'Имена',type:'string',used:true},{name:'DisplayNames',label:'Метки',type:'string',used:true},
  {name:'Values',label:'Значения',type:valueType,used:true},{name:'DataTypes',label:'Типы данных',type:'integer',used:true}];
}
