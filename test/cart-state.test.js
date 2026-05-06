import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeCartState } from '../src/cart-utils.js';

test('summarizes add-to-cart payloads into a consistent cart state', () => {
  const state = summarizeCartState({
    cart: {
      items: [
        {
          id: '8167238',
          productName: 'Manteiga de Amendoim Cremosa Continente Equilibrio',
          quantity: 2,
          secondaryQuantity: 2,
          price: { sales: { value: 2.49 } }
        }
      ],
      totalProductsValueNumber: 13.75
    },
    resources: {
      customerAuthenticated: false
    }
  });

  assert.equal(state.customerAuthenticated, false);
  assert.equal(state.total, 13.75);
  assert.deepEqual(state.items, [
    {
      id: '8167238',
      name: 'Manteiga de Amendoim Cremosa Continente Equilibrio',
      qty: 2,
      price: 2.49
    }
  ]);
});

test('summarizes minicart payloads into a consistent cart state', () => {
  const state = summarizeCartState({
    basket: {
      itemsSortedByBrand: [
        {
          items: [
            {
              id: '8167238',
              productName: 'Manteiga de Amendoim Cremosa Continente Equilibrio',
              secondaryQuantity: 2,
              price: { sales: { value: 2.49 } }
            },
            {
              id: '7127340',
              productName: 'Saco Reciclado Continente',
              secondaryQuantity: 6,
              price: { sales: { value: 0.10 } }
            }
          ]
        }
      ],
      totals: {
        productsTotalPriceOnly: 13.75
      }
    },
    resources: {
      customerAuthenticated: false
    }
  });

  assert.equal(state.customerAuthenticated, false);
  assert.equal(state.total, 13.75);
  assert.deepEqual(state.items, [
    {
      id: '8167238',
      name: 'Manteiga de Amendoim Cremosa Continente Equilibrio',
      qty: 2,
      price: 2.49
    },
    {
      id: '7127340',
      name: 'Saco Reciclado Continente',
      qty: 6,
      price: 0.10
    }
  ]);
});
