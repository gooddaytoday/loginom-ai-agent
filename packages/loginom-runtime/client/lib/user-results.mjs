import {nodeOutputPortSchema} from './node-result-schema.mjs';
import {budgetUserPreview} from './user-preview-budget.mjs';
import {calculatorPrecisionWarnings} from './calculator-precision-warning.mjs';
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
export const userResultSchema = {
  type: 'object', required: ['result_version', 'operation_id'], additionalProperties: false,
  properties: {
    result_version: { type: 'string', const: 'user-v1' }, operation_id: { type: ['string','null'], minLength: 1 },
    request_rejected: {type:'boolean'}, next_step: {type:'object'},
    attempt: { type: 'integer', minimum: 1 }, state: { type: 'string', enum: ['running', 'settled'] },
    status: { type: 'string', enum: ['SUCCEEDED', 'FAILED', 'AMBIGUOUS', 'NOT_APPLIED'] },
    action_key: { type: 'string' }, phase: { type: 'string' }, cancel_requested: { type: 'boolean' },
    server_stop_requested: { type: 'boolean' }, progress: { type: ['object', 'null'] },
    effect_possible: { type: 'boolean' }, cleanup_complete: { type: 'boolean' },
    node: { anyOf: [{ type: 'null' }, { type: 'object', required: ['document_id', 'workflow_id', 'node_id'], additionalProperties: false,
      properties: { document_id: { type: 'string' }, workflow_id: { type: 'string' }, node_id: { type: 'string' } } }] },
    configuration: { type: 'object' },
    execution: { type: ['object', 'null'] }, package_saved: { type: 'boolean' }, output: { type: 'object', properties:{ports:{type:'array',items:{type:'object',allOf:[{if:{anyOf:['exact_table','read_coverage','read_consistency','cell_precision','binding'].map(k=>({required:[k]}))},then:{...nodeOutputPortSchema,required:[...nodeOutputPortSchema.required,'exact_table','read_coverage','read_consistency','cell_precision','binding']}}]}}}, additionalProperties:true },
    error: { type: ['object', 'null'] }, limitations: { type: 'array', items: { type: 'string' } },
  },
};

export function compactNodeRequestFailure(outcome,request={}) {
  const pending=outcome.effect_possible===true;
  const requestedId=typeof request.operation_id==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(request.operation_id)?request.operation_id:null;
  const message=outcome.error?.message??'Request rejected';
  let path=/Invalid parameters\.([^:]+):/.exec(message)?.[1]??null;
  const unknown=/^Invalid parameters(?:\.[^:]+)?: unknown field ([A-Za-z_][A-Za-z_0-9]*)$/.exec(message)?.[1];
  if(unknown&&path)path+='.'+unknown;
  const operationId=outcome.operation_id??requestedId;
  const active=outcome.output?.active_node_job;
  if(active?.state==='running'&&typeof active.operation_id==='string')return {
    result_version:'user-v1',operation_id:active.operation_id,state:'running',
    action_key:'node.apply',phase:'request_rejected',request_rejected:true,
    effect_possible:true,cleanup_complete:false,error:{...outcome.error,parameter_path:path},
    output:{},limitations:[],
    next_step:{tool:'dock_node_wait',arguments:{operation_id:active.operation_id,timeout_ms:10000},
      rejected_operation_id:requestedId,
      instruction:'The original node operation is still running. Wait for this operation ID; the competing request did not start. Do not inspect or repeat browser mutations while it runs.'}};
  return {result_version:'user-v1',operation_id:operationId,state:'settled',
    status:pending?'AMBIGUOUS':'NOT_APPLIED',action_key:outcome.action_key,phase:'request_rejected',
    request_rejected:true,effect_possible:pending,cleanup_complete:!pending,
    error:{...outcome.error,parameter_path:path},output:{},limitations:[],
    next_step:pending?{tool:'dock_operation_inspect',arguments:{operation_id:outcome.operation_id},
      instruction:'Inspect the original operation before continuing; do not repeat a possible effect.'}:
      path?.startsWith('parameters.')&&typeof request.target?.type==='string'
        ?{tool:'dock_action_describe',arguments:{node_types:[request.target.type]},original_operation_id:requestedId,
          instruction:'Read the parameter_schema for this exact node type. Then correct the rejected parameters and submit dock_node_apply with a NEW operation_id. No browser recovery is required.'}
        :{tool:'dock_node_apply',original_operation_id:requestedId,
          instruction:'Correct the indicated request using its schema and submit it with a NEW operation_id. No browser recovery is required.'}};
}

