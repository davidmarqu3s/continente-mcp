import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCartProductId, quantityForCartUpdate } from '../src/cart-utils.js';

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
