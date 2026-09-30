// UI layer: routing, rendering, profile + history. Data fetching lives in
// api.js, pure analysis in analysis.js, the knowledge base in data.js.
//
// Entry point stays `?code=<barcode>` — that's what the iOS "Food Scanner"
// Shortcut opens after it scans a barcode.

const params = new URLSearchParams(window.location.search);
const code = (params.get("code") || "").trim();

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---------- Local storage (profile + history) ----------
// Wrapped because storage can throw (private mode, blocked site data); the
// app must work without it.

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
};

function loadProfile() {
  const p = store.get("fs.profile", {});
  const prefs = {};
  for (const pref of PREFERENCES) prefs[pref.id] = p.prefs?.[pref.id] ?? pref.default;
  return { allergens: p.allergens || [], diets: p.diets || [], prefs };
}

function saveProfile(profile) { store.set("fs.profile", profile); }

function loadHistory() { return store.get("fs.history", []); }

function pushHistory(entry) {
  const list = loadHistory().filter((h) => h.code !== entry.code);
  list.unshift({ ...entry, ts: Date.now() });
  store.set("fs.history", list.slice(0, 40));
}

// ---------- App state ----------

const state = {
  code,
  profile: loadProfile(),
  tab: "overview",
  basis: null,          // "serving" | "100g"
  lookup: null,
  product: null,
  isFood: true,
  usda: undefined,      // undefined = loading, null = none
  additiveInfo: {},
  recalls: undefined,
  prices: undefined,
  brand: undefined,
  swaps: undefined
};

// ---------- Boot ----------

async function main() {
  bindGlobalEvents();
  if (!code) {
    showLanding();
    return;
  }
  showLoading(code);
  try {
    const lookup = await lookupProduct(code);
    if (lookup.status !== "found") {
      showNotFound(lookup);
      return;
    }
    state.lookup = lookup;
    state.product = lookup.product;
    state.isFood = lookup.db.id === "food" && (!lookup.product.product_type || lookup.product.product_type === "food");
    renderProduct();
    saveToHistory();

    // Everything below is a secondary, best-effort call — the page is
    // already usable with Open Food Facts data at this point.
    const p = state.product;
    const variants = lookup.variants;

    fetchAdditiveInfo(p.additives_tags).then((info) => {
      state.additiveInfo = info;
      renderAdditives();
      renderNovaReasons();
    });

    fetchRecalls(p, variants).then((r) => { state.recalls = r; renderRecalls(); });
    fetchPrices(variants).then((r) => { state.prices = r; renderPrices(); });
    fetchBrandInfo(p).then((r) => { state.brand = r; renderBrand(); });

    if (state.isFood && typeof USDA_API_KEY !== "undefined" && USDA_API_KEY) {
      fetchUSDA(lookup.code).then((u) => {
        state.usda = u;
        if (u) renderProduct(); // backfill can change the score inputs, label and levels
      });
    } else {
      state.usda = null;
    }

    if (state.isFood && swapsApplicable(p)) {
      fetchSwaps(p, lookup.code).then((r) => { state.swaps = r; renderSwaps(); })
        .catch(() => { state.swaps = { status: "error", items: [] }; renderSwaps(); });
    } else {
      state.swaps = { status: "not-applicable", items: [] };
    }
  } catch (err) {
    showError(err);
  }
}

function saveToHistory() {
  const p = state.product;
  const d = derive();
  pushHistory({
    code: state.lookup.code,
    name: productName(p),
    brand: (p.brands || "").split(",")[0].trim(),
    image: p.image_front_small_url || p.image_small_url || p.image_front_url || "",
    score: d.score?.score ?? null,
    band: d.score?.band.id ?? null
  });
}

function productName(p) {
  return p.product_name || p.product_name_en || p.generic_name || p.generic_name_en || "Unknown product";
}

// Everything derived from product + profile + USDA, recomputed on demand
// (cheap) so profile changes and USDA backfill just re-render.
function derive() {
  const p = state.product;
  const analysis = analyzeProduct(p, state.profile.prefs);
  const nutrition = buildNutrition(p, state.usda || null);
  if (!state.basis) state.basis = nutrition.servingG || nutrition.values.energy.perServing !== null ? "serving" : "100g";
  return {
    analysis,
    nutrition,
    score: state.isFood ? scanScore(p, analysis) : null,
    alerts: profileAlerts(p, state.profile),
    positives: state.isFood ? positives(p, nutrition, analysis) : [],
    labels: goodLabels(p),
    levels: state.isFood ? nutrientLevels(p, nutrition) : [],
    sugar: state.isFood ? sugarTeaspoons(nutrition) : null,
    eco: ecoInfo(p)
  };
}

// ---------- Top bar ----------

function topBar({ share = false } = {}) {
  return `
    <header class="topbar">
      <a class="wordmark" href="./" aria-label="Food Scanner home">
        <span class="wm-box">FOOD</span><span class="wm-text">SCANNER</span>
      </a>
      <div class="topbar-actions">
        ${share ? `<button class="icon-btn" data-action="share" aria-label="Share">${icon("share")}</button>` : ""}
        <button class="icon-btn" data-action="profile" aria-label="Your profile">${icon("user")}${profileCount() ? `<span class="icon-badge">${profileCount()}</span>` : ""}</button>
      </div>
    </header>`;
}

function profileCount() {
  return state.profile.allergens.length + state.profile.diets.length;
}

// ---------- Product page ----------

