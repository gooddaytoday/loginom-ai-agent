import {createHash} from 'node:crypto';

// This is a versioned, inert knowledge asset. A future JavaScript handler may
// publish it only after checking the observed Loginom build before any effect.
const knowledge=Object.freeze({
  version:'1.0.0',
  validated_for:Object.freeze({
    loginom_build:'7.4.2',
    server_os:'Linux',
    server_os_evidence:'owned Session.Version.IsWindows=false',
    source_prompt_sha256:'c9c2d44d4dc4cf34b8f21a98504cf9f6acfc70cac510c36fe2725e7c0d7c2d16',
    proof_scope:'headed Ubuntu discovery; exact examples only, not full autonomous acceptance',
  }),
  sources:Object.freeze({
    original_prompt:'docs/node-development/nodes/programming-javascript/references/js_node_loginom_system_prompt.md',
    observed_profile:'docs/node-development/nodes/programming-javascript/engine-profile.json',
    official_help:Object.freeze([
      'https://help.loginom.ru/userguide/processors/programming/java-script/index.html',
      'https://help.loginom.ru/userguide/processors/programming/java-script/input-tables.html',
      'https://help.loginom.ru/userguide/processors/programming/java-script/output-tables.html',
      'https://help.loginom.ru/userguide/processors/programming/java-script/api-description.html',
    ]),
    official_help_build_scope:'online help is not pinned to build 7.4.2; executable examples are backed by the observed profile',
  }),
  limitations:Object.freeze([
    'Только Loginom 7.4.2 и табличный v1: другой наблюдённый build требует отказа до мутации.',
    'Импортировать Data статически из builtIn/Data; внешние модули, FS, Fetch и Calc не входят в этот контракт.',
    'Использовать лишь синтаксис и API, проверенные на данном build; отсутствие ошибки редактора не доказывает Execute.',
    'Для code-defined выходной таблицы вызвать AssignColumns до первого Append; declared-режим использует сохранённую схему.',
    'Технические имена и типы столбцов брать из свежего наблюдения; RowID в примерах — имя тестового входа, а не универсальное поле.',
    'Числа JavaScript имеют ограничения Number; для точного чтения больших Integer требуется отдельное подтверждение результата.',
    'Не полагаться на сохранение globals между запусками; читать фактический source, mappings, output и сохранённый пакет.',
  ]),
  scalar_data_api:Object.freeze({
    import:'import {InputTable,OutputTable,DataType} from "builtIn/Data";',
    input:'InputTable.RowCount и InputTable.Get(row, technicalName) читают наблюдённую входную таблицу.',
    output:'OutputTable.Append() добавляет строку; OutputTable.Set(technicalName, value) записывает в последнюю добавленную строку.',
    code_schema:'В schema_mode=code OutputTable.AssignColumns(...) задаёт типизированные столбцы до Append.',
    declared_schema:'В schema_mode=declared столбцы задаются в мастере до Execute; код не вызывает AssignColumns.',
  }),
  examples:Object.freeze([
    Object.freeze({
      id:'declared-table-v1',schema_mode:'declared',input_technical_name:'RowID',
      source_sha256:'816b086fe447eb42afbf87ac46b18b01153f731f3baf0de2bcd280da1104957f',
      source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\nfor (let row=0;row<InputTable.RowCount;row++) {\n    OutputTable.Append();\n    OutputTable.Set("ObservedID",InputTable.Get(row,"RowID"));\n    OutputTable.Set("PhaseMarker","JS_G2_TABLE_V1");\n}\n',
      scope:'Диагностический пример: объявить ObservedID Integer и PhaseMarker String в мастере; заменить RowID и marker под наблюдённые данные задачи.',
      evidence:'G2/G7 headed Ubuntu; шесть проверенных строк, clean Save и cold Execute для фиксированного пакета.',
    }),
    Object.freeze({
      id:'code-table-v1',schema_mode:'code',input_technical_name:'RowID',
      source_sha256:'d2af9d87e75042c5debf58475d92060b359d888fcfce51082c1e3e13e01efcb2',
      source:'import {InputTable,OutputTable,DataType} from "builtIn/Data";\nOutputTable.AssignColumns([{Name:"ObservedID",DataType:DataType.Integer},{Name:"PhaseMarker",DataType:DataType.String}]);\nfor (let row=0;row<InputTable.RowCount;row++) {\n    OutputTable.Append();\n    OutputTable.Set("ObservedID",InputTable.Get(row,"RowID"));\n    OutputTable.Set("PhaseMarker","JS_G2_TABLE_V1");\n}\n',
      scope:'Диагностический пример: заменить RowID, имена/типы выхода и marker под наблюдённые данные задачи.',
      evidence:'G2/G7 headed Ubuntu; шесть проверенных строк, clean Save и cold Execute для фиксированного пакета.',
    }),
  ]),
});

// Preserve the exact 1.0 asset and its two already accepted example identities.
// New guidance changes the default asset/cache identity without rewriting history.
const current=Object.freeze({...knowledge,version:'1.1.0',
  limitations:Object.freeze([...knowledge.limitations,
    'Для нового кода предпочитать ASCII Name; пользовательскую Unicode-метку задавать в DisplayName. После Execute брать фактические имена из schema/readback, не угадывать нормализацию.']),
  column_names:Object.freeze({
    method:'AssignColumns',
    evidence:'docs/node-development/nodes/programming-javascript/public-column-names-design.md',
    scope:'Five fixed headed public Code cases on Loginom7.4.2/Linux; observed code API, native mapping and physical schema.',
    name:'Техническое имя для доступа к столбцу; может отличаться от запрошенного Name.',
    display_name:'Пользовательская метка; в проверенном случае Сумма ё сохранена без изменения.',
    observed_pairs:Object.freeze([
      Object.freeze({requested_name:'Value',actual_name:'Value',display_name:'Value'}),
      Object.freeze({requested_name:'Сумма',actual_name:'Summa',display_name:'Value'}),
      Object.freeze({requested_name:'Value Total',actual_name:'Value_Total',display_name:'Value'}),
      Object.freeze({requested_name:'1Value',actual_name:'_1Value',display_name:'Value'}),
      Object.freeze({requested_name:'Value',actual_name:'Value',display_name:'Сумма ё'}),
    ]),
    normalization_algorithm_verified:false,
    add_column_verified:false,
    rule:'Это конкретные наблюдения, не общий алгоритм. Не переносить результат на AddColumn, пустые имена или коллизии без проверки.',
  }),
});

export const JAVASCRIPT_KNOWLEDGE_SHA256=createHash('sha256').update(JSON.stringify(current)).digest('hex');
export const JAVASCRIPT_CARD_LIMITATIONS=current.limitations;

export function describeJavascriptKnowledge(observedBuild,version=current.version) {
  if(observedBuild!==knowledge.validated_for.loginom_build)throw Error('JavaScript knowledge is not validated for observed Loginom build');
  const selected=version===knowledge.version?knowledge:version===current.version?current:null;
  if(!selected)throw Error('Unsupported JavaScript knowledge version');
  return structuredClone({...selected,knowledge_sha256:createHash('sha256').update(JSON.stringify(selected)).digest('hex')});
}
