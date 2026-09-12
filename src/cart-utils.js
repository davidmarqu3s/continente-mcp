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

  const conversion = Number(measureOptions.primaryToSecondary || measureOptions.unitConversionRate);
  const hasAlternativeUnit = measureOptions.hasAlternativeSaleUnit || measureOptions.hasConversionRate;
  const cartQuantity = hasAlternativeUnit && conversion > 0 ? quantity * conversion : quantity;

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