function renderProduct() {
  const p = state.product;
  const d = derive();
  const name = productName(p);
  const brand = (p.brands || "").split(",")[0].trim();
  const subtitle = [brand, p.quantity].filter(Boolean).join(" · ");
  const image = p.image_front_url || p.image_url || p.image_small_url || "";

  const tabs = [
    ["overview", "Overview"],
    ...(state.isFood ? [["nutrition", "Nutrition"]] : []),
    ["ingredients", "Ingredients"],
    ["sourcing", "Sourcing"],
    ["recalls", "Recalls"]
  ];
  if (!tabs.some(([id]) => id === state.tab)) state.tab = "overview";

  const stamps = [];
  if (!state.isFood) stamps.push(`<span class="stamp stamp-ink">${escapeHtml(state.lookup.db.name.replace("Open ", "").replace(" Facts", ""))}</span>`);
  if (p.nova_group === 4) stamps.push(`<span class="stamp stamp-red">Ultra-processed</span>`);
  if (isOrganic(p)) stamps.push(`<span class="stamp stamp-green">Organic</span>`);

  $("#app").innerHTML = `
    ${topBar({ share: true })}

    <article class="ticket">
      <div class="ticket-art">
        ${image ? `<img src="${escapeHtml(image)}" alt="" onerror="this.remove()">` : `<div class="no-image">${icon("box")}<span>No photo yet</span></div>`}
        <div class="stamps" id="stamps">${stamps.join("")}</div>
      </div>
      <div class="perf"></div>
      <div class="ticket-body">
        <div class="kicker">${escapeHtml(state.lookup.db.name)}${state.lookup.code !== code.replace(/\D/g, "") ? ` · matched as ${escapeHtml(state.lookup.code)}` : ""}</div>
        <h1 class="title">${escapeHtml(name)}</h1>
        ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
        <div class="barcode-row">${barcodeSVG(state.lookup.code)}</div>
      </div>
    </article>

    ${scoreBlockHTML(d)}
    ${alertsHTML(d.alerts)}

    <nav class="tabs" role="tablist">
      ${tabs.map(([id, label]) => `
        <button class="tab ${state.tab === id ? "active" : ""}" role="tab" data-tab="${id}" aria-selected="${state.tab === id}">
          ${label}${id === "recalls" ? `<span class="tab-count" id="recall-count"></span>` : ""}
        </button>`).join("")}
    </nav>

    <section class="panel ${state.tab === "overview" ? "active" : ""}" data-panel="overview">${overviewHTML(d)}</section>
    ${state.isFood ? `<section class="panel ${state.tab === "nutrition" ? "active" : ""}" data-panel="nutrition">${nutritionPanelHTML(d)}</section>` : ""}
    <section class="panel ${state.tab === "ingredients" ? "active" : ""}" data-panel="ingredients">${ingredientsPanelHTML(d)}</section>
    <section class="panel ${state.tab === "sourcing" ? "active" : ""}" data-panel="sourcing">${sourcingPanelHTML(d)}</section>
    <section class="panel ${state.tab === "recalls" ? "active" : ""}" data-panel="recalls">
      <h2 class="h2">FDA recall check</h2>
      <div id="recalls-body"></div>
      <p class="fineprint">Searches openFDA's food enforcement reports two ways: for this exact barcode in the recall's product codes, and for the brand name. The database has no barcode index, so no match doesn't guarantee a product has never been recalled.</p>
    </section>

    ${footerHTML()}
  `;

  renderSwaps();
  renderRecalls();
  renderPrices();
  renderBrand();
  renderAdditives();
  renderNovaReasons();
}

// ---------- Score ----------

function scoreBlockHTML(d) {
  if (!state.isFood) {
    return `<div class="score-card band-none"><div class="score-empty">Not a food product, so there's no nutrition score. Ingredients and sourcing are below.</div></div>`;
  }
  const s = d.score;
  if (!s) {
    return `
      <div class="score-card band-none">
        <div class="dial" style="--pct:0"><div class="dial-inner"><span class="dial-num">?</span><span class="dial-of">/100</span></div></div>
        <div class="score-meta">
          <div class="score-band">Not enough data</div>
          <div class="score-note">Open Food Facts doesn't have a Nutri-Score or processing level for this product yet. Flagged ingredients are still checked below.</div>
          ${verdictLine(d)}
        </div>
      </div>`;
  }
  return `
    <div class="score-card band-${s.band.id}">
      <div class="dial" style="--pct:${s.score}">
        <div class="dial-inner"><span class="dial-num" data-count="${s.score}">${s.score}</span><span class="dial-of">/100</span></div>
      </div>
      <div class="score-meta">
        <div class="score-band">${s.band.label}</div>
        ${verdictLine(d)}
        <div class="score-parts">
          ${s.parts.map((p) => `
            <div class="part">
              <div class="part-top"><span>${p.label}</span><span class="mono">${p.points}/${p.max}</span></div>
              <div class="bar"><i style="width:${(p.points / p.max) * 100}%"></i></div>
              <div class="part-note">${escapeHtml(p.note)}</div>
            </div>`).join("")}
        </div>
      </div>
      <details class="score-how">
        <summary>How is this scored?</summary>
        <p>Our own blend, not an official rating: nutrition quality (Nutri-Score) is worth up to 60 points, processing level (NOVA) up to 20, and flagged ingredients up to 20 (minus 7 per high-concern and 2.5 per moderate-concern ingredient). Missing parts are left out and the rest rescaled. Organic adds 5.${s.capped ? " <strong>Capped at 49</strong> because it contains a high-concern ingredient." : " Any high-concern ingredient caps the score at 49."}${s.partial ? " <strong>Partial data:</strong> some parts are missing for this product." : ""}</p>
      </details>
    </div>`;
}

function verdictLine(d) {
  const a = d.analysis;
  if (a.avoidCount) return `<div class="verdict v-bad">${icon("alert")} ${a.avoidCount} high-concern ingredient${a.avoidCount > 1 ? "s" : ""}</div>`;
  if (a.cautionCount) return `<div class="verdict v-warn">${icon("alert")} ${a.cautionCount} ingredient${a.cautionCount > 1 ? "s" : ""} worth knowing about</div>`;
  const hasIngredients = !!(state.product.ingredients_text || state.product.ingredients_text_en);
  return hasIngredients
    ? `<div class="verdict v-ok">${icon("check")} No flagged ingredients</div>`
    : `<div class="verdict v-none">${icon("info")} No ingredient list available</div>`;
}

function alertsHTML(alerts) {
  if (!profileCount()) {
    return `<button class="profile-cta" data-action="profile">${icon("user")}<span><strong>Personalize it.</strong> Set allergens and diets to get warnings on every scan.</span>${icon("chev")}</button>`;
  }
  if (!alerts.length) {
    return `<div class="alerts"><span class="alert a-ok">${icon("check")} Nothing from your profile found</span></div>`;
  }
  return `<div class="alerts">${alerts.map((a) => `<span class="alert a-${a.level}">${icon(a.level === "ok" ? "check" : a.level === "info" ? "info" : "alert")} ${escapeHtml(a.text)}</span>`).join("")}</div>`;
}

// ---------- Overview ----------

const GRADE_COLORS = { a: "var(--ga)", b: "var(--gb)", c: "var(--gc)", d: "var(--gd)", e: "var(--ge)" };
const NOVA_COLORS = { 1: "var(--ga)", 2: "var(--gb)", 3: "var(--gd)", 4: "var(--ge)" };

function gradeTile(label, value, color, detail) {
  return `
    <details class="grade-tile">
      <summary>
        <span class="grade-letter" style="background:${color}">${escapeHtml(value)}</span>
        <span class="grade-label">${label}</span>
      </summary>
      <div class="grade-detail">${detail}</div>
    </details>`;
}