export function compactNodeResult(result) {
  const outcome = result.outcome, node = outcome?.output, data = node?.output;
  const output = data ? pick(data, ['status', 'evidence_ref', 'execution_id', 'no_output_requested']) : {};
  if (data?.ports) output.ports = data.ports.map(port => {
    const value = pick(port, ['port', 'port_guid', 'fresh', 'execution_id', 'schema', 'row_count', 'sample', 'sample_rows', 'sample_complete', 'precision', 'table', 'exact_table', 'read_coverage', 'read_consistency', 'cell_precision', 'binding', 'limitations']);
    value.schema = value.schema.map(column => pick(column, ['index', 'name', 'label', 'type', 'data_kind']));
    value.sample = value.sample.map(row => row.map(cell => {
      const compact = pick(cell, ['type', 'value', 'decimal', 'representation', 'display_text', 'precision', 'is_null', 'timezone', 'cell_type', 'native']);
      if (compact.value === compact.display_text) delete compact.display_text;
      return compact;
    }));
    value.sample_rows = value.sample.length;
    value.sample_complete = port.sample_complete && value.sample.length === port.sample.length;
    return value;
  });
  if (data?.file_artifacts) output.file_artifacts = data.file_artifacts.map(file => pick(file, ['artifact_id', 'destination', 'bytes', 'sha256', 'execution_id', 'verification_id', 'freshness_basis']));
  if (data?.format_restoration) output.format_restoration = pick(data.format_restoration, ['restored', 'table']);
  if (data?.workflow_return) output.workflow_returned = data.workflow_return.verified === true;
  const limitations=[...(node?.warnings??[])];
  if(outcome?.status==='SUCCEEDED')limitations.push(...calculatorPrecisionWarnings(node));
  // Delivery jobs carry their byte-verified destination in outcome directly.
  if (!node && outcome) Object.assign(output, outcome);
  const next=outcome?.next_step??node?.next_step??(outcome&&['FAILED','AMBIGUOUS','NOT_APPLIED'].includes(outcome.status)&&!result.upload_operation_id
    ?outcome.effect_possible===false&&outcome.cleanup_complete===true
      ?{tool:'dock_node_apply',original_operation_id:result.operation_id,instruction:'Correct the request and submit with a NEW operation_id. No node mutation or browser recovery is required.'}
      :{tool:'dock_operation_inspect',arguments:{operation_id:result.operation_id},instruction:'Inspect the original operation; do not repeat an unresolved effect.'}
    :null);
  const reply={
    result_version: 'user-v1', ...pick(result, ['operation_id', 'attempt', 'state', 'cancel_requested', 'server_stop_requested']),
    ...(result.state === 'running' ? { progress: result.progress } : {}),
    ...pick(outcome, ['status', 'action_key', 'phase', 'effect_possible', 'cleanup_complete']),
    ...pick(node, ['node', 'execution', 'package_saved', 'configuration']), output,
    error: result.error ?? outcome?.error ?? null,
    limitations,
    ...(next?{next_step:next}:{}),
  };
  budgetUserPreview(reply);
  for(const port of output.ports??[])if(Number.isSafeInteger(port.row_count)&&port.sample_rows<port.row_count)
    limitations.push('Output port '+port.port+': only '+port.sample_rows+' of '+port.row_count+' rows returned. Do not report unseen rows or a complete ranking from this preview. Compute report statistics in nodes and request the needed output.');
  for(const port of output.ports??[])if(port.sample.length){
    const zeros=port.sample.reduce((count,row)=>count+row.filter(cell=>cell.is_null===false
      &&['integer','real'].includes(cell.type)&&((cell.value??cell.decimal)===0
        ||typeof (cell.value??cell.decimal)==='string'&&/^[+-]?0+(?:\.0*)?(?:[eE][+-]?\d+)?$/.test(cell.value??cell.decimal))).length,0);
    if(zeros)limitations.push('Output port '+port.port+': '+zeros+' returned numeric cells contain explicit zero, not NULL. This alone does not establish missing observations, future periods or censoring. Such interpretations require separate source metadata; do not infer them from the shape of zeros.');
    const names=port.schema.filter((_,i)=>port.sample.every(row=>row[i]?.is_null===true)).map(c=>c.name);
    if(names.length)limitations.push('Output port '+port.port+': every returned cell is NULL in '+JSON.stringify(names.slice(0,8))
      +(names.length>8?' (and '+(names.length-8)+' more fields)':'')+'. This describes only the '+port.sample.length
      +' returned rows. Check expression input types if these NULL values are unexpected; do not infer values for unread rows.');
  }
  return reply;
}

