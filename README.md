# Food Scanner

Static site that turns a scanned barcode into a food-safety readout. Companion
to the "Food Scanner" iOS Shortcut, which scans a barcode and opens
`https://food.holben.net/?code=<barcode>` — this page does the rest.

## How it works

- Fetches product data from [Open Food Facts](https://world.openfoodfacts.org/) by barcode
- Flags concerning additives (artificial dyes, certain preservatives, artificial sweeteners) and seed oils, each with a short explanation — see `data.js`
- Best-effort recall search against the FDA's [openFDA Food Enforcement API](https://open.fda.gov/apis/food/enforcement/), matched by brand name (no barcode index exists in that dataset, so this is a name match, not a guarantee)
- Renders Nutri-Score / Nova / Eco-Score as tappable info rings, nutrition facts, and full ingredients

## Deployment

Pure static site (`index.html` + `style.css` + `app.js` + `data.js`), no build
step, no server — deployed via GitHub Pages with a custom domain (`CNAME`
file points at `food.holben.net`). Unlike `holben-net`, this runs entirely on
GitHub's infrastructure and stays up regardless of whether any local machine
is on.

## Local dev

Any static file server works, e.g. `npx serve .` or VS Code's Live Server —
nothing in this repo requires Node at runtime. Visit `/?code=<any barcode>`
to test.
