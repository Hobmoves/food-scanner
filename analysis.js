// Pure functions that turn an Open Food Facts product (plus optional USDA
// backfill and the user's profile) into everything the UI renders. No DOM,
// no network — testable in Node (see module.exports at the bottom).

// ---------- Flags (additives + ingredient text patterns) ----------

function analyzeProduct(product, prefs = {}) {
  const additiveTags = product.additives_tags || [];
  const ingredientsText = (product.ingredients_text_en || product.ingredients_text || "").toLowerCase();

  const hits = [];
  for (const tag of additiveTags) {
    if (ADDITIVES[tag]) hits.push({ ...ADDITIVES[tag], code: tag.replace(/^en:/, "").toUpperCase(), source: "additive" });
  }
  for (const flag of INGREDIENT_FLAGS) {
    if (flag.pref && prefs[flag.pref] === false) continue;
    // Blank out excluded phrases first, so e.g. "partially hydrogenated
    // soybean oil" doesn't also count as plain "hydrogenated soybean".
    const text = (flag.exclude || []).reduce((t, x) => t.split(x).join(" "), ingredientsText);
    if (flag.match.some((m) => text.includes(m))) {
      hits.push({ name: flag.name, tier: flag.tier, group: flag.group, why: flag.why, source: "ingredient" });
    }
  }

  // De-dupe (carrageenan appears as both en:carrageenan and en:e407;
  // potassium bromate can match both as a tag and as text).
  const seen = new Set();
  const deduped = hits.filter((h) => {
    const key = h.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "avoid" ? -1 : 1));

  return {
    hits: deduped,
    avoidCount: deduped.filter((h) => h.tier === "avoid").length,
    cautionCount: deduped.filter((h) => h.tier === "caution").length
  };
}

// ---------- Nutrition model ----------

// key, OFF nutriment id, display unit, factor from OFF's grams to display unit
const NUTRIENTS = [
  ["energy", "energy-kcal", "kcal", 1],
  ["fat", "fat", "g", 1],
  ["satFat", "saturated-fat", "g", 1],
  ["transFat", "trans-fat", "g", 1],
  ["cholesterol", "cholesterol", "mg", 1000],
  ["sodium", "sodium", "mg", 1000],
  ["carbs", "carbohydrates", "g", 1],
  ["fiber", "fiber", "g", 1],
  ["sugars", "sugars", "g", 1],
  ["addedSugars", "added-sugars", "g", 1],
  ["protein", "proteins", "g", 1],
  ["salt", "salt", "g", 1],
  ["vitaminD", "vitamin-d", "mcg", 1e6],
  ["calcium", "calcium", "mg", 1000],
  ["iron", "iron", "mg", 1000],
  ["potassium", "potassium", "mg", 1000]
];