function overviewHTML(d) {
  const p = state.product;
  let html = "";

  if (state.isFood) {
    const ng = /^[a-e]$/.test(p.nutriscore_grade) ? p.nutriscore_grade : null;
    const eg = d.eco.grade;
    html += `
      <div class="grade-row">
        ${gradeTile("Nutri-Score", ng ? ng.toUpperCase() : "?", ng ? GRADE_COLORS[ng] : "var(--g-none)", "Nutritional quality from A (best) to E (worst), balancing sugar, salt, saturated fat and calories against fiber, protein, fruit and vegetables.")}
        ${gradeTile("NOVA", p.nova_group ? String(p.nova_group) : "?", NOVA_COLORS[p.nova_group] || "var(--g-none)", "Processing level: 1 = unprocessed, 2 = culinary ingredient, 3 = processed, 4 = ultra-processed (industrial formulations with additives).")}
        ${gradeTile("Eco-Score", eg ? eg.toUpperCase() : "?", eg ? GRADE_COLORS[eg] : "var(--g-none)", "Environmental impact from A (lowest) to E (highest), based on life-cycle analysis plus origin, packaging and labels.")}
      </div>`;
  }

  if (d.positives.length || d.labels.length) {
    html += `<h2 class="h2">The good</h2><div class="goods">
      ${d.positives.map((g) => `<div class="good">${icon("check")}<div><strong>${escapeHtml(g.label)}</strong><span>${escapeHtml(g.detail)}</span></div></div>`).join("")}
      ${d.labels.length ? `<div class="label-chips">${d.labels.map((l) => `<span class="chip chip-good">${escapeHtml(l)}</span>`).join("")}</div>` : ""}
    </div>`;
  }

  html += `<h2 class="h2">Watch list</h2>`;
  if (d.analysis.hits.length) {
    html += `<div class="flags">${d.analysis.hits.map((h) => `
      <details class="flag flag-${h.tier}">
        <summary>
          <span class="flag-dot"></span>
          <span class="flag-name">${escapeHtml(h.name)}${h.code ? ` <span class="mono dim">${escapeHtml(h.code)}</span>` : ""}</span>
          <span class="flag-group">${escapeHtml(h.group)}</span>
        </summary>
        <p>${escapeHtml(h.why)}</p>
      </details>`).join("")}</div>`;
  } else {
    const hasIngredients = !!(p.ingredients_text || p.ingredients_text_en);
    html += `<div class="empty">${hasIngredients ? "Nothing from our watch list of dyes, preservatives, sweeteners, emulsifiers and oils." : "No ingredient list on file for this product, so nothing could be checked."}</div>`;
  }

  if (d.levels.length) {
    html += `<h2 class="h2">Per 100 g at a glance</h2><div class="levels">
      ${d.levels.map((l) => `
        <div class="level lv-${l.level || "none"}">
          <div class="level-top"><span>${l.label}</span><span class="mono">${l.value !== null && l.value !== undefined ? l.value + " g" : "–"}</span></div>
          <div class="level-bar"><i style="width:${l.fill}%"></i><b style="left:${(l.low / (l.high * 1.5)) * 100}%"></b><b style="left:${(1 / 1.5) * 100}%"></b></div>
          <div class="level-tag">${l.level ? cap(l.level) : "Unknown"}</div>
        </div>`).join("")}
    </div>`;
  }

  if (d.sugar && d.sugar.tsp > 0) html += sugarHTML(d);

  html += `<div id="swaps-section"></div>`;
  return html;
}

function sugarHTML(d) {
  const { tsp, basis } = d.sugar;
  const shown = Math.min(Math.ceil(tsp), 24);
  const cubes = [];
  for (let i = 0; i < shown; i++) {
    const frac = Math.min(1, tsp - i);
    cubes.push(`<span class="cube" style="--f:${Math.max(0.15, frac)}"></span>`);
  }
  const servingNote = basis === "serving" ? `per serving${d.nutrition.servingLabel ? ` (${escapeHtml(d.nutrition.servingLabel)})` : ""}` : "per 100 g";
  return `
    <h2 class="h2">Sugar, in cubes</h2>
    <div class="sugar">
      <div class="cubes">${cubes.join("")}${tsp > 24 ? `<span class="cube-more">+${Math.round(tsp - 24)}</span>` : ""}</div>
      <div class="sugar-text"><span class="big mono">${tsp}</span> teaspoons of sugar ${servingNote}<br><span class="dim">One cube ≈ 4 g. The AHA suggests at most 6–9 teaspoons of added sugar a day.</span></div>
    </div>`;
}

// ---------- Swaps ----------

function renderSwaps() {
  const section = $("#swaps-section");
  if (!section) return;
  const s = state.swaps;
  if (!state.isFood || (s && s.status === "not-applicable")) { section.innerHTML = ""; return; }
  const head = `<h2 class="h2">Better swaps</h2>`;
  if (s === undefined) {
    section.innerHTML = head + `<div class="swaps">${[0, 1, 2].map(() => `
      <div class="swap skeleton"><div class="swap-thumb shimmer"></div><div class="swap-body"><div class="sk-line shimmer" style="width:70%"></div><div class="sk-line shimmer" style="width:40%"></div></div></div>`).join("")}</div>`;
    return;
  }
  if (s.status === "error") { section.innerHTML = head + `<div class="empty">Couldn't check for alternatives right now — try again shortly.</div>`; return; }
  if (!s.items.length) { section.innerHTML = head + `<div class="empty">No better-rated alternatives found in this category.</div>`; return; }
  const maxScans = Math.max(...s.items.map((p) => p.scans));
  section.innerHTML = head + `<div class="swaps">${s.items.map((p) => `
    <a class="swap" href="?code=${encodeURIComponent(p.code)}">
      <div class="swap-thumb">${p.image_small_url ? `<img src="${escapeHtml(p.image_small_url)}" alt="" onerror="this.remove()">` : ""}</div>
      <div class="swap-body">
        <div class="swap-title">${escapeHtml(p.product_name)}</div>
        ${p.brands ? `<div class="swap-brand">${escapeHtml(p.brands.split(",")[0].trim())}</div>` : ""}
        <div class="swap-badges">
          ${p.nova_group ? `<span class="mini">NOVA ${p.nova_group}</span>` : ""}
          ${p.matchedStore ? `<span class="mini mini-store">${escapeHtml(p.matchedStore)}</span>` : ""}
          ${p.scans > 0 && p.scans === maxScans ? `<span class="mini mini-hot">Popular</span>` : ""}
        </div>
      </div>
      <span class="swap-grade" style="background:${GRADE_COLORS[p.nutriscore_grade] || "var(--g-none)"}">${escapeHtml((p.nutriscore_grade || "?").toUpperCase())}</span>
    </a>`).join("")}</div>
    <p class="fineprint">Same category (${escapeHtml(tagLabel(s.category))}), better Nutri-Score or less processed. Tap to scan it.</p>`;
}

