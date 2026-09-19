export const normalizeFavoriteId = value => String(value ?? '').replace(/\.html$/, '');

export function createQueue() {
  let tail = Promise.resolve();
  return operation => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
}

export function validateToolInput(name, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid arguments');
  if (['add_to_cart', 'update_cart_item'].includes(name)) {
    if (typeof args.product_id !== 'string' || args.product_id.length > 250 ||
      !/^(?:[a-zA-Z0-9]+-)*\d+(?:-master)?(?:\.html)?$/.test(args.product_id)) {
      throw new Error('Invalid product_id: expected a numeric PID or product slug ending in a numeric PID');
    }
    const quantity = args.quantity === undefined && name === 'add_to_cart' ? 1 : args.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 ||
      (name === 'add_to_cart' && quantity === 0)) {
      throw new Error(name === 'add_to_cart'
        ? 'Quantity must be finite and greater than zero'
        : 'Quantity must be finite and non-negative; zero removes the item');
    }
  }
  if (['search_products', 'get_order_history', 'get_most_bought'].includes(name) && args.limit !== undefined &&
    (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50)) {
    throw new Error('Limit must be an integer from 1 to 50');
  }
  if (name === 'search_products' &&
    (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 250 || /[\x00-\x1f\x7f]/.test(args.query))) {
    throw new Error('Query must be nonempty text, at most 250 characters, without control characters');
  }
  return args;
}

export async function retryAuthentication(operation, refresh, mutation = false) {
  const first = await operation();
  if (first?.error !== 'not_authenticated' || first.writeAttempted === true ||
    (mutation && first.writeAttempted !== false)) return first;
  if (!(await refresh())) return first;
  return operation();
}
