const params = new URLSearchParams(window.location.search);
const code = params.get("code");

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function main() {
  if (!code) {
    showLanding();
    return;
  }
  showLoading();
  try {
    const off = await fetchOpenFoodFacts(code);
    if (!off || off.status === 0) {
      showNotFound(off?.status_verbose);
      return;
    }
    const product = off.product;
    const analysis = analyzeProduct(product);
    const nutrition = mergeNutrition(product.nutriments || {}, null); // USDA fills in async below
    render(product, code, analysis, nutrition);

    // Everything below is a slower, best-effort secondary call — the page
    // is already usable with just Open Food Facts data by this point.
    fetchRecalls(product.brands).then(renderRecalls).catch(() => renderRecalls([]));

    if (USDA_API_KEY) {
      fetchUSDA(code).then((usda) => {
        const merged = mergeNutrition(product.nutriments || {}, usda);
        if (merged.usedUsda) renderNutrition(merged);
      }).catch(() => {});
    }

    fetchSwaps(product, code).then(renderSwaps).catch(() => renderSwaps([]));
  } catch (err) {
    showError(err);
  }
}

async function fetchOpenFoodFacts(barcode) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
  if (!res.ok) throw new Error(`Open Food Facts request failed (${res.status})`);
  return res.json();
}

// Best-effort only: the FDA's food enforcement (recall) database has no
// UPC/barcode field, so matching happens by brand name text search against
// free-text recall records. A miss here does NOT mean "no recalls exist" —
// it means the name didn't match. This is surfaced honestly in the UI.
async function fetchRecalls(brands) {
  if (!brands) return [];
  const firstBrand = brands.split(",")[0].trim();
  if (!firstBrand) return [];
  const query = encodeURIComponent(`recalling_firm:"${firstBrand}"`);
  try {
    const res = await fetch(`https://api.fda.gov/food/enforcement.json?search=${query}&limit=5&sort=recall_initiation_date:desc`);
    if (res.status === 404) return []; // openFDA returns 404 for "no matches" — not an error
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

// Standard USDA nutrient numbers (stable across their datasets, unlike the
// internal numeric nutrientId). Sodium is converted to salt (g) to match
// Open Food Facts' units: salt = sodium(mg) * 2.5 / 1000.
const USDA_NUTRIENT_NUMBERS = {
  energy: "208", fat: "204", satFat: "606", carbs: "205",
  sugars: "269", fiber: "291", protein: "203", sodium: "307"
};

// USDA's Branded Foods dataset carries real gtinUpc values, but barcode
// digit-count/leading-zero conventions differ between UPC-A and EAN-13, so
// results are normalized (leading zeros stripped) before matching rather
// than trusting the first search hit — a mismatch here would show the wrong
// product's nutrition data, which is worse than showing none.
async function fetchUSDA(barcode) {
  if (!USDA_API_KEY) return null;
  const normalize = (s) => String(s || "").replace(/^0+/, "");
  try {
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(USDA_API_KEY)}&query=${encodeURIComponent(barcode)}&dataType=Branded&pageSize=5`);
    if (!res.ok) return null;
    const data = await res.json();
    const match = (data.foods || []).find((f) => normalize(f.gtinUpc) === normalize(barcode));
    if (!match) return null;

    const byNumber = {};
    for (const n of match.foodNutrients || []) {
      byNumber[n.nutrientNumber] = n.value;
    }
    const out = {};
    for (const [key, num] of Object.entries(USDA_NUTRIENT_NUMBERS)) {
      if (byNumber[num] !== undefined) out[key] = byNumber[num];
    }
    if (out.sodium !== undefined) {
      out.salt = Math.round((out.sodium * 2.5 / 1000) * 10) / 10;
    }
    return out;
  } catch {
    return null;
  }
}

// Prefer Open Food Facts (usually mirrors the actual product label
// directly). Only backfill from USDA when OFF's field is missing/empty —
// and tag which rows came from USDA so the source stays transparent.
function mergeNutrition(offNutriments, usda) {
  const fields = [
    ["energy", "energy-kcal_100g", "kcal"],
    ["fat", "fat_100g", "g"],
    ["satFat", "saturated-fat_100g", "g"],
    ["carbs", "carbohydrates_100g", "g"],
    ["sugars", "sugars_100g", "g"],
    ["fiber", "fiber_100g", "g"],
    ["protein", "proteins_100g", "g"],
    ["salt", "salt_100g", "g"]
  ];
  const round1 = (v) => Math.round(v * 10) / 10;
  let usedUsda = false;
  const rows = fields.map(([key, offKey, unit]) => {
    const offVal = offNutriments[offKey];
    if (offVal !== undefined && offVal !== null && offVal !== "") {
      return { key, value: round1(offVal), unit, source: "off" };
    }
    if (usda && usda[key] !== undefined) {
      usedUsda = true;
      return { key, value: round1(usda[key]), unit, source: "usda" };
    }
    return { key, value: null, unit, source: null };
  });
  return { rows, usedUsda };
}

const GRADE_RANK = { a: 0, b: 1, c: 2, d: 3, e: 4 };

// Swap suggestions only make sense when Open Food Facts has a category to
// search within, and only when the scanned product isn't already top-tier —
// showing "better options" next to an A-rated product is just noise.
//
// The grade filter is deliberately NOT sent as a query param — OFF's
// categories_tags field mixes valid English tags with mislabeled French
// ones (confirmed via testing, e.g. Nutella's last tag is "en:Pâtes à
// tartiner"), and the exact filterable field name/syntax for grade
// combined with a category filter couldn't be confirmed against live
// docs. Category-only search is verified reliable, so grade comparison
// happens client-side instead on the fields already returned.
async function fetchSwaps(product, currentCode) {
  const grade = product.nutriscore_grade;
  if (grade === "a") return [];
  const currentRank = GRADE_RANK[grade] ?? 5;

  // Most-specific VALID English category tag — not just the last array
  // entry, which can be a mislabeled non-English duplicate.
  const tags = product.categories_tags || [];
  const category = [...tags].reverse().find((t) => /^en:[a-z0-9-]+$/.test(t));
  if (!category) return [];

  try {
    const url = `https://world.openfoodfacts.org/api/v2/search?categories_tags=${encodeURIComponent(category)}&fields=code,product_name,brands,nutriscore_grade,image_small_url&page_size=20&sort_by=nutriscore_score`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.products || [])
      .filter((p) => p.code !== currentCode && p.product_name && (GRADE_RANK[p.nutriscore_grade] ?? 5) < currentRank)
      .slice(0, 3);
  } catch {
    return [];
  }
}

function analyzeProduct(product) {
  const additiveTags = product.additives_tags || [];
  const ingredientsText = (product.ingredients_text || "").toLowerCase();

  const hits = [];
  for (const tag of additiveTags) {
    if (ADDITIVES[tag]) {
      hits.push({ ...ADDITIVES[tag], source: "additive" });
    }
  }
  for (const oil of SEED_OILS) {
    if (ingredientsText.includes(oil)) {
      hits.push({
        name: oil.replace(/\b\w/g, (c) => c.toUpperCase()),
        tier: "caution",
        why: "Seed oil; high omega-6 content and heavily industrially refined.",
        source: "seed-oil"
      });
    }
  }

  // De-dupe (carrageenan appears as both en:carrageenan and en:e407)
  const seen = new Set();
  const deduped = hits.filter((h) => {
    const key = h.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const avoidCount = deduped.filter((h) => h.tier === "avoid").length;
  const cautionCount = deduped.filter((h) => h.tier === "caution").length;

  return { hits: deduped, avoidCount, cautionCount };
}

function scoreRing(grade) {
  const map = {
    a: { color: "#30d158", display: "A", offset: "0" },
    b: { color: "#a6d608", display: "B", offset: "20" },
    c: { color: "#ffd60a", display: "C", offset: "40" },
    d: { color: "#ff9f0a", display: "D", offset: "60" },
    e: { color: "#ff453a", display: "E", offset: "80" }
  };
  return map[grade] || { color: "#8e8e93", display: "?", offset: "100" };
}

function ringHTML(label, ring, detail) {
  return `
    <details class="ring-card">
      <summary>
        <div class="ring-svg">
          <svg viewBox="0 0 44 44">
            <circle class="ring-track" cx="22" cy="22" r="16"/>
            <circle class="ring-fill" cx="22" cy="22" r="16" stroke="${ring.color}" stroke-dasharray="100" style="--offset:${ring.offset}"/>
          </svg>
          <div class="ring-letter">${ring.display}</div>
        </div>
        <div class="ring-name">${label}</div>
        <div class="ring-status">Tap for info</div>
      </summary>
      <div class="ring-detail">${detail}</div>
    </details>`;
}

function render(product, barcode, analysis, nutrition) {
  const name = product.product_name || "Unknown product";
  const brands = product.brands || "";
  const quantity = product.quantity || "";
  const subtitle = [brands, quantity].filter(Boolean).join(" – ");
  const image = product.image_small_url || product.image_url || "";
  const ingredients = product.ingredients_text || "No ingredient data available.";

  const nutriRing = scoreRing(product.nutriscore_grade);
  const novaMap = { 1: { color: "#30d158", display: "1", offset: "0" }, 2: { color: "#a6d608", display: "2", offset: "25" }, 3: { color: "#ff9f0a", display: "3", offset: "50" }, 4: { color: "#ff453a", display: "4", offset: "75" } };
  const novaRing = novaMap[product.nova_group] || { color: "#8e8e93", display: "?", offset: "100" };
  const ecoRing = scoreRing(product.ecoscore_grade);

  const worst = analysis.avoidCount > 0 ? "bad" : (analysis.cautionCount > 0 ? "warn" : "ok");
  const verdict = {
    ok: { title: "Looks Clean", sub: "No flagged ingredients detected", icon: checkIcon("#052e16") },
    warn: { title: "Minor Concerns", sub: `${analysis.cautionCount} ingredient(s) worth knowing about`, icon: warnIcon("#3d2e00") },
    bad: { title: "Flagged Ingredients", sub: `${analysis.avoidCount} higher-concern ingredient(s) found`, icon: warnIcon("#450a0a") }
  }[worst];

  const hitsHTML = analysis.hits.length
    ? analysis.hits.map((h) => `
        <details class="hit-card ${h.tier}">
          <summary><span class="dot"></span>${escapeHtml(h.name)}</summary>
          <div class="hit-why">${escapeHtml(h.why)}</div>
        </details>`).join("")
    : `<span class="chip clean">None detected</span>`;

  $("#app").innerHTML = `
    <div class="hero">
      <div class="hero-art">${image ? `<img src="${image}" onerror="this.style.display='none'">` : ""}</div>
      <div class="hero-title">${escapeHtml(name)}</div>
      <div class="hero-sub">${escapeHtml(subtitle)}</div>
      <div class="barcode-chip">${escapeHtml(barcode)}</div>
    </div>

    <div class="verdict ${worst}">
      <div class="verdict-icon">${verdict.icon}</div>
      <div class="verdict-body">
        <div class="verdict-title">${verdict.title}</div>
        <div class="verdict-sub">${verdict.sub}</div>
      </div>
    </div>

    <input type="radio" name="tab" id="tab-overview" checked>
    <input type="radio" name="tab" id="tab-nutrition">
    <input type="radio" name="tab" id="tab-ingredients">
    <input type="radio" name="tab" id="tab-recalls">
    <div class="segmented">
      <label for="tab-overview">Overview</label>
      <label for="tab-nutrition">Nutrition</label>
      <label for="tab-ingredients">Ingredients</label>
      <label for="tab-recalls">Recalls</label>
    </div>

    <div class="panels">
      <div class="panel panel-overview">
        <div class="rings">
          ${ringHTML("Nutri-Score", nutriRing, "Rates overall nutritional quality A (best) to E (worst). Not computed when Open Food Facts has no category for a product.")}
          ${ringHTML("Nova Group", novaRing, "Rates how processed a food is, 1 (whole food) to 4 (ultra-processed). Not computed when Open Food Facts has no category for a product.")}
          ${ringHTML("Eco-Score", ecoRing, "Rates environmental impact A (best) to E (worst). Not computed when origin, packaging, or label data is missing.")}
        </div>
        <div class="section-title">Flagged Ingredients</div>
        <div class="info-card"><div class="chips">${hitsHTML}</div></div>
        <div id="swaps-section"></div>
      </div>

      <div class="panel panel-nutrition">
        <div class="section-title">Per 100g</div>
        <div class="nutri-card" id="nutri-card">${nutritionRowsHTML(nutrition.rows)}</div>
      </div>

      <div class="panel panel-ingredients">
        <div class="section-title">Full List</div>
        <div class="info-card"><div class="ingredients-text">${escapeHtml(ingredients)}</div></div>
      </div>

      <div class="panel panel-recalls" id="recalls-panel">
        <div class="section-title">FDA Recall Search</div>
        <div class="info-card">
          <div class="recall-loading">Searching by brand name…</div>
        </div>
        <div class="recall-disclaimer">Best-effort match by brand name only — the FDA recall database has no barcode index, so a miss here doesn't guarantee the product has never been recalled.</div>
      </div>
    </div>

    <div class="footer">Data via Open Food Facts, FDA openFDA &amp; USDA FoodData Central<br>Not medical advice</div>
  `;
}

function renderRecalls(results) {
  const panel = $("#recalls-panel");
  if (!panel) return;
  const card = panel.querySelector(".info-card");
  if (!results.length) {
    card.innerHTML = `<span class="chip clean">No matching recalls found</span>`;
    return;
  }
  card.innerHTML = results.map((r) => `
    <details class="hit-card avoid">
      <summary><span class="dot"></span>${escapeHtml(r.product_description || "Recalled product")}</summary>
      <div class="hit-why">
        <strong>${escapeHtml(r.classification || "")}</strong> — ${escapeHtml(r.reason_for_recall || "No reason given")}<br>
        <span class="recall-meta">${escapeHtml(r.recalling_firm || "")} · ${escapeHtml(r.recall_initiation_date || "")}</span>
      </div>
    </details>`).join("");
}

function renderSwaps(swaps) {
  const section = $("#swaps-section");
  if (!section) return;
  if (!swaps.length) {
    section.innerHTML = "";
    return;
  }
  section.innerHTML = `
    <div class="section-title">Better Options Nearby</div>
    <div class="swap-row">
      ${swaps.map((p) => `
        <a class="swap-card" href="?code=${encodeURIComponent(p.code)}">
          <div class="swap-art">${p.image_small_url ? `<img src="${p.image_small_url}" onerror="this.style.display='none'">` : ""}</div>
          <div class="swap-grade" style="background:${scoreRing(p.nutriscore_grade).color}">${scoreRing(p.nutriscore_grade).display}</div>
          <div class="swap-name">${escapeHtml(p.product_name)}</div>
        </a>
      `).join("")}
    </div>`;
}

function renderNutrition(nutrition) {
  const card = $("#nutri-card");
  if (!card) return;
  card.innerHTML = nutritionRowsHTML(nutrition.rows);
}

function nutritionRowsHTML(rows) {
  const labels = { energy: "Energy", fat: "Fat", satFat: "Sat. Fat", carbs: "Carbs", sugars: "Sugars", fiber: "Fiber", protein: "Protein", salt: "Salt" };
  return rows.map((r) => `
    <div class="nutri-row">
      <span class="k">${labels[r.key]}</span>
      <span class="v">${r.value === null ? "-" : r.value + " " + r.unit}${r.source === "usda" ? ' <span class="usda-tag">USDA</span>' : ""}</span>
    </div>
  `).join("");
}

function checkIcon(stroke) {
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function warnIcon(stroke) {
  return `<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l10 18H2L12 3z" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5M12 17h.01" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function showLoading() {
  $("#app").innerHTML = `
    <div class="loading">
      <div class="scan-box">
        <svg viewBox="0 0 120 80" class="barcode-svg">
          <rect x="8" y="8" width="4" height="64" fill="#fff"/>
          <rect x="16" y="8" width="2" height="64" fill="#fff"/>
          <rect x="22" y="8" width="6" height="64" fill="#fff"/>
          <rect x="32" y="8" width="2" height="64" fill="#fff"/>
          <rect x="38" y="8" width="4" height="64" fill="#fff"/>
          <rect x="46" y="8" width="2" height="64" fill="#fff"/>
          <rect x="52" y="8" width="6" height="64" fill="#fff"/>
          <rect x="62" y="8" width="4" height="64" fill="#fff"/>
          <rect x="70" y="8" width="2" height="64" fill="#fff"/>
          <rect x="76" y="8" width="6" height="64" fill="#fff"/>
          <rect x="86" y="8" width="2" height="64" fill="#fff"/>
          <rect x="92" y="8" width="4" height="64" fill="#fff"/>
          <rect x="100" y="8" width="2" height="64" fill="#fff"/>
          <rect x="106" y="8" width="6" height="64" fill="#fff"/>
        </svg>
        <div class="scan-line"></div>
      </div>
      <div class="loading-text">Looking up product…</div>
    </div>`;
}

function showLanding() {
  $("#app").innerHTML = `
    <div class="loading">
      <div class="loading-text">Scan a barcode from the Food Scanner shortcut to see results here.</div>
    </div>`;
}

function showNotFound(reason) {
  $("#app").innerHTML = `
    <div class="loading">
      <div class="loading-text">Product not found${reason ? ": " + escapeHtml(reason) : ""}.</div>
    </div>`;
}

function showError(err) {
  $("#app").innerHTML = `
    <div class="loading">
      <div class="loading-text">Something went wrong: ${escapeHtml(err.message || String(err))}</div>
    </div>`;
}

main();
