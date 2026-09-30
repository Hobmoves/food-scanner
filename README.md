# Food Scanner

Static site that turns a scanned barcode into a full food readout. Companion
to the "Food Scanner" iOS Shortcut, which scans a barcode and opens
`?code=<barcode>` on this page — the page does the rest.

## What you get per scan

- **Scan Score (0–100)** — our own blend of Nutri-Score (60 pts), NOVA
  processing level (20) and flagged ingredients (20), with the breakdown
  shown. Any high-concern ingredient caps it at 49. Organic adds 5.
- **Personal alerts** — pick allergens (13) and diets (vegan, vegetarian,
  palm-oil free) in the profile sheet; every scan checks against them.
  Stored on-device only (`localStorage`).
- **Watch list** — 80+ additives (dyes, preservatives, sweeteners,
  emulsifiers, phosphates, flour treatments…) plus text-matched ingredients
  (partially hydrogenated oil, BVO, HFCS, seed oils, palm oil, artificial
  flavor), each with a short explanation — see `data.js`.
- **The good** — high fiber/protein, low sugar/salt, no additives, labels
  like organic / non-GMO / fair trade.
- **Nutrition** — a real FDA-style Nutrition Facts label with %DV, per
  serving or per 100 g; UK traffic-light levels; sugar shown as cubes; a
  "why this Nutri-Score" breakdown; link to the photo of the actual label.
- **Ingredients** — the parsed list by weight with flagged items
  highlighted, allergens and traces, vegan/vegetarian/palm-oil check, every
  additive with its official name and function, and what made it NOVA 4.
- **Sourcing** — who owns the brand (e.g. Doritos → Frito-Lay → PepsiCo),
  Wikipedia summary, where it's made and sold, CO₂ footprint, packaging and
  recyclability, and crowdsourced prices.
- **Recalls** — openFDA searched two ways: the exact barcode inside recall
  product codes (flagged as a "Barcode match" and stamped on the product),
  and the brand/brand owner name.
- **Better swaps** — same category, better Nutri-Score or less processed.
- Recent scans list, share button, light/dark mode.

## Smarter barcode lookup

- Tries every spelling of the code: UPC-A ↔ EAN-13 (leading zero), GTIN-14,
  and UPC-E short codes expanded to UPC-A.
- Validates the check digit and tells you when a scan was likely misread.
- Falls back to Open Beauty Facts, Open Pet Food Facts and Open Products
  Facts for non-food barcodes.
- Retries on rate limits/timeouts; every secondary source fails soft.

## Data sources (all free, CORS-enabled, no backend)

| Source | Used for |
| --- | --- |
| [Open Food Facts](https://world.openfoodfacts.org/) (+ sister DBs) | Product, nutrition, ingredients, scores, additive taxonomy, swaps |
| [openFDA Food Enforcement](https://open.fda.gov/apis/food/enforcement/) | Recalls |
| [Open Prices](https://prices.openfoodfacts.org/) | Crowdsourced prices |
| [Wikidata](https://www.wikidata.org/) + [Wikipedia](https://en.wikipedia.org/) | Brand ownership chain and summary |
| [USDA FoodData Central](https://fdc.nal.usda.gov/) | Nutrition backfill (optional — set `USDA_API_KEY` in `config.js`) |

## Files

- `index.html` — shell
- `style.css` — design
- `data.js` — knowledge base (additives, ingredient patterns, allergens, daily values)
- `api.js` — all network calls + barcode normalization
- `analysis.js` — pure scoring/analysis (no DOM; loadable in Node)
- `app.js` — rendering, profile, history

## Deployment

Pure static site, no build step, no server — deployed via GitHub Pages. It
runs entirely on GitHub's infrastructure.

## Local dev

Any static file server works, e.g. `npx serve .` — nothing requires Node at
runtime. Visit `/?code=<any barcode>` to test (e.g. `?code=028400090896`).
