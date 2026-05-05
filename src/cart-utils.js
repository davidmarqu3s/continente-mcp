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