// ---------- Nutrition ----------

function nutritionPanelHTML(d) {
  const n = d.nutrition;
  if (!n.hasAny) return `<div class="empty">No nutrition facts on file for this product.</div>`;
  const hasServing = Object.values(n.values).some((v) => v.perServing !== null);
  const basis = hasServing ? state.basis : "100g";
  const pick = (key) => {
    const v = n.values[key];
    return basis === "serving" ? v.perServing : v.per100;
  };
  const usda = (key) => (n.values[key].source === "usda" ? `<span class="usda">USDA</span>` : "");
  const amt = (key) => {
    const v = pick(key);
    return v === null || v === undefined ? "–" : `${v}${n.values[key].unit === "kcal" ? "" : n.values[key].unit}`;
  };
  const dv = (key, dvKey = key) => {
    const pct = dailyValuePct(dvKey, pick(key));
    return pct === null ? "" : `<b>${pct}%</b>`;
  };
  const row = (label, key, { cls = "", dvKey = key, bold = false } = {}) => {
    if (pick(key) === null && ["transFat", "cholesterol", "addedSugars"].includes(key)) return "";
    return `<div class="nf-row ${cls}"><span>${bold ? `<strong>${label}</strong>` : label} ${amt(key)}${usda(key)}</span>${dv(key, dvKey)}</div>`;
  };
  const micros = ["vitaminD", "calcium", "iron", "potassium"].filter((k) => pick(k) !== null);
  const microLabels = { vitaminD: "Vitamin D", calcium: "Calcium", iron: "Iron", potassium: "Potassium" };

  return `
    ${hasServing ? `
      <div class="seg" role="radiogroup">
        <button class="seg-btn ${basis === "serving" ? "active" : ""}" data-basis="serving">Per serving</button>
        <button class="seg-btn ${basis === "100g" ? "active" : ""}" data-basis="100g">Per 100 g</button>
      </div>` : ""}
    <div class="nf">
      <div class="nf-title">Nutrition Facts</div>
      <div class="nf-serving"><span>${basis === "serving" ? "Serving size" : "Amount per"}</span><strong>${basis === "serving" ? escapeHtml(n.servingLabel || (n.servingG ? n.servingG + " g" : "1 serving")) : "100 g"}</strong></div>
      <div class="nf-rule-thick"></div>
      <div class="nf-small">Amount per ${basis === "serving" ? "serving" : "100 g"}</div>
      <div class="nf-cal"><span>Calories</span><span>${pick("energy") ?? "–"}${usda("energy")}</span></div>
      <div class="nf-rule-mid"></div>
      <div class="nf-dvhead">% Daily Value*</div>
      ${row("Total Fat", "fat", { bold: true })}
      ${row("Saturated Fat", "satFat", { cls: "in" })}
      ${row("<i>Trans</i> Fat", "transFat", { cls: "in", dvKey: "none" })}
      ${row("Cholesterol", "cholesterol", { bold: true })}
      ${row("Sodium", "sodium", { bold: true })}
      ${row("Total Carbohydrate", "carbs", { bold: true })}
      ${row("Dietary Fiber", "fiber", { cls: "in" })}
      ${row("Total Sugars", "sugars", { cls: "in", dvKey: "none" })}
      ${row("Includes Added Sugars", "addedSugars", { cls: "in2" })}
      ${row("Protein", "protein", { bold: true, dvKey: "none" })}
      ${micros.length ? `<div class="nf-rule-thick"></div>${micros.map((k) => row(microLabels[k], k)).join("")}` : ""}
      <div class="nf-rule-mid"></div>
      <div class="nf-foot">* % Daily Value is based on a 2,000 calorie diet (FDA reference values).${basis === "100g" ? " Shown per 100 g, not per serving." : ""}${n.usedUsda ? " Values tagged USDA were filled in from USDA FoodData Central." : ""}</div>
    </div>
    ${nutriscoreBreakdownHTML()}
    ${state.product.image_nutrition_url ? `<a class="photo-link" href="${escapeHtml(state.product.image_nutrition_url)}" target="_blank" rel="noopener">${icon("image")} View the photo of the actual label</a>` : ""}
  `;
}

const NS_LABELS = {
  energy: "Calories", energy_from_saturated_fat: "Calories from sat. fat", sugars: "Sugars", saturated_fat: "Saturated fat",
  saturated_fat_ratio: "Sat. fat ratio", salt: "Salt", sodium: "Sodium", non_nutritive_sweeteners: "Sweeteners",
  fiber: "Fiber", proteins: "Protein", fruits_vegetables_legumes: "Fruit, veg & legumes", fruits_vegetables_nuts_colza_walnut_olive_oils: "Fruit, veg & nuts"
};

function nutriscoreBreakdownHTML() {
  const comp = state.product.nutriscore_data?.components;
  if (!comp || (!comp.negative?.length && !comp.positive?.length)) return "";
  const rows = (list, kind) => (list || []).filter((c) => c.points_max).map((c) => `
    <div class="ns-row ns-${kind}">
      <div class="ns-top"><span>${escapeHtml(NS_LABELS[c.id] || tagLabel(c.id))}</span><span class="mono">${kind === "neg" ? "−" : "+"}${c.points}/${c.points_max}</span></div>
      <div class="bar"><i style="width:${(c.points / c.points_max) * 100}%"></i></div>
    </div>`).join("");
  return `
    <h2 class="h2">Why Nutri-Score ${escapeHtml((state.product.nutriscore_grade || "?").toUpperCase())}</h2>
    <div class="ns">
      <div class="ns-col"><div class="ns-head">Against</div>${rows(comp.negative, "neg")}</div>
      <div class="ns-col"><div class="ns-head">In favor</div>${rows(comp.positive, "pos") || `<div class="dim small">Nothing</div>`}</div>
    </div>`;
}

// ---------- Ingredients ----------

