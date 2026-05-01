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

Call `search_products` with the item name. Results are automatically ranked by the favourites list — the top result is usually correct. Note the top 3.

**2. Cross-check favourites**

Call `get_favorites` once (reuse for all items in this request). If any favourite matches the item name, prefer it — even if not the top search result. A favourite is a stronger signal than search rank.

**3. Fallback: order history**

Only call `get_order_history` if the result is genuinely uncertain (e.g. several near-identical variants with different sizes/brands and no favourites match). Scan recent orders to break the tie.

**4. Pick**

If confidence is high (clear favourite or obvious top result), add silently and report afterwards. If genuinely ambiguous between two equally plausible products, show the top 2 and ask the user to pick.

## Adding to cart

Call `add_to_cart` with `product_id`. Default quantity is 1 unless specified (e.g. "2 pacotes de leite").

## Output format

After all items are processed, print a compact summary:

```
✓ Queijo Flamengo Mil Vacas 400g — added (from favourites)
✓ Leite Mimosa Meio-Gordo 1L — added
✗ Pão de Forma — unclear match, please check manually
```

## Error handling

- No search results → report as not found, skip, continue with others
- `add_to_cart` fails → report the error, move on
- Never stop the whole run because one item failed

## Performance

`get_favorites` is slow. Call it once and reuse across all items. Only call `get_order_history` when favourites give no clear signal.
