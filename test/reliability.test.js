import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQueue,
  retryAuthentication,
  validateToolInput
} from '../src/reliability.js';

test('serializes operations and keeps the queue alive after rejection', async () => {
  const queue = createQueue();
  const events = [];
  const first = queue(async () => { events.push('first'); throw new Error('expected'); });
  const second = queue(async () => { events.push('second'); return 2; });
  await assert.rejects(first, /expected/);
  assert.equal(await second, 2);
  assert.deepEqual(events, ['first', 'second']);
});

test('retries authentication once before a mutation is attempted', async () => {
  let attempts = 0;
  let refreshes = 0;
  const result = await retryAuthentication(async () => {
    attempts++;
    return attempts === 1 ? { error: 'not_authenticated', writeAttempted: false } : { success: true };
  }, async () => { refreshes++; return true; }, true);
  assert.deepEqual(result, { success: true });
  assert.equal(attempts, 2);
  assert.equal(refreshes, 1);
});

test('does not retry an uncertain mutation', async () => {
  let attempts = 0;
  let refreshes = 0;
  const result = await retryAuthentication(async () => {
    attempts++;
    return { error: 'unknown_outcome', writeAttempted: true };
  }, async () => { refreshes++; return true; }, true);
  assert.equal(result.error, 'unknown_outcome');
  assert.equal(attempts, 1);
  assert.equal(refreshes, 0);
});

test('rejects invalid quantities before browser IO', () => {
  assert.throws(() => validateToolInput('add_to_cart', { product_id: '123', quantity: 0 }), /greater than zero/);
  assert.throws(() => validateToolInput('update_cart_item', { product_id: '123', quantity: -1 }), /non-negative/);
});

test('enforces the advertised 50-item limit for all limited tools', () => {
  for (const name of ['search_products', 'get_order_history', 'get_most_bought']) {
    assert.doesNotThrow(() => validateToolInput(name, { query: 'milk', limit: 50 }));
    assert.throws(() => validateToolInput(name, { query: 'milk', limit: 51 }), /1 to 50/);
  }
});