function ingredientsPanelHTML(d) {
  const p = state.product;
  const text = p.ingredients_text_en || p.ingredients_text || "";
  const list = (p.ingredients || []).filter((i) => i.text);
  const flaggedNames = d.analysis.hits.map((h) => h.name.toLowerCase());
  const isFlagged = (t) => {
    const s = t.toLowerCase();
    return INGREDIENT_FLAGS.some((f) => flaggedNames.includes(f.name.toLowerCase()) && f.match.some((m) => s.includes(m)))
      || d.analysis.hits.some((h) => h.code && s.includes(h.code.toLowerCase()));
  };

  let html = "";
  if (list.length) {
    html += `<h2 class="h2">${list.length} ingredients, by weight</h2><ol class="ing-list">
      ${list.map((i) => {
        const pct = i.percent ?? i.percent_estimate;
        const tier = ingredientTier(i, isFlagged);
        return `<li class="ing ${tier ? "ing-" + tier : ""}">
          <span class="ing-name">${escapeHtml(cap(i.text))}${i.ingredients?.length ? ` <span class="dim">(${escapeHtml(i.ingredients.map((s) => s.text).join(", "))})</span>` : ""}</span>
          ${pct !== undefined && pct !== null && pct > 0 ? `<span class="ing-pct mono">${i.percent !== undefined ? "" : "~"}${pct < 1 ? "<1" : Math.round(pct)}%</span>` : ""}
        </li>`;
      }).join("")}
    </ol>`;
  }
  html += `<details class="raw" ${list.length ? "" : "open"}><summary>As printed on the label</summary><p>${text ? escapeHtml(text) : "No ingredient text on file."}</p></details>`;

  const allergens = (p.allergens_tags || []).map(tagLabel);
  const traces = (p.traces_tags || []).map(tagLabel);
  html += `<h2 class="h2">Allergens</h2><div class="chip-row">
    ${allergens.length ? allergens.map((a) => `<span class="chip chip-bad">${escapeHtml(a)}</span>`).join("") : `<span class="chip">None declared</span>`}
    ${traces.map((a) => `<span class="chip chip-warn">May contain: ${escapeHtml(a)}</span>`).join("")}
  </div>`;

  const at = p.ingredients_analysis_tags || [];
  const dietChip = (yes, maybe, no, label) => at.includes(yes) ? `<span class="chip chip-good">${label}</span>`
    : at.includes(no) ? `<span class="chip chip-bad">Not ${label.toLowerCase()}</span>`
    : at.includes(maybe) ? `<span class="chip chip-warn">Maybe ${label.toLowerCase()}</span>` : "";
  const diets = [
    dietChip("en:vegan", "en:maybe-vegan", "en:non-vegan", "Vegan"),
    dietChip("en:vegetarian", "en:maybe-vegetarian", "en:non-vegetarian", "Vegetarian"),
    at.includes("en:palm-oil-free") ? `<span class="chip chip-good">Palm-oil free</span>` : at.includes("en:palm-oil") ? `<span class="chip chip-bad">Contains palm oil</span>` : at.includes("en:may-contain-palm-oil") ? `<span class="chip chip-warn">May contain palm oil</span>` : ""
  ].filter(Boolean);
  if (diets.length) html += `<h2 class="h2">Diet check</h2><div class="chip-row">${diets.join("")}</div>`;

  html += `<div id="additives-section"></div><div id="nova-section"></div>`;
  if (p.image_ingredients_url) html += `<a class="photo-link" href="${escapeHtml(p.image_ingredients_url)}" target="_blank" rel="noopener">${icon("image")} View the photo of the ingredient list</a>`;
  return html;
}

// Worst tier among an ingredient and its sub-ingredients, so e.g.
// "Artificial color (Yellow 6, Red 40)" lights up red.
function ingredientTier(ing, isFlagged) {
  let tier = "";
  const visit = (x) => {
    const t = ADDITIVES[x.id]?.tier || (x.text && isFlagged(x.text) ? "caution" : "");
    if (t === "avoid" || (t === "caution" && !tier)) tier = t;
    (x.ingredients || []).forEach(visit);
  };
  visit(ing);
  return tier;
}

function renderAdditives() {
  const el = $("#additives-section");
  if (!el) return;
  const tags = state.product.additives_tags || [];
  if (!tags.length) { el.innerHTML = `<h2 class="h2">Additives</h2><div class="empty">No additives detected.</div>`; return; }
  el.innerHTML = `<h2 class="h2">All ${tags.length} additive${tags.length > 1 ? "s" : ""}</h2><div class="additives">
    ${tags.map((t) => {
      const local = ADDITIVES[t];
      const info = state.additiveInfo[t];
      const codeLabel = t.replace(/^en:/, "").toUpperCase();
      const name = info?.name?.replace(/^E\w+\s*-\s*/, "") || local?.name || codeLabel;
      const classes = info?.classes?.length ? info.classes.join(", ") : local?.group || "";
      return `<div class="additive ${local ? "add-" + local.tier : ""}">
        <span class="add-code mono">${escapeHtml(codeLabel)}</span>
        <span class="add-name">${escapeHtml(name)}${classes ? `<span class="dim"> · ${escapeHtml(classes)}</span>` : ""}</span>
        <span class="add-tier">${local ? (local.tier === "avoid" ? "High" : "Moderate") : "OK"}</span>
      </div>`;
    }).join("")}
  </div>`;
}

function renderNovaReasons() {
  const el = $("#nova-section");
  if (!el) return;
  const reasons = novaReasons(state.product, state.additiveInfo);
  if (!reasons.length || !state.product.nova_group || state.product.nova_group < 3) { el.innerHTML = ""; return; }
  el.innerHTML = `<h2 class="h2">Why NOVA ${state.product.nova_group}</h2>
    <p class="small dim">Ingredients that mark this as ${state.product.nova_group === 4 ? "ultra-processed" : "processed"}:</p>
    <div class="chip-row">${reasons.map((r) => `<span class="chip">${escapeHtml(r)}</span>`).join("")}</div>`;
}

// ---------- Sourcing (brand, origin, packaging, eco, prices) ----------