export function compactActionResult(result) {
  // Keep continuation references and observed UI controls: removing these would
  // force another observation, or tempt clients to reuse stale references.
  const copy = structuredClone(result);
  delete copy.trace;
  if (copy.status === 'SUCCEEDED' && ['package.save_as', 'package.save_checkpoint'].includes(copy.action_key)) {
    copy.output = pick(copy.output, ['package_ref', 'reopened', 'workflow_preserved', 'save_completed', 'persisted_content_verified', 'workflow_continuations']);
    copy.output.reporting_constraints = ['Сохранение подтверждает пакет, но не правильность итогового текста. Для каждого численного вывода используй прочитанное поле результата узла. Разности, изменения в п.п. и темпы роста тоже должны быть вычислены в узлах; не вычитай округлённые проценты. Если нужного показателя нет, вычисли его или не добавляй необязательное число.', 'Ноль и отсутствие наблюдения различаются. Не объявляй нули пропусками или будущими периодами без явного признака в исходных данных либо условия задания. Интерпретацию, не подтверждённую данными, обозначай как гипотезу.'];
    if (copy.output.workflow_continuations) copy.output.workflow_continuations = copy.output.workflow_continuations.map(item => pick(item, ['document_id', 'workflow_ref']));
  }
  return { ...copy, result_version: 'user-v1' };
}

