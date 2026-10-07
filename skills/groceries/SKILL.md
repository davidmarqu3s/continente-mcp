---
name: groceries
description: Adds items to the Continente online shopping basket. Use this skill whenever the user says /groceries, wants to add something to their Continente cart, mentions shopping for groceries, or asks to "add X to the basket/cart". Also trigger for multi-item lists like "add milk, cheese and eggs to Continente". Works by matching item names against the user's favourites and order history before searching, so the right product variant gets added.
---

# Groceries Skill

Add one or more items to the Continente shopping basket using the `continente-mcp` tools. Match against the user's purchase history to pick the right product variant.

## Input parsing

Items may come in various formats:
- Single item: `add queijo flamengo to the cart`
- Comma-separated: `/groceries leite, ovos, pão de forma`
- Natural language: `I need some iogurte and manteiga from Continente`

Parse all items before starting. If the input is ambiguous, ask to clarify.

## Matching strategy (per item)

The goal is to pick the product the user actually buys, not just any product with that name.

**1. Search with favourites context**

Call `search_products` with the item name. Favourites are ranked first and marked ⭐ — the top result is usually correct. Note the top 3.

**2. Prefer favourites**

If any result is marked ⭐, prefer it — even if it is not the top result. A favourite is a stronger signal than search rank. If nothing is marked and the user seems to have favourites, call `refresh_favorites` once and search again.

**3. Fallback: order history**

Only call `get_order_history` if the result is genuinely uncertain (e.g. several near-identical variants with different sizes/brands and no favourites match). Scan recent orders to break the tie.

**4. Pick**

If confidence is high (clear favourite or obvious top result), add silently and report afterwards. If genuinely ambiguous between two equally plausible products, show the top 2 and ask the user to pick.

## Adding to cart

Call `add_to_cart` with `product_id`. Default quantity is 1 unless specified (e.g. "2 pacotes de leite").

`add_to_cart` and `update_cart_item` both check the basket afterwards and only report success when it holds the requested quantity. Products sold by weight (e.g. bananas) are counted in units, like on the website.

- `below_minimum_quantity` — the product has a minimum (the error says what it is). Nothing was added; ask whether to add the minimum.
- `cart_add_not_confirmed` or `cart_quantity_not_confirmed` — the change may still have happened. Call `get_cart`, never repeat `add_to_cart`, and correct with `update_cart_item` if needed.

## Output format

After all items are processed, print a compact summary:

```
✓ Queijo Flamengo Mil Vacas 400g — added (from favourites)
✓ Leite Mimosa Meio-Gordo 1L — added
✓ Banana Continente — quantity set to 12
✗ Pão de Forma — unclear match, please check manually
```

## Error handling

- No search results → report as not found, skip, continue with others
- `add_to_cart` fails → handle the errors above, otherwise report the error and move on
- Never stop the whole run because one item failed

## Performance

`get_order_history` opens each order and is slow. Only call it when search and favourites give no clear signal.