function sourcingPanelHTML(d) {
  const p = state.product;
  const facts = [
    ["Made in", p.manufacturing_places],
    ["Ingredient origins", p.origins && p.origins !== "Unknown" ? p.origins : null],
    ["Sold in", (p.countries_tags || []).map(tagLabel).slice(0, 8).join(", ")],
    ["Stores", p.stores],
    ["Category", tagLabel(bestCategoryTag(p))]
  ].filter(([, v]) => v);

  const eco = d.eco;
  return `
    <h2 class="h2">Who makes it</h2>
    <div id="brand-body"></div>

    ${facts.length ? `<h2 class="h2">Where it's from</h2><dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>` : ""}

    ${eco.grade || eco.co2PerKg || eco.packaging.length ? `
      <h2 class="h2">Planet</h2>
      <div class="eco">
        ${eco.grade ? `<div class="eco-grade" style="background:${GRADE_COLORS[eco.grade]}">${eco.grade.toUpperCase()}</div>` : ""}
        <div class="eco-body">
          ${eco.co2PerKg ? `<div><span class="big mono">${eco.co2PerKg}</span> kg CO₂e per kg of product</div>` : ""}
          ${eco.co2Pack ? `<div class="dim">This pack ≈ ${eco.co2Pack} kg CO₂e — about ${eco.carKm} km in an average car.</div>` : ""}
          ${!eco.co2PerKg ? `<div class="dim">Environmental score from Open Food Facts.</div>` : ""}
        </div>
      </div>
      ${eco.packaging.length ? `<div class="pack">${eco.packaging.map((k) => `<div class="pack-row"><span>${escapeHtml([k.shape, k.material].filter(Boolean).join(" · "))}</span>${k.recycling ? `<span class="chip ${/recycle/i.test(k.recycling) && !/non|discard/i.test(k.recycling) ? "chip-good" : ""}">${escapeHtml(k.recycling)}</span>` : ""}</div>`).join("")}</div>` : ""}
    ` : ""}

    <h2 class="h2">Prices people paid</h2>
    <div id="prices-body"></div>
  `;
}

function renderBrand() {
  const el = $("#brand-body");
  if (!el) return;
  const b = state.brand;
  const p = state.product;
  const brand = (p.brands || "").split(",")[0].trim();
  if (b === undefined) { el.innerHTML = `<div class="loading-line shimmer"></div><div class="loading-line shimmer" style="width:60%"></div>`; return; }
  if (!b) {
    el.innerHTML = brand
      ? `<div class="own"><div class="own-node own-brand"><strong>${escapeHtml(brand)}</strong>${p.brand_owner ? `<span>Owned by ${escapeHtml(p.brand_owner)}</span>` : `<span>Ownership details unavailable</span>`}</div></div>`
      : `<div class="empty">No brand listed for this product.</div>`;
    return;
  }
  const nodes = [
    { name: b.name, description: [b.description, b.founded ? `since ${b.founded}` : "", b.country].filter(Boolean).join(" · "), kind: "brand" },
    ...b.chain.map((c) => ({ name: c.name, description: c.description, kind: "owner" }))
  ];
  el.innerHTML = `
    <div class="own">
      ${nodes.map((n, i) => `
        ${i ? `<div class="own-link"><span>${i === 1 ? "owned by" : "part of"}</span></div>` : ""}
        <div class="own-node own-${n.kind}">
          <strong>${escapeHtml(n.name)}</strong>
          ${n.description ? `<span>${escapeHtml(cap(n.description))}</span>` : ""}
        </div>`).join("")}
    </div>
    ${b.summary?.extract ? `
      <div class="wiki">
        ${b.summary.thumb ? `<img src="${escapeHtml(b.summary.thumb)}" alt="" onerror="this.remove()">` : ""}
        <p>${escapeHtml(b.summary.extract)}</p>
        ${b.summary.url ? `<a href="${escapeHtml(b.summary.url)}" target="_blank" rel="noopener">Wikipedia ${icon("ext")}</a>` : ""}
      </div>` : ""}
    <p class="fineprint">Ownership from Wikidata, matched by brand name.</p>`;
}

function renderPrices() {
  const el = $("#prices-body");
  if (!el) return;
  const items = state.prices;
  if (items === undefined) { el.innerHTML = `<div class="loading-line shimmer"></div>`; return; }
  if (!items.length) {
    el.innerHTML = `<div class="empty">No prices reported yet. Snap a receipt or price tag at <a href="https://prices.openfoodfacts.org/" target="_blank" rel="noopener">Open Prices</a> to add one.</div>`;
    return;
  }
  const fmt = (price, currency) => {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(price); } catch { return `${price} ${currency}`; }
  };
  const byCurrency = {};
  for (const it of items) (byCurrency[it.currency] ||= []).push(it.price);
  const [mainCur, mainPrices] = Object.entries(byCurrency).sort((a, b) => b[1].length - a[1].length)[0];
  const min = Math.min(...mainPrices), max = Math.max(...mainPrices);
  el.innerHTML = `
    <div class="price-sum">
      <div><span class="dim small">Latest</span><strong class="mono">${fmt(items[0].price, items[0].currency)}</strong></div>
      <div><span class="dim small">Range (${mainPrices.length})</span><strong class="mono">${min === max ? fmt(min, mainCur) : `${fmt(min, mainCur)}–${fmt(max, mainCur)}`}</strong></div>
    </div>
    <div class="prices">${items.slice(0, 6).map((it) => {
      const loc = it.location || {};
      const where = [loc.osm_name, loc.osm_address_city, loc.osm_address_country].filter(Boolean).join(", ") || "Unknown store";
      return `<div class="price-row">
        <div><strong>${escapeHtml(where)}</strong><span class="dim small">${escapeHtml(formatDate(it.date))}${it.price_is_discounted ? " · on sale" : ""}</span></div>
        <span class="mono">${fmt(it.price, it.currency)}</span>
      </div>`;
    }).join("")}</div>
    <p class="fineprint">Crowdsourced by <a href="https://prices.openfoodfacts.org/" target="_blank" rel="noopener">Open Prices</a>.</p>`;
}

// ---------- Recalls ----------

const RECALL_CLASS = {
  "Class I": "Serious: reasonable probability of serious health consequences or death.",
  "Class II": "Moderate: may cause temporary or medically reversible health problems.",
  "Class III": "Minor: unlikely to cause adverse health consequences."
};

function renderRecalls() {
  const el = $("#recalls-body");
  const countEl = $("#recall-count");
  const r = state.recalls;
  if (countEl) {
    const ongoing = (r || []).filter((x) => x.status === "Ongoing").length;
    const barcode = (r || []).some((x) => x.match === "barcode");
    countEl.textContent = r && r.length ? String(r.length) : "";
    countEl.className = "tab-count" + (barcode || ongoing ? " hot" : "");
  }
  if (r && r.some((x) => x.match === "barcode") && !$(".stamp-recall")) {
    $("#stamps")?.insertAdjacentHTML("afterbegin", `<span class="stamp stamp-red stamp-recall">Recall match</span>`);
  }
  if (!el) return;
  if (r === undefined) { el.innerHTML = `<div class="loading-line shimmer"></div><div class="loading-line shimmer" style="width:70%"></div>`; return; }
  if (!r.length) { el.innerHTML = `<div class="all-clear">${icon("check")}<div><strong>No matching recalls</strong><span>Nothing found for this barcode or brand.</span></div></div>`; return; }
  el.innerHTML = `<div class="recalls">${r.map((x) => `
    <details class="recall ${x.match === "barcode" ? "recall-hit" : ""} ${x.status === "Ongoing" ? "recall-live" : ""}">
      <summary>
        <div class="recall-tags">
          ${x.match === "barcode" ? `<span class="mini mini-bad">Barcode match</span>` : `<span class="mini">Brand match</span>`}
          <span class="mini ${x.status === "Ongoing" ? "mini-bad" : ""}">${escapeHtml(x.status || "")}</span>
          ${x.classification ? `<span class="mini">${escapeHtml(x.classification)}</span>` : ""}
          <span class="dim small">${escapeHtml(formatDate(x.recall_initiation_date))}</span>
        </div>
        <div class="recall-title">${escapeHtml(x.product_description || "Recalled product")}</div>
      </summary>
      <div class="recall-body">
        <p><strong>Reason:</strong> ${escapeHtml(x.reason_for_recall || "Not given")}</p>
        ${RECALL_CLASS[x.classification] ? `<p class="dim">${RECALL_CLASS[x.classification]}</p>` : ""}
        <p><strong>Firm:</strong> ${escapeHtml(x.recalling_firm || "")}${x.city ? `, ${escapeHtml(x.city)}${x.state ? " " + escapeHtml(x.state) : ""}` : ""}</p>
        ${x.distribution_pattern ? `<p><strong>Distributed:</strong> ${escapeHtml(x.distribution_pattern)}</p>` : ""}
        ${x.code_info ? `<p class="mono small dim">${escapeHtml(x.code_info.slice(0, 400))}</p>` : ""}
      </div>
    </details>`).join("")}</div>`;
}

function formatDate(s) {
  if (!s) return "";
  const m = String(s).match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (!m) return s;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

// ---------- Footer ----------

function footerHTML() {
  const p = state.product;
  const db = state.lookup.db;
  const updated = p.last_modified_t ? new Date(p.last_modified_t * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null;
  const completeness = p.completeness ? Math.round(p.completeness * 100) : null;
  return `
    <footer class="footer">
      <div class="footer-links">
        <a href="https://${db.host}/product/${encodeURIComponent(state.lookup.code)}" target="_blank" rel="noopener">View on ${escapeHtml(db.name)} ${icon("ext")}</a>
        <a href="https://${db.host}/cgi/product.pl?type=edit&code=${encodeURIComponent(state.lookup.code)}" target="_blank" rel="noopener">Fix or add data ${icon("ext")}</a>
      </div>
      <div class="footer-meta">${[updated ? `Updated ${updated}` : "", completeness !== null ? `${completeness}% complete` : ""].filter(Boolean).join(" · ")}</div>
      <div>Data: ${escapeHtml(db.name)} · openFDA · Open Prices · Wikidata · Wikipedia${typeof USDA_API_KEY !== "undefined" && USDA_API_KEY ? " · USDA FoodData Central" : ""}</div>
      <div>Not medical advice.</div>
    </footer>`;
}

// ---------- Landing / loading / not found / error ----------

function showLanding() {
  const history = loadHistory();
  $("#app").innerHTML = `
    ${topBar()}
    <section class="landing">
      <div class="land-hero">
        <div class="land-barcode">${barcodeSVG("0" + "12345678905")}</div>
        <h1 class="land-title">Know what's<br><span class="hl">in it.</span></h1>
        <p class="land-sub">Scan a barcode with the <strong>Food Scanner</strong> shortcut on your iPhone. You'll get a health score, flagged ingredients, allergens, recalls, prices and who really owns the brand.</p>
      </div>

      <form class="code-form" id="code-form">
        <label for="code-input" class="small dim">Or type a barcode</label>
        <div class="code-input-row">
          <input id="code-input" inputmode="numeric" autocomplete="off" placeholder="e.g. 3017624010701" pattern="[0-9 ]*">
          <button type="submit" class="btn">Look up</button>
        </div>
      </form>

      ${history.length ? `
        <div class="hist-head"><h2 class="h2">Recent scans</h2><button class="link-btn" data-action="clear-history">Clear</button></div>
        <div class="history">${history.map((h) => `
          <a class="hist" href="?code=${encodeURIComponent(h.code)}">
            <div class="hist-thumb">${h.image ? `<img src="${escapeHtml(h.image)}" alt="" onerror="this.remove()">` : ""}</div>
            <div class="hist-body"><strong>${escapeHtml(h.name)}</strong><span>${escapeHtml(h.brand || h.code)}</span></div>
            <span class="hist-score band-${h.band || "none"}">${h.score ?? "–"}</span>
          </a>`).join("")}</div>` : `
        <h2 class="h2">Try one</h2>
        <div class="examples">
          <a class="chip" href="?code=3017624010701">Nutella</a>
          <a class="chip" href="?code=028400090896">Doritos Nacho Cheese</a>
          <a class="chip" href="?code=5449000000996">Coca-Cola</a>
          <a class="chip" href="?code=0894700010137">Chobani Greek Yogurt</a>
        </div>`}
    </section>`;

  $("#code-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#code-input").value.replace(/\D/g, "");
    if (v) window.location.search = `?code=${v}`;
  });
}

const LOADING_STEPS = ["Reading barcode", "Checking Open Food Facts", "Cross-checking databases", "Almost there"];

function showLoading(raw) {
  $("#app").innerHTML = `
    ${topBar()}
    <div class="loading">
      <div class="scan-ticket">
        ${barcodeSVG(raw.replace(/\D/g, "")) || barcodeSVG("0" + "12345678905")}
        <div class="laser"></div>
      </div>
      <div class="loading-text mono" id="loading-text">${LOADING_STEPS[0]}…</div>
    </div>`;
  let i = 0;
  const timer = setInterval(() => {
    const el = $("#loading-text");
    if (!el) return clearInterval(timer);
    i = Math.min(i + 1, LOADING_STEPS.length - 1);
    el.textContent = LOADING_STEPS[i] + "…";
  }, 900);
}

function showNotFound(lookup) {
  const digits = code.replace(/\D/g, "");
  const validLength = [8, 12, 13, 14].includes(digits.length);
  const badCheck = validLength && !hasValidCheckDigit(digits) && !(digits.length === 8 && expandUpcE(digits) && hasValidCheckDigit(expandUpcE(digits)));
  $("#app").innerHTML = `
    ${topBar()}
    <div class="message">
      <div class="msg-icon">${icon("search")}</div>
      <h1 class="title">Not in the databases yet</h1>
      <p>We checked Open Food Facts plus its beauty, pet food and general product databases for:</p>
      <div class="chip-row center">${(lookup.variants || [digits]).map((v) => `<span class="chip mono">${escapeHtml(v)}</span>`).join("")}</div>
      ${badCheck ? `<p class="warn-text">${icon("alert")} This barcode's check digit doesn't add up — the scan may have misread a digit. Try scanning again.</p>` : ""}
      ${!digits ? `<p class="warn-text">${icon("alert")} That doesn't look like a barcode.</p>` : ""}
      <div class="msg-actions">
        <a class="btn" href="https://world.openfoodfacts.org/cgi/product.pl?type=add&code=${encodeURIComponent(digits)}" target="_blank" rel="noopener">Add it to Open Food Facts</a>
        <button class="btn btn-ghost" data-action="retry">Try again</button>
      </div>
      <p class="fineprint">Adding it takes a couple of photos and helps everyone who scans it next.</p>
    </div>`;
}

function showError(err) {
  $("#app").innerHTML = `
    ${topBar()}
    <div class="message">
      <div class="msg-icon">${icon("alert")}</div>
      <h1 class="title">Couldn't reach the database</h1>
      <p>${escapeHtml(err?.name === "AbortError" ? "The request timed out." : err?.message || String(err))}</p>
      <div class="msg-actions"><button class="btn" data-action="retry">Try again</button></div>
    </div>`;
}

// ---------- Profile sheet ----------

function openProfile() {
  const pr = state.profile;
  const sheet = document.createElement("div");
  sheet.className = "sheet-wrap";
  sheet.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Your profile">
      <div class="sheet-grip"></div>
      <div class="sheet-head"><h2>Your profile</h2><button class="icon-btn" data-action="close-sheet" aria-label="Close">${icon("x")}</button></div>
      <p class="small dim">Saved on this device only. Every scan checks against it.</p>
      <h3 class="h3">I avoid</h3>
      <div class="toggles">${ALLERGENS.map((a) => `<label class="toggle"><input type="checkbox" name="allergen" value="${a.id}" ${pr.allergens.includes(a.id) ? "checked" : ""}><span>${a.label}</span></label>`).join("")}</div>
      <h3 class="h3">I eat</h3>
      <div class="toggles">${DIETS.map((d) => `<label class="toggle"><input type="checkbox" name="diet" value="${d.id}" ${pr.diets.includes(d.id) ? "checked" : ""}><span>${d.label}</span></label>`).join("")}</div>
      <h3 class="h3">Watch list</h3>
      <div class="toggles">${PREFERENCES.map((p) => `<label class="toggle"><input type="checkbox" name="pref" value="${p.id}" ${pr.prefs[p.id] ? "checked" : ""}><span>${p.label}</span></label>`).join("")}</div>
      <button class="btn btn-block" data-action="save-profile">Save</button>
    </div>`;
  document.body.appendChild(sheet);
  document.body.classList.add("no-scroll");
  requestAnimationFrame(() => sheet.classList.add("open"));
}

