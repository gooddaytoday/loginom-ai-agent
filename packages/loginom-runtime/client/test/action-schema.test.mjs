import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJsonSchema, validateActionParameters, assertActionOutcome } from '../lib/action-catalog.mjs';

test('definition schemas reject unsupported and misplaced keywords instead of ignoring them', () => {
  for (const schema of [
    { type: 'string', minimum: 1 }, { type: 'number', minLength: 1 },
    { type: 'boolean', items: { type: 'string' } }, { type: 'array', items: { type: 'string' }, maxLength: 3 },
    { type: 'string', default: 'x' }, { type: 'string', oneOf: [] }, { type: 'string', $ref: '#/x' },
    { type: 'string', enum: false }, { type: 'string', enum: [1] },
    { type: 'string', enum: ['a', 'a'] }, { type: 'number', enum: [Infinity] },
    { type: 'integer', enum: [1.5] }, { type: 'string', minLength: -1 },
    { type: 'string', maxLength: 1.5 }, { type: 'number', minimum: '1' },
    { type: 'number', minimum: 2, maximum: 1 }, { type: 'string', pattern: 0 },
    { type: 'array', items: { type: 'string', unknown: true } },
  ]) assert.throws(() => validateJsonSchema(schema), /Invalid Dock action catalog/);
});

test('every supported primitive bound is applied to actual input values', () => {
  const schema = { type: 'object', additionalProperties: false, required: ['names', 'count'], properties: {
    names: { type: 'array', items: { type: 'string', minLength: 2, maxLength: 4, pattern: '^a' } },
    count: { type: 'integer', minimum: 1, maximum: 3, enum: [1, 3] },
  } };
  validateJsonSchema(schema);
  validateActionParameters(schema, { names: ['abcd'], count: 3 });
  for (const value of [{ names: ['a'], count: 1 }, { names: ['abcde'], count: 1 },
    { names: ['bb'], count: 1 }, { names: ['ab'], count: 2 }, { names: ['ab'], count: 4 },
    { names: ['ab'], count: 0 }, { names: ['ab'], count: 1.5 }, { names: ['ab'] },
    { names: ['ab'], count: 1, extra: true }]) assert.throws(() => validateActionParameters(schema, value));
});

test('inherited names cannot bypass additionalProperties or required validation', () => {
  const schema = { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string' } } };
  validateJsonSchema(schema);
  assert.throws(() => validateActionParameters(schema, Object.create({ name: 'inherited' })), /missing name/);
  for (const key of ['constructor', '__proto__', 'toString']) {
    const input = JSON.parse(JSON.stringify({ name: 'valid', [key]: 'unexpected' }));
    assert.throws(() => validateActionParameters(schema, input), /unknown field/);
  }
});

test('a status label alone, malformed output or goal claim is not an action receipt', () => {
  const receipt = { status: 'SUCCEEDED', action_key: 'ui.act', action_revision: '1',
    operation_id: 'gesture-1', phase: 'verified', effect_possible: true, output: {}, error: null, trace: [] };
  assertActionOutcome(receipt);
  for (const change of [
    { output: [] }, { phase: null }, { effect_possible: 'yes' }, { action_key: '' },
    { error: { code: 'FAILED', message: 'contradictory success' } },
    { output: { goal_verified: true } }, { goal_verified: true },
  ]) assert.throws(() => assertActionOutcome({ ...receipt, ...change }), /invalid typed outcome/);
  assert.throws(() => assertActionOutcome({ status: 'SUCCEEDED', trace: [] }), /invalid typed outcome/);
  // Opening then cancelling a dialog can perform UI gestures without applying
  // the requested domain effect; NOT_APPLIED does not imply zero UI activity.
  assertActionOutcome({ ...receipt, status: 'NOT_APPLIED', phase: 'reconciling' });
});
