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

test('unknown payload is not an empty basket', () => {
  assert.equal(summarizeCartState({basket: {}, resources:{customerAuthenticated:true}}).error, 'cart_shape_unknown');
  assert.equal(summarizeCartState(null).error, 'cart_shape_unknown');
});

test('only an explicit item collection confirms an empty basket', () => {
  const state = summarizeCartState({basket:{itemsSortedByBrand:[]},resources:{customerAuthenticated:true}});
  assert.equal(state.error, undefined);
  assert.deepEqual(state.items, []);
});

test('malformed basket groups and items are not silently dropped', () => {
  for (const basket of [{itemsSortedByBrand:[{}]}, {itemsSortedByBrand:[{items:[{}]}]}]) {
    assert.equal(summarizeCartState({basket,resources:{customerAuthenticated:true}}).error,'cart_shape_unknown');
  }
});

test('unknown monetary amounts are not reported as free products', () => {
  const state = summarizeCartState({cart:{items:[{id:'123',productName:'Milk',quantity:2}]},resources:{customerAuthenticated:true}});
  assert.equal(state.items[0].price, null);
  assert.equal(state.total, null);
});