function closeProfile() {
  const sheet = $(".sheet-wrap");
  if (!sheet) return;
  sheet.classList.remove("open");
  document.body.classList.remove("no-scroll");
  setTimeout(() => sheet.remove(), 250);
}

function saveProfileFromSheet() {
  const checked = (name) => $$(`.sheet input[name="${name}"]:checked`).map((i) => i.value);
  const prefs = {};
  for (const p of PREFERENCES) prefs[p.id] = checked("pref").includes(p.id);
  state.profile = { allergens: checked("allergen"), diets: checked("diet"), prefs };
  saveProfile(state.profile);
  closeProfile();
  if (state.product) {
    renderProduct();
    saveToHistory();
  } else if (!code) {
    showLanding();
  } else {
    // Update the profile badge on not-found/error screens.
    const btn = $('[data-action="profile"] .icon-badge');
    if (btn) btn.textContent = profileCount() || "";
  }
}

// ---------- Share ----------

async function share() {
  const p = state.product;
  const d = derive();
  const text = `${productName(p)}${d.score ? ` scored ${d.score.score}/100 (${d.score.band.label})` : ""} on Food Scanner`;
  const url = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: productName(p), text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast("Link copied");
  } catch {}
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 1800);
}

// ---------- Events ----------

function bindGlobalEvents() {
  document.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) {
      state.tab = tab.dataset.tab;
      $$(".tab").forEach((t) => { t.classList.toggle("active", t === tab); t.setAttribute("aria-selected", t === tab); });
      $$(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === state.tab));
      tab.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      const tabs = $(".tabs");
      if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const basis = e.target.closest("[data-basis]");
    if (basis) {
      state.basis = basis.dataset.basis;
      const panel = $('[data-panel="nutrition"]');
      if (panel) panel.innerHTML = nutritionPanelHTML(derive());
      return;
    }
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) {
      if (e.target.classList.contains("sheet-wrap")) closeProfile();
      return;
    }
    if (action === "profile") openProfile();
    else if (action === "close-sheet") closeProfile();
    else if (action === "save-profile") saveProfileFromSheet();
    else if (action === "share") share();
    else if (action === "retry") window.location.reload();
    else if (action === "clear-history") { store.set("fs.history", []); showLanding(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeProfile(); });
}