const round = (v, d = 1) => {
  if (v === null || v === undefined || isNaN(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
const present = (v) => v !== undefined && v !== null && v !== "" && !isNaN(Number(v));

// Prefer Open Food Facts (usually mirrors the actual label). Backfill from
// USDA only where OFF is missing — each value keeps its source so the UI
// can tag USDA-sourced numbers. USDA branded-food values are per 100g and
// already in display units (mg/mcg).
function buildNutrition(product, usda) {
  const n = product.nutriments || {};
  const servingG = present(product.serving_quantity) ? Number(product.serving_quantity) : null;
  const out = { servingG, servingLabel: product.serving_size || usda?.householdServing || null, usedUsda: false, values: {} };

  for (const [key, offKey, unit, factor] of NUTRIENTS) {
    let per100 = present(n[`${offKey}_100g`]) ? Number(n[`${offKey}_100g`]) * factor : null;
    let perServing = present(n[`${offKey}_serving`]) ? Number(n[`${offKey}_serving`]) * factor : null;
    let source = per100 !== null || perServing !== null ? "off" : null;

    if (key === "energy" && per100 === null && present(n.energy_100g)) {
      per100 = Number(n.energy_100g) / 4.184; // kJ → kcal
      source = "off";
    }
    if (per100 === null && usda && usda[key] !== undefined) {
      per100 = Number(usda[key]);
      source = "usda";
      out.usedUsda = true;
    }
    if (perServing === null && per100 !== null && servingG) perServing = per100 * servingG / 100;

    const dp = unit === "kcal" ? 0 : unit === "g" ? 1 : 0;
    out.values[key] = { per100: round(per100, dp), perServing: round(perServing, dp), unit, source };
  }

  // Sodium ↔ salt: fill whichever is missing from the other.
  const v = out.values;
  if (v.sodium.per100 === null && v.salt.per100 !== null) {
    v.sodium = { ...v.sodium, per100: round(v.salt.per100 * 400, 0), perServing: v.salt.perServing !== null ? round(v.salt.perServing * 400, 0) : null, source: v.salt.source };
  }
  if (v.salt.per100 === null && v.sodium.per100 !== null) {
    v.salt = { ...v.salt, per100: round(v.sodium.per100 / 400, 2), perServing: v.sodium.perServing !== null ? round(v.sodium.perServing / 400, 2) : null, source: v.sodium.source };
  }

  out.hasAny = Object.values(v).some((x) => x.per100 !== null || x.perServing !== null);
  return out;
}

function dailyValuePct(key, amount) {
  const dv = DAILY_VALUES[key];
  if (!dv || amount === null || amount === undefined) return null;
  return Math.round((amount / dv) * 100);
}

// A sugar cube / teaspoon of sugar is ~4 g.
function sugarTeaspoons(nutrition) {
  const s = nutrition.values.sugars;
  const perServing = s.perServing;
  if (perServing !== null && perServing !== undefined) return { tsp: round(perServing / 4, 1), basis: "serving" };
  if (s.per100 !== null && s.per100 !== undefined) return { tsp: round(s.per100 / 4, 1), basis: "100g" };
  return null;
}

// UK FSA "traffic light" thresholds per 100 g (foods). Drinks use half.
const LEVEL_THRESHOLDS = {
  fat: { low: 3, high: 17.5, label: "Fat" },
  satFat: { low: 1.5, high: 5, label: "Saturated fat" },
  sugars: { low: 5, high: 22.5, label: "Sugars" },
  salt: { low: 0.3, high: 1.5, label: "Salt" }
};

function isBeverage(product) {
  return (product.categories_tags || []).includes("en:beverages") && !(product.categories_tags || []).includes("en:plant-based-milk-alternatives");
}

function nutrientLevels(product, nutrition) {
  const drink = isBeverage(product);
  const offLevels = product.nutrient_levels || {};
  const offKey = { fat: "fat", satFat: "saturated-fat", sugars: "sugars", salt: "salt" };
  return Object.entries(LEVEL_THRESHOLDS).map(([key, t]) => {
    const value = nutrition.values[key]?.per100;
    const low = drink ? t.low / 2 : t.low;
    const high = drink ? t.high / 2 : t.high;
    let level = offLevels[offKey[key]] || null;
    if (!level && value !== null && value !== undefined) level = value <= low ? "low" : value > high ? "high" : "moderate";
    const fill = value === null || value === undefined ? 0 : Math.min(100, (value / (high * 1.5)) * 100);
    return { key, label: t.label, value, level, fill, low, high };
  }).filter((l) => l.level || l.value !== null);
}

// ---------- Positives ----------

function positives(product, nutrition, analysis) {
  const out = [];
  const v = nutrition.values;
  const has = (k) => v[k] && v[k].per100 !== null && v[k].per100 !== undefined;
  if (has("fiber") && v.fiber.per100 >= 6) out.push({ label: "High fiber", detail: `${v.fiber.per100} g per 100 g` });
  if (has("protein") && (v.protein.per100 >= 10 || (has("energy") && v.energy.per100 > 0 && (v.protein.per100 * 4) / v.energy.per100 >= 0.2))) {
    out.push({ label: "Good protein", detail: `${v.protein.per100} g per 100 g` });
  }
  const drink = isBeverage(product);
  if (has("sugars") && v.sugars.per100 <= (drink ? 2.5 : 5)) out.push({ label: "Low sugar", detail: `${v.sugars.per100} g per 100 g` });
  if (has("salt") && v.salt.per100 <= 0.3) out.push({ label: "Low salt", detail: `${v.salt.per100} g per 100 g` });
  if (has("satFat") && v.satFat.per100 <= 1.5 && !drink) out.push({ label: "Low saturated fat", detail: `${v.satFat.per100} g per 100 g` });
  const hasIngredients = !!(product.ingredients_text || product.ingredients_text_en);
  if (hasIngredients && (product.additives_tags || []).length === 0) out.push({ label: "No additives", detail: "None detected in the ingredients" });
  if (product.nova_group === 1) out.push({ label: "Unprocessed", detail: "NOVA group 1 — whole or minimally processed" });
  if (hasIngredients && product.ingredients_n && product.ingredients_n <= 5) out.push({ label: "Short ingredient list", detail: `${product.ingredients_n} ingredients` });
  if (hasIngredients && analysis.hits.length === 0) out.push({ label: "Nothing flagged", detail: "No ingredients from our watch list" });
  return out;
}

function goodLabels(product) {
  const seen = new Set();
  return (product.labels_tags || [])
    .map((t) => GOOD_LABELS[t])
    .filter((l) => l && !seen.has(l) && seen.add(l));
}

const isOrganic = (product) => (product.labels_tags || []).some((t) => /organic|en:bio$|ab-agriculture-biologique/.test(t));

// ---------- Personal alerts from the profile ----------

function profileAlerts(product, profile) {
  const alerts = [];
  const allergens = product.allergens_tags || [];
  const traces = product.traces_tags || [];
  const analysisTags = product.ingredients_analysis_tags || [];
  const hasIngredients = !!(product.ingredients_text || product.ingredients_text_en || (product.ingredients || []).length);

  for (const a of ALLERGENS) {
    if (!profile.allergens?.includes(a.id)) continue;
    if (a.tags.some((t) => allergens.includes(t))) alerts.push({ level: "bad", text: `Contains ${a.label.toLowerCase()}` });
    else if (a.tags.some((t) => traces.includes(t))) alerts.push({ level: "warn", text: `May contain traces of ${a.label.toLowerCase()}` });
  }
  if (profile.allergens?.length && !hasIngredients) {
    alerts.push({ level: "warn", text: "No ingredient data — can't check your allergens" });
  }

  for (const d of DIETS) {
    if (!profile.diets?.includes(d.id)) continue;
    if (analysisTags.includes(d.tag)) alerts.push({ level: "bad", text: d.id === "palmfree" ? "Contains palm oil" : `Not ${d.label.toLowerCase()}` });
    else if (analysisTags.includes(d.maybe)) alerts.push({ level: "warn", text: d.id === "palmfree" ? "May contain palm oil" : `Might not be ${d.label.toLowerCase()}` });
    else if (analysisTags.includes(d.unknown) || !analysisTags.length) alerts.push({ level: "info", text: `${d.label} status unknown` });
    else alerts.push({ level: "ok", text: d.id === "palmfree" ? "Palm-oil free" : d.label });
  }
  return alerts;
}

// ---------- Scan Score (0–100) ----------

// Our own blended heuristic, shown with its breakdown so it's never a black
// box: nutrition quality (Nutri-Score) is weighted most, then processing
// level (NOVA), then flagged additives/ingredients. Components with no data
// are dropped and the rest rescaled. Any "avoid"-tier ingredient caps the
// score at 49 — a great nutrition profile shouldn't paper over e.g. a
// banned dye.
const NUTRI_POINTS = { a: 60, b: 48, c: 34, d: 20, e: 6 };
const NOVA_POINTS = { 1: 20, 2: 17, 3: 11, 4: 4 };

function scanScore(product, analysis) {
  const parts = [];
  const grade = product.nutriscore_grade;
  if (NUTRI_POINTS[grade] !== undefined) parts.push({ key: "nutrition", label: "Nutrition", points: NUTRI_POINTS[grade], max: 60, note: `Nutri-Score ${grade.toUpperCase()}` });
  if (NOVA_POINTS[product.nova_group] !== undefined) parts.push({ key: "processing", label: "Processing", points: NOVA_POINTS[product.nova_group], max: 20, note: `NOVA ${product.nova_group}` });

  const hasIngredients = !!(product.ingredients_text || product.ingredients_text_en || (product.additives_tags || []).length);
  if (hasIngredients) {
    const pts = Math.max(0, 20 - analysis.avoidCount * 7 - analysis.cautionCount * 2.5);
    const n = analysis.hits.length;
    parts.push({ key: "additives", label: "Ingredients", points: Math.round(pts), max: 20, note: n ? `${n} flagged` : "Nothing flagged" });
  }

  if (!parts.some((p) => p.key === "nutrition" || p.key === "processing")) return null;

  const got = parts.reduce((a, p) => a + p.points, 0);
  const max = parts.reduce((a, p) => a + p.max, 0);
  let score = Math.round((got / max) * 100);
  const bonus = isOrganic(product) ? 5 : 0;
  score = Math.min(100, score + bonus);
  const capped = analysis.avoidCount > 0 && score > 49;
  if (capped) score = 49;

  const band = score >= 75 ? { id: "great", label: "Excellent" }
    : score >= 50 ? { id: "good", label: "Good" }
    : score >= 25 ? { id: "poor", label: "Poor" }
    : { id: "bad", label: "Bad" };

  return { score, band, parts, bonus, capped, partial: parts.length < 3 };
}

// ---------- NOVA "why" markers ----------

// OFF records which ingredients/additives pushed a product into each NOVA
// group. Surfacing the group-4 markers explains *why* it's ultra-processed.
function novaReasons(product, additiveInfo = {}) {
  const markers = product.nova_groups_markers?.[String(product.nova_group)] || [];
  const seen = new Set();
  return markers.map(([kind, tag]) => {
    let name = additiveInfo[tag]?.name || ADDITIVES[tag]?.name || tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");
    if (kind === "categories") name = `Category: ${name}`;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }).filter((n) => !seen.has(n) && seen.add(n)).slice(0, 12);
}

// ---------- Environmental impact ----------

function ecoInfo(product) {
  const data = product.environmental_score_data || product.ecoscore_data || {};
  const grade = product.environmental_score_grade || product.ecoscore_grade;
  const co2PerKg = data.agribalyse?.co2_total;
  const grams = present(product.product_quantity) ? Number(product.product_quantity) : null;
  const co2Pack = co2PerKg && grams ? co2PerKg * grams / 1000 : null;
  const packaging = (product.packagings || []).map((p) => ({
    shape: tagLabel(p.shape?.id || p.shape),
    material: tagLabel(p.material?.id || p.material),
    recycling: tagLabel(p.recycling?.id || p.recycling)
  })).filter((p) => p.shape || p.material);
  return {
    grade: grade && /^[a-e]$/.test(grade) ? grade : null,
    co2PerKg: co2PerKg ? round(co2PerKg, 2) : null,
    co2Pack: co2Pack ? round(co2Pack, 2) : null,
    // ~0.17 kg CO2e per km for an average petrol car.
    carKm: co2Pack ? round(co2Pack / 0.17, 1) : null,
    packaging
  };
}

function tagLabel(tag) {
  if (!tag || typeof tag !== "string") return null;
  const s = tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

if (typeof module !== "undefined") {
  module.exports = { analyzeProduct, buildNutrition, dailyValuePct, sugarTeaspoons, nutrientLevels, positives, goodLabels, profileAlerts, scanScore, novaReasons, ecoInfo, tagLabel };
}
