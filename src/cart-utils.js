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
  const customerAuthenticated = Boolean(payload?.resources?.customerAuthenticated);
  const addItems = Array.isArray(payload?.cart?.items) ? payload.cart.items : null;
  const miniCartGroups = Array.isArray(payload?.basket?.itemsSortedByBrand)
    ? payload.basket.itemsSortedByBrand
    : null;

  const sourceItems = addItems || (miniCartGroups
    ? miniCartGroups.flatMap(group => Array.isArray(group?.items) ? group.items : [])
    : []);

  const items = sourceItems.map(item => ({
    id: normalizeCartProductId(item.id),
    name: item.productName,
    qty: Number(item.secondaryQuantity ?? item.quantity ?? 1),
    price: Number(item?.price?.sales?.value ?? item?.priceTotal?.basePriceValue ?? 0)
  }));

  const total = Number(
    payload?.cart?.totalProductsValueNumber ??
    payload?.basket?.totals?.productsTotalPriceOnly ??
    payload?.basket?.totals?.productsTotalPriceOnlyWithSDR ??
    0
  );

  return {
    customerAuthenticated,
    items,
    total: Number.isFinite(total) ? total : 0
  };
}