export const userWorkflowInstructions = `Используй закреплённые описания операций и локальный кеш знаний всю сессию.
Для каждого поддержанного узла используй dock_node_apply. Он сам возвращается
из хранилища к нужному сценарию. Перед первым узлом данного типа запроси
dock_action_describe({node_types:[тип]}) и следуй его parameter_schema.
Не используй node.add для обхода ошибки параметров. Терминал, read_file и
execute_code недоступны; вложение передаётся через input_artifacts.
Координаты, mappings, read и budgets можно опустить. По умолчанию выходные поля
сохраняются, Execute читает обычную выборку; это не полный аудит таблицы.
У точных чисел значение может быть только в decimal; отсутствие дублирующего
value не означает NULL. Учитывай type, precision и is_null каждой ячейки.
Для отдельных переименований/исключений используй output mappings.changes;
Dock сохранит остальные поля. mappings.fields — полный список всех полей.
Оба способа одновременно запрещены; обязательные поля узла исключать нельзя.
У нового текстового импорта source_path можно опустить после успешной доставки:
Dock возьмёт точный путь по upload_operation_id. По умолчанию UTF-8, заголовок
в первой строке, пропуск0, разделитель запятая, десятичная точка, пустой NULL,
двойная кавычка; явные значения сохраняются. Типы и имена колонок задаёшь ты.
У нового текстового экспорта требуется destination в назначенной папке. Обычный
CSV по умолчанию: UTF-8, запятая, header=names, bom=false, LF, десятичная точка,
пустой NULL и двойная кавычка. Явный формат сохраняется; существующий узел
получает только заданные изменения. Перезапись существующего файла не включается
автоматически: для неё нужны overwrite=replace и явный destination.
Построй граф и параметры по заданию. Доступные обработчики и режимы перечислены
в knowledge.node_types; профиль ограничен Loginom 7.4.2.
Все новые числовые показатели отчёта вычисляй в узлах сценария и читай их выход.
Если показателя нет в выходе, добавь вычисление; не досчитывай средние, суммы или
проценты в тексте ответа по просмотренной таблице. Округление лишь оформляет результат.
Сначала выдели каждый требуемый результат из задания. Перед завершением сопоставь
каждый пункт с выполненным узлом и прочитанным результатом. Два разреза в одном
пункте требуют проверки обоих. Если пункт не выполнен, продолжи работу или явно
укажи конкретное ограничение; сохранённый пакет сам по себе не означает полноту анализа.
При LOGIN_REQUIRED войди в открытом браузере и повтори dock_prepare.
Используй выбранные storage_directories для пакетов, входных файлов и экспорта.
Прикреплённые пользователем файлы поступают в input_artifacts через native hook.
Если их нет, сообщи, что передача вложения не подтверждена; не придумывай путь
на сервере и не считай текстовый фрагмент из сообщения полным датасетом.
Если файл уже есть в input_artifacts, ошибка каталога или подготовки не означает
потерю вложения. Актуальный список доступен через dock_action_describe({}); новый
пакет для этого не требуется. При ARTIFACT_DESTINATION_UNAVAILABLE сопоставь
выбранную папку с вошедшим аккаунтом; повторное вложение не исправит доступ.
Загрузи input_artifacts через dock_artifact_deliver, сохрани подтверждённую identity
источника для импорта. Каждый node.apply сам проверяет настройки и выполнение.
Для dock_node_resume передавай только исходный operation_id; запрос хранится в Dock.
Для повторного чтения выхода без изменения вычислений используй dock_node_read
с новым operation_id, source_operation_id успешной локальной операции и read
(например, sample_rows:100, require_exact_numbers:true). Dock выполняет существующий
узел и читает свежий выход без мастера настройки; не передавай формулы, mappings и finish.
При running жди тот же ID через dock_node_wait.
Для исправления уже завершённого узла используй dock_node_apply с новым operation_id,
target.kind=existing, выданным target.ref и inputs:[] для сохранения связей.
Новый operation_id с target.kind=new создаёт ещё один узел.
В dock_node_apply передавай workflow_ref только как {workflow_id}, используя
выданные document_id и workflow_id. Длинный путь навигации клиент хранит локально;
не копируй и не восстанавливай tab_tid, prefix, navigation_path в запросе узла.
В компактном ответе configuration.readback содержит наблюдённые настройки и
привязку к узлу и квитанциям; сравни их с задачей. Выборка output.ports сохраняет
запрошенные строки в пределах бюджета операции. Для проверки этих же настроек
не открывай мастер повторно; сохранение подтверждай отдельной квитанцией пакета.
В итоговом отчёте используй только подтверждённые результаты выполненных узлов.
Если sample_complete=false, это часть таблицы: не дополняй её невидимыми строками,
другим концом рейтинга или предположениями из фрагмента CSV. Запрашивай нужный
разрез и объём результата через узлы. Общие суммы и средние тоже вычисляй узлом,
а не вручную из групповых средних; явно называй, по каким строкам рассчитан показатель.
Не выдавай причины отклонений и эффективность подразделений за установленный факт,
если данные показывают только суммы. Отделяй рекомендации от доказанных результатов.
Не повторяй уже подтверждённые проверки. При running жди тот же operation_id;
при неопределённом результате сначала восстанови его, не начинай заменяющую операцию.
Ошибку параметров исправляй по установленной схеме. Дополнительные знания ищи,
если имеющегося описания и наблюдённого состояния недостаточно.
Для обычного чтения задавай require_exact_numbers:false: отображение не доказывает
точность числа. Для проверки точных значений и конверсий задавай
require_exact_numbers:true; обработчик временно меняет формат и восстанавливает его.
Повторное выполнение Параметров полей без перенастройки: parameters:{changes:[]},
inputs:[], mappings:[]; поля выбираются по входным именам, даже после переименования.
Экспорт текста exports.text возвращает output.file_artifacts с размером и SHA-256
фактического файла после Execute; портов данных на выходе у него нет. Сверь
назначение и формат с заданием. Done и Close файл не подтверждают.
Сохрани готовый пакет в конце через package.save_checkpoint, дождись квитанции.
Если dock_saved_package_state сообщает modified:true, выполни его следующий шаг
сохранения того же собственного пакета с новым ID перед завершением. Не отбрасывай
изменения и не повторяй переоткрытие для устранения dirty-state.
Промежуточное сохранение — по просьбе пользователя или перед риском потери работы.
package.save_as с переоткрытием используй при запросе переоткрытия. package_saved:false
у узла описывает границы node.apply и не требует дополнительного сохранения.
Не приписывай данным валюту, если она не указана. Полные квитанции и диагностика
сохраняются локально; ограничения результата остаются обязательными для вывода.`;

export function compactKnowledgeBundle(description) {
  return {
    version: 'user-v1', session_manifest: description.session_manifest,
    actions: description.actions.map(action => pick(action, ['action_key', 'revision', 'description', 'input_schema', 'effect'])),
    node_types: description.node_types.map(node => pick(node, ['type', 'contract_revision', 'cache_key', 'candidate_node_apply_available',
      'candidate_apply_tool', 'configuration_handler', 'modes', 'limitations'])),
  };
}