// ---------- Barcode SVG (EAN-13 / UPC-A / EAN-8) ----------

// Draws the real bar pattern for the scanned code, so the ticket shows the
// same barcode that's on the package.
const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLL", "LGLLLG", "LGLGGL"];

function barcodeSVG(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12) digits = "0" + digits;
  let bits, text;
  if (digits.length === 13) {
    const first = +digits[0];
    const left = digits.slice(1, 7).split("").map((d, i) => (EAN_PARITY[first][i] === "L" ? EAN_L : EAN_G)[+d]).join("");
    const right = digits.slice(7).split("").map((d) => EAN_R[+d]).join("");
    bits = "101" + left + "01010" + right + "101";
    text = `${digits[0]}  ${digits.slice(1, 7)}  ${digits.slice(7)}`;
  } else if (digits.length === 8) {
    bits = "101" + digits.slice(0, 4).split("").map((d) => EAN_L[+d]).join("") + "01010" + digits.slice(4).split("").map((d) => EAN_R[+d]).join("") + "101";
    text = `${digits.slice(0, 4)}  ${digits.slice(4)}`;
  } else if (digits.length) {
    return `<div class="barcode-text mono">${escapeHtml(digits)}</div>`;
  } else {
    return "";
  }
  const guard = new Set();
  const n = bits.length;
  // Guard bars (start, middle, end) extend lower, like on a real label.
  const guardRanges = n === 95 ? [[0, 3], [45, 50], [92, 95]] : [[0, 3], [31, 36], [64, 67]];
  for (const [a, b] of guardRanges) for (let i = a; i < b; i++) guard.add(i);
  let rects = "";
  for (let i = 0; i < n; i++) {
    if (bits[i] === "1") {
      let w = 1;
      while (bits[i + w] === "1" && guard.has(i) === guard.has(i + w)) w++;
      rects += `<rect x="${i}" y="0" width="${w}" height="${guard.has(i) ? 36 : 31}"/>`;
      i += w - 1;
    }
  }
  return `<svg class="barcode" viewBox="-2 0 ${n + 4} 44" preserveAspectRatio="none" role="img" aria-label="Barcode ${escapeHtml(digits)}">${rects}<text x="${n / 2}" y="43" text-anchor="middle">${escapeHtml(text)}</text></svg>`;
}

// ---------- Icons ----------

function icon(name) {
  const paths = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v6H4V6h6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'
  };
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
}

main();
