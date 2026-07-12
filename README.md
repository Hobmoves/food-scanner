# Food Scanner

Static site that turns a scanned barcode into a food-safety readout. Companion
to the "Food Scanner" iOS Shortcut, which scans a barcode and opens
`https://food.holben.net/?code=<barcode>` — this page does the rest.

## How it works

- Fetches product data from [Open Food Facts](https://world.openfoodfacts.org/) by barcode
- Flags concerning additives (artificial dyes, certain preservatives, artificial sweeteners) and seed oils, each with a short explanation — see `data.js`
- Best-effort recall search against the FDA's [openFDA Food Enforcement API](https://open.fda.gov/apis/food/enforcement/), matched by brand name (no barcode index exists in that dataset, so this is a name match, not a guarantee)
- Renders Nutri-Score / Nova / Eco-Score as tappable info rings, nutrition facts, and full ingredients

## Local dev

```
node server.js
```

Serves on `http://localhost:5185`. Visit `/?code=<any barcode>` to test.

## Deployment

Static site, no build step — deployed via GitHub Pages with a custom domain
(`CNAME` file points at `food.holben.net`).
