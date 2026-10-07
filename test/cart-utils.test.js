import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCartProductId, parseOrderQuantity, quantityForCartUpdate, tallyMostBought } from '../src/cart-utils.js';

test('normalizes search result product ids to cart pids', () => {
  assert.equal(normalizeCartProductId('banana-continente-continente-2597619'), '2597619');
  assert.equal(normalizeCartProductId('2597619'), '2597619');
  assert.equal(normalizeCartProductId('8157021-master'), '8157021');
});

test('keeps unit products as direct quantities', () => {
  const options = {
    hasConversionRate: false,
    stepQuantity: 1,
    primaryunit: 'un',
    secondaryunit: 'un'
  };

  assert.equal(quantityForCartUpdate(3, options), '3');
});

test('keeps unit products priced per kg as direct quantities', () => {
  // Live cart metadata for an ordinary unit product: kg is only the price reference unit.
  const options = {
    hasConversionRate: false,
    hasAlternativeSaleUnit: false,
    unitConversionRate: 0,
    minOrderQuantity: 1,
    stepQuantity: 1,
    primaryunit: 'un',
    secondaryunit: 'kg',
    selectedunit: 'primary',
    maxNumberOfUnitsPerSale: 99
  };

  assert.equal(quantityForCartUpdate(2, options), '2');
});

test('converts alternative unit products to primary quantity', () => {
  const options = {
    hasConversionRate: true,
    hasAlternativeSaleUnit: true,
    primaryToSecondary: 0.2,
    stepQuantity: 0.2,
    primaryunit: 'kg',
    secondaryunit: 'un'
  };

  assert.equal(quantityForCartUpdate(12, options), '2.4');
});

test('rejects quantities below the product minimum, except removal', () => {
  const options = { hasAlternativeSaleUnit: true, primaryToSecondary: 0.2, minOrderQuantity: 0.6, primaryunit: 'kg', secondaryunit: 'un' };
  assert.throws(() => quantityForCartUpdate(2, options), /below_minimum_quantity: the minimum is 3/);
  assert.equal(quantityForCartUpdate(3, options), '0.6');
  assert.equal(quantityForCartUpdate(0, options), '0');
});

test('order quantities keep decimals and units', () => {
  assert.deepEqual(parseOrderQuantity('12 un'), { qty: 12, unit: 'un' });
  assert.deepEqual(parseOrderQuantity('1.2 kg'), { qty: 1.2, unit: 'kg' });
  assert.deepEqual(parseOrderQuantity('1,5 kg'), { qty: 1.5, unit: 'kg' });
  assert.deepEqual(parseOrderQuantity('3'), { qty: 3, unit: 'un' });
});

test('most bought keeps units and weights apart and counts each order once', () => {
  const result = tallyMostBought([
    [{ name: 'Banana', qty: 12, unit: 'un' }, { name: 'Milk', qty: 6, unit: 'un' }],
    [{ name: 'Banana', qty: 1.2, unit: 'kg' }, { name: 'Banana', qty: 0.4, unit: 'kg' }],
    [{ name: 'Milk', qty: 2, unit: 'un' }, { name: 'Banana', qty: 8, unit: 'un' }],
  ]);
  assert.deepEqual(result[0], { name: 'Banana', quantities: { un: 20, kg: 1.6 }, orders: 3 });
  assert.deepEqual(result[1], { name: 'Milk', quantities: { un: 8 }, orders: 2 });
});
