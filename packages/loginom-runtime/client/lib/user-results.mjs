import {nodeOutputPortSchema} from './node-result-schema.mjs';
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
export const userResultSchema = {
  type: 'object', required: ['result_version', 'operation_id'], additionalProperties: false,
  properties: {
    result_version: { type: 'string', const: 'user-v1' }, operation_id: { type: 'string', minLength: 1 },
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
  // Delivery jobs carry their byte-verified destination in outcome directly.
  if (!node && outcome) Object.assign(output, outcome);
  return {
    result_version: 'user-v1', ...pick(result, ['operation_id', 'attempt', 'state', 'cancel_requested', 'server_stop_requested']),
    ...(result.state === 'running' ? { progress: result.progress } : {}),
    ...pick(outcome, ['status', 'action_key', 'phase', 'effect_possible', 'cleanup_complete']),
    ...pick(node, ['node', 'execution', 'package_saved', 'configuration']), output,
    error: result.error ?? outcome?.error ?? null,
    limitations: node?.warnings ?? [],
  };
}

export function compactActionResult(result) {
  // Keep continuation references and observed UI controls: removing these would
  // force another observation, or tempt clients to reuse stale references.
  const copy = structuredClone(result);
  delete copy.trace;
  if (copy.status === 'SUCCEEDED' && ['package.save_as', 'package.save_checkpoint'].includes(copy.action_key)) {
    copy.output = pick(copy.output, ['package_ref', 'reopened', 'workflow_preserved', 'save_completed', 'persisted_content_verified', 'workflow_continuations']);
    if (copy.output.workflow_continuations) copy.output.workflow_continuations = copy.output.workflow_continuations.map(item => pick(item, ['document_id', 'workflow_ref']));
  }
  return { ...copy, result_version: 'user-v1' };
}

export const userWorkflowInstructions = `Используй закреплённые описания операций и локальный кеш знаний всю сессию.
Построй граф и параметры по заданию. Доступные обработчики и режимы перечислены
в knowledge.node_types; профиль ограничен Loginom 7.4.2.
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
В dock_node_apply/resume передавай workflow_ref только как {workflow_id}, используя
выданные document_id и workflow_id. Длинный путь навигации клиент хранит локально;
не копируй и не восстанавливай tab_tid, prefix, navigation_path в запросе узла.
В компактном ответе configuration.readback содержит наблюдённые настройки и
привязку к узлу и квитанциям; сравни их с задачей. Выборка output.ports сохраняет
запрошенные строки в пределах бюджета операции. Для проверки этих же настроек
не открывай мастер повторно; сохранение подтверждай отдельной квитанцией пакета.
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
      'candidate_apply_tool', 'configuration_handler', 'parameter_schema', 'modes', 'limitations'])),
  };
}
