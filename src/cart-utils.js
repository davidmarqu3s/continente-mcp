export function normalizeCartProductId(productId) {
  const value = String(productId || '').trim();
  if (!value) return value;

  const withoutHtml = value.replace(/\.html$/, '');
  const masterMatch = withoutHtml.match(/^(\d+)-master$/);
  if (masterMatch) return masterMatch[1];

  const numericTail = withoutHtml.match(/(\d+)$/);
  return numericTail ? numericTail[1] : withoutHtml;
}

export function quantityForCartUpdate(displayQuantity, measureOptions = {}) {
  const quantity = Number(displayQuantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Quantity must be a non-negative number');
  }

  const conversion = Number(measureOptions.primaryToSecondary ?? measureOptions.unitConversionRate);
  const hasAlternativeUnit = measureOptions.hasAlternativeSaleUnit || measureOptions.hasConversionRate;
  if ((hasAlternativeUnit && (!Number.isFinite(conversion) || conversion <= 0)) ||
    // Without an alternative sale unit, quantities are counted in the primary unit;
    // secondaryunit is only the price reference (e.g. €/kg for a unit product).
    (!hasAlternativeUnit && ((measureOptions.primaryunit && measureOptions.primaryunit !== 'un') ||
      (measureOptions.selectedunit && measureOptions.selectedunit !== 'primary')))) {
    throw new Error('quantity_semantics_unknown');
  }
  const cartQuantity = hasAlternativeUnit ? quantity * conversion : quantity;
  if (!Number.isFinite(cartQuantity)) throw new Error('quantity_semantics_unknown');

  return Number(cartQuantity.toFixed(3)).toString();
}

export function summarizeCartState(payload = {}) {
  const customerAuthenticated = payload?.resources?.customerAuthenticated === true;
  // The storefront uses {} when this session has not created a basket yet.
  // Require the known response envelope; arbitrary/malformed objects still fail.
  if (payload?.action === 'Cart-MiniCartShow' && payload.basket &&
    typeof payload.basket === 'object' && !Array.isArray(payload.basket) &&
    Object.keys(payload.basket).length === 0) {
    return { customerAuthenticated, items: [], total: 0 };
  }
  const addItems = Array.isArray(payload?.cart?.items) ? payload.cart.items : null;
  const miniCartGroups = Array.isArray(payload?.basket?.itemsSortedByBrand)
    ? payload.basket.itemsSortedByBrand
    : null;

  const unknown = { customerAuthenticated, error: 'cart_shape_unknown' };
  if (!addItems && !miniCartGroups) return unknown;
  if (!addItems && miniCartGroups.some(group => !Array.isArray(group?.items))) return unknown;

  const sourceItems = addItems || (miniCartGroups
    ? miniCartGroups.flatMap(group => Array.isArray(group?.items) ? group.items : [])
    : []);

  if (sourceItems.some(item => !item?.id || !item.productName ||
    !Number.isFinite(Number(item.secondaryQuantity ?? item.quantity)) ||
    Number(item.secondaryQuantity ?? item.quantity) < 0)) return unknown;

  const items = sourceItems.map(item => ({
    id: normalizeCartProductId(item.id),
    name: item.productName,
    qty: Number(item.secondaryQuantity ?? item.quantity ?? 1),
    price: moneyOrNull(item?.price?.sales?.value ?? item?.priceTotal?.basePriceValue)
  }));

  const total = moneyOrNull(
    payload?.cart?.totalProductsValueNumber ??
    payload?.basket?.totals?.productsTotalPriceOnly ??
    payload?.basket?.totals?.productsTotalPriceOnlyWithSDR
  );

  return {
    customerAuthenticated,
    items,
    total
  };
}

function moneyOrNull(value) {
  if (value == null || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

// Order lines show "12 un", or "1.2 kg" for products bought by weight.
export function parseOrderQuantity(text) {
  const match = String(text ?? '').trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)/);
  if (!match) return { qty: 1, unit: 'un' };
  return { qty: Number(match[1].replace(',', '.')), unit: match[2].toLowerCase() || 'un' };
}

// Units and weights cannot be added together, so totals are kept per unit.
// Sorted by how many orders include the product, then by units bought.
export function tallyMostBought(orders) {
  const tally = new Map();
  for (const products of orders) {
    const seenInOrder = new Set();
    for (const { name, qty, unit } of products) {
      const entry = tally.get(name) ?? { name, quantities: {}, orders: 0 };
      entry.quantities[unit] = Number(((entry.quantities[unit] ?? 0) + qty).toFixed(3));
      if (!seenInOrder.has(name)) { entry.orders += 1; seenInOrder.add(name); }
      tally.set(name, entry);
    }
  }
  return Array.from(tally.values())
    .sort((a, b) => b.orders - a.orders || (b.quantities.un ?? 0) - (a.quantities.un ?? 0));
}
