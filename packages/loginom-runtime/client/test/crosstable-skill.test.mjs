import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NODE_TYPES} from '../lib/node-contracts.mjs';

test('CrossTable guidance retains accepted provenance, refresh and mixed-key rules',async()=>{
 const reference=await readFile(new URL('../../../product/skills/loginom-automation/references/nodes/transform.cross_table.md',import.meta.url),'utf8');
 const text=reference.replace(/\s+/g,' ');
 for(const rule of ['Строка Variant не доказывает значение',
  'Непрерывные и дискретные ключи сочетаются в fixed и sliding',
  'source_operation_id последней успешной настройки с finish=execute',
  'перед следующим узлом или экспортом снова выполни и прочитай'])assert.ok(text.includes(rule),rule);
 assert.match(text,/loginom_dock_node_read/);
 assert.ok(Buffer.byteLength(reference)<=6000);
 assert.doesNotMatch(reference,/\$(?:[1-9][0-9]*|ARGUMENTS)\b/);
 assert.match(NODE_TYPES['transform.cross_table'].semantics,/optional NULL\/Other groups/);
});
