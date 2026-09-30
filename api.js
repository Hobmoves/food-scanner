// All network calls live here. Every function is best-effort: secondary
// sources resolve to null/[] on failure rather than throwing, so one flaky
// API never blanks the page. Only the primary product lookup can throw.

// ---------- Low-level fetch with timeout + retry ----------

// Retries network errors, 429s and 5xx (OFF and Wikidata both throttle
// anonymous traffic in bursts — confirmed via testing). 404 is returned as-is
// because several APIs here use it to mean "no results".
async function fetchJSON(url, { retries = 2, timeout = 12000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 404) return { status: 404, data: null };
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await wait(600 * 2 ** attempt);
        continue;
      }
      if (!res.ok) return { status: res.status, data: null };
      return { status: res.status, data: await res.json() };
    } catch (err) {
      clearTimeout(timer);
      if (attempt < retries) {
        await wait(600 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Barcode normalization ----------

// GTIN mod-10 check digit, shared by EAN-8, UPC-A (GTIN-12), EAN-13 and
// GTIN-14.
function hasValidCheckDigit(code) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// UPC-E (the short 8-digit codes on small US packages) → UPC-A. The iOS
// barcode reader reports UPC-E as printed, but databases index the
// expanded 12-digit form.
function expandUpcE(code) {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0], d = code.slice(1, 7), check = code[7];
  const last = d[5];
  let body;
  if ("012".includes(last)) body = d.slice(0, 2) + last + "0000" + d.slice(2, 5);
  else if (last === "3") body = d.slice(0, 3) + "00000" + d.slice(3, 5);
  else if (last === "4") body = d.slice(0, 4) + "00000" + d[4];
  else body = d.slice(0, 5) + "0000" + last;
  return ns + body + check;
}

// Every plausible spelling of the same product code, most-likely first.
// Scanners and databases disagree about leading zeros (UPC-A 12 digits vs
// its EAN-13 form with a leading 0), so a strict single lookup misses
// products that are actually in the database.
function barcodeVariants(raw) {
  const code = String(raw).replace(/\D/g, "");
  const out = [code];
  if (code.length === 12) out.push("0" + code);
  if (code.length === 13 && code.startsWith("0")) out.push(code.slice(1));
  if (code.length === 14 && code.startsWith("0")) out.push(code.slice(1), code.slice(2));
  if (code.length === 8) {
    const upcA = expandUpcE(code);
    if (upcA) out.push(upcA, "0" + upcA);
  }
  if (code.length > 0 && code.length < 12 && code.length !== 8) out.push(code.padStart(13, "0"));
  return [...new Set(out)].filter(Boolean);
}

// ---------- Product lookup (Open Food Facts + sister databases) ----------

const OFF_FIELDS = [
  "code", "product_name", "product_name_en", "generic_name", "generic_name_en", "brands", "brands_tags", "brand_owner",
  "quantity", "serving_size", "serving_quantity", "product_quantity",
  "image_front_url", "image_url", "image_small_url", "image_ingredients_url", "image_nutrition_url",
  "nutriments", "nutrition_data_per", "nutriscore_grade", "nutriscore_score", "nutriscore_data",
  "nova_group", "nova_groups_markers",
  "ecoscore_grade", "ecoscore_score", "ecoscore_data",
  "environmental_score_grade", "environmental_score_score", "environmental_score_data",
  "additives_tags", "allergens_tags", "traces_tags", "labels_tags",
  "ingredients_text", "ingredients_text_en", "ingredients", "ingredients_n", "ingredients_analysis_tags",
  "nutrient_levels", "categories_tags", "categories", "countries_tags", "origins", "manufacturing_places",
  "packaging_tags", "packagings", "stores", "stores_tags", "unique_scans_n", "last_modified_t",
  "completeness", "product_type", "food_groups_tags", "pnns_groups_2"
].join(",");

// Open Food Facts first, then its sister projects — a barcode that isn't
// food (shampoo, dog food, batteries) otherwise just reads "not found".
const DATABASES = [
  { id: "food", name: "Open Food Facts", host: "world.openfoodfacts.org" },
  { id: "beauty", name: "Open Beauty Facts", host: "world.openbeautyfacts.org" },
  { id: "pet", name: "Open Pet Food Facts", host: "world.openpetfoodfacts.org" },
  { id: "products", name: "Open Products Facts", host: "world.openproductsfacts.org" }
];

async function lookupFromDb(db, code) {
  const { data } = await fetchJSON(`https://${db.host}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (data && data.status === 1 && data.product) return { product: data.product, db, code };
  return null;
}

async function lookupProduct(raw) {
  const variants = barcodeVariants(raw);
  if (!variants[0]) return { status: "invalid", variants };

  // Food DB: try each spelling in order (cheap, and the first usually hits).
  let lastError = null;
  for (const v of variants) {
    try {
      const hit = await lookupFromDb(DATABASES[0], v);
      if (hit) return { status: "found", ...hit, variants };
    } catch (err) {
      lastError = err;
    }
  }

  // Sister DBs in parallel, primary spelling only (plus EAN-13 form).
  const tries = [];
  for (const db of DATABASES.slice(1)) {
    for (const v of variants.slice(0, 2)) tries.push(lookupFromDb(db, v).catch(() => null));
  }
  const found = (await Promise.all(tries)).find(Boolean);
  if (found) return { status: "found", ...found, variants };

  if (lastError) throw lastError;
  return { status: "not-found", variants };
}

// ---------- Additive names (OFF taxonomy) ----------

// Official names/classes for every additive on the product — including
// ones our local knowledge base doesn't flag — so the Ingredients tab can
// list all of them, not just the concerning ones.
async function fetchAdditiveInfo(tags) {
  if (!tags || !tags.length) return {};
  try {
    const { data } = await fetchJSON(`https://world.openfoodfacts.org/api/v2/taxonomy?tagtype=additives&tags=${encodeURIComponent(tags.join(","))}&fields=name,additives_classes&lc=en`, { retries: 1 });
    const out = {};
    for (const [tag, info] of Object.entries(data || {})) {
      const classes = (info.additives_classes?.en || "")
        .split(",").map((s) => s.trim().replace(/^en:/, "").replace(/-/g, " ")).filter(Boolean);
      out[tag] = { name: info.name?.en || tag.replace(/^en:/, "").toUpperCase(), classes };
    }
    return out;
  } catch {
    return {};
  }
}

// ---------- FDA recalls (openFDA food enforcement) ----------

// The recall database has no dedicated barcode field, but `code_info` is
// free text that often includes the UPC ("UPC 0 12345 67890 1", "UPC Code:
// 012345678901"…). So two searches run in parallel:
//   1. exact barcode digits in code_info / product_description — a hit here
//      is a strong signal the recall covers THIS product
//   2. brand (and brand owner) name — broader, may include other products
// openFDA returns 404 for "no matches", which is not an error.
async function fetchRecalls(product, variants) {
  const clean = (s) => String(s || "").replace(/["+\\]/g, " ").trim();
  const brand = clean((product.brands || "").split(",")[0]);
  const owner = clean(product.brand_owner);

  const codeTerms = variants.filter((v) => v.length >= 12).slice(0, 3);
  const codeQuery = codeTerms.flatMap((c) => [`code_info:"${c}"`, `product_description:"${c}"`]).join("+");
  const nameTerms = [...new Set([brand, owner].filter((s) => s && s.length > 2))];
  const nameQuery = nameTerms.flatMap((n) => [`recalling_firm:"${n}"`, `product_description:"${n}"`]).join("+");

  const run = async (q, limit) => {
    if (!q) return [];
    try {
      const { data } = await fetchJSON(`https://api.fda.gov/food/enforcement.json?search=${encodeURIComponent(q).replace(/%2B/g, "+")}&limit=${limit}&sort=recall_initiation_date:desc`, { retries: 1 });
      return data?.results || [];
    } catch {
      return [];
    }
  };

  const [byCode, byName] = await Promise.all([run(codeQuery, 5), run(nameQuery, 10)]);
  const seen = new Set();
  const tag = (list, match) => list.map((r) => ({ ...r, match })).filter((r) => {
    if (seen.has(r.recall_number)) return false;
    seen.add(r.recall_number);
    return true;
  });
  return [...tag(byCode, "barcode"), ...tag(byName, "brand")];
}

// ---------- Crowdsourced prices (Open Prices) ----------

async function fetchPrices(variants) {
  try {
    for (const code of variants.slice(0, 2)) {
      const { data } = await fetchJSON(`https://prices.openfoodfacts.org/api/v1/prices?product_code=${encodeURIComponent(code)}&size=12&order_by=-date`, { retries: 1 });
      if (data?.items?.length) return data.items;
    }
  } catch {}
  return [];
}

// ---------- Brand ownership (Wikidata + Wikipedia) ----------

const WIKIDATA = "https://www.wikidata.org/w/api.php";
const BRANDISH = /brand|company|manufacturer|producer|food|beverage|drink|snack|corporation|business|conglomerate|cereal|chocolate|confection|dairy|bakery|brewery|soft drink|candy|retail|supermarket|private label|subsidiary|cooperative/i;

async function wikidataEntities(ids) {
  const { data } = await fetchJSON(`${WIKIDATA}?action=wbgetentities&ids=${ids.join("|")}&props=labels|descriptions|claims|sitelinks&languages=en&sitefilter=enwiki&format=json&origin=*`, { retries: 2 });
  return data?.entities || {};
}

const claimIds = (entity, prop) => (entity?.claims?.[prop] || [])
  .filter((c) => c.rank !== "deprecated")
  .map((c) => c.mainsnak?.datavalue?.value?.id)
  .filter(Boolean);

const claimYear = (entity, prop) => {
  const t = entity?.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value?.time;
  return t ? parseInt(t.slice(1, 5), 10) : null;
};

// Brand → owner → owner's parent, e.g. Doritos → Frito-Lay → PepsiCo.
// Only accepts a Wikidata match whose label equals the brand and whose
// description looks like a brand/company — a wrong match would confidently
// attribute the product to an unrelated company, which is worse than
// showing nothing.
async function fetchBrandInfo(product) {
  const brand = (product.brands || "").split(",")[0].trim();
  if (!brand || brand.length < 2) return null;
  try {
    const { data } = await fetchJSON(`${WIKIDATA}?action=wbsearchentities&search=${encodeURIComponent(brand)}&language=en&type=item&limit=7&format=json&origin=*`, { retries: 2 });
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const candidate = (data?.search || []).find((r) =>
      (norm(r.label) === norm(brand) || norm(r.match?.text) === norm(brand)) && BRANDISH.test(r.description || ""));
    if (!candidate) return null;

    // Owner and country are fetched together with each hop to keep the
    // request count low (Wikidata rate-limits bursts).
    const entities = await wikidataEntities([candidate.id]);
    const root = entities[candidate.id];
    const nextOwner = (e, visited) => [...claimIds(e, "P127"), ...claimIds(e, "P749"), ...claimIds(e, "P176")].find((id) => !visited.has(id));
    const visited = new Set([candidate.id]);
    const countryId = claimIds(root, "P495")[0] || claimIds(root, "P17")[0];

    const chain = [];
    let country = null;
    let current = root;
    for (let depth = 0; depth < 3 && current; depth++) {
      const nextId = nextOwner(current, visited);
      const ids = [nextId, depth === 0 ? countryId : null].filter(Boolean);
      if (!ids.length) break;
      let ents;
      try { ents = await wikidataEntities(ids); } catch { break; } // keep what we have
      if (depth === 0 && countryId) country = ents[countryId]?.labels?.en?.value || null;
      if (!nextId) break;
      visited.add(nextId);
      const next = ents[nextId];
      if (!next) break;
      chain.push({
        id: nextId,
        name: next.labels?.en?.value || nextId,
        description: next.descriptions?.en?.value || "",
        wiki: next.sitelinks?.enwiki?.title || null
      });
      current = next;
    }

    const wikiTitle = root?.sitelinks?.enwiki?.title;
    let summary = null;
    if (wikiTitle) {
      try {
        const { data: s } = await fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`, { retries: 1 });
        if (s && s.type === "standard") {
          summary = { extract: s.extract, url: s.content_urls?.mobile?.page || s.content_urls?.desktop?.page, thumb: s.thumbnail?.source || null };
        }
      } catch {}
    }

    return {
      id: candidate.id,
      name: root?.labels?.en?.value || brand,
      description: root?.descriptions?.en?.value || candidate.description || "",
      founded: claimYear(root, "P571"),
      country,
      chain,
      summary
    };
  } catch {
    return null;
  }
}

// ---------- USDA FoodData Central (nutrition backfill) ----------

// Standard USDA nutrient numbers (stable across their datasets, unlike the
// internal numeric nutrientId). Sodium is converted to salt (g) to match
// Open Food Facts' units: salt = sodium(mg) * 2.5 / 1000.
const USDA_NUTRIENT_NUMBERS = {
  energy: "208", fat: "204", satFat: "606", transFat: "605", cholesterol: "601",
  carbs: "205", sugars: "269", addedSugars: "539", fiber: "291", protein: "203",
  sodium: "307", calcium: "301", iron: "303", potassium: "306", vitaminD: "328"
};

// USDA's Branded Foods dataset carries real gtinUpc values, but barcode
// digit-count/leading-zero conventions differ between UPC-A and EAN-13, so
// results are normalized (leading zeros stripped) before matching rather
// than trusting the first search hit — a mismatch here would show the wrong
// product's nutrition data, which is worse than showing none.
async function fetchUSDA(barcode) {
  if (typeof USDA_API_KEY === "undefined" || !USDA_API_KEY) return null;
  const normalize = (s) => String(s || "").replace(/^0+/, "");
  try {
    const { data } = await fetchJSON(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(USDA_API_KEY)}&query=${encodeURIComponent(barcode)}&dataType=Branded&pageSize=5`, { retries: 1 });
    const match = (data?.foods || []).find((f) => normalize(f.gtinUpc) === normalize(barcode));
    if (!match) return null;

    const byNumber = {};
    for (const n of match.foodNutrients || []) byNumber[n.nutrientNumber] = n.value;
    const out = {};
    for (const [key, num] of Object.entries(USDA_NUTRIENT_NUMBERS)) {
      if (byNumber[num] !== undefined) out[key] = byNumber[num];
    }
    if (out.sodium !== undefined) out.salt = Math.round((out.sodium * 2.5 / 1000) * 100) / 100;
    out.ingredients = match.ingredients || null;
    out.householdServing = match.householdServingFullText || null;
    return out;
  } catch {
    return null;
  }
}

// ---------- Swap suggestions ----------

const GRADE_RANK = { a: 0, b: 1, c: 2, d: 3, e: 4 };

// Most-specific VALID English category tag — not just the last array entry,
// which can be a mislabeled non-English duplicate (confirmed via testing).
function bestCategoryTag(product) {
  const tags = product.categories_tags || [];
  return [...tags].reverse().find((t) => /^en:[a-z0-9-]+$/.test(t)) || null;
}

function swapsApplicable(product) {
  if (!bestCategoryTag(product)) return false;
  return product.nutriscore_grade !== "a" || product.nova_group === 4;
}

// Swap suggestions only make sense when Open Food Facts has a category to
// search within, and only when the scanned product isn't already top-tier.
//
// The grade filter is deliberately NOT sent as a query param — OFF's
// categories_tags field mixes valid English tags with mislabeled French
// ones (confirmed via testing, e.g. Nutella's last tag is "en:Pâtes à
// tartiner"), so grade comparison happens client-side instead.
//
// "Better" = strictly better Nutri-Score, or same grade but less processed
// (lower NOVA). If the most specific category has nothing better, the next
// broader category is tried once.
//
// Returns a status alongside the items so the UI can tell "genuinely no
// better alternatives" apart from "the request failed/got rate-limited".
async function fetchSwaps(product, currentCode) {
  if (!swapsApplicable(product)) return { status: "not-applicable", items: [] };
  const currentRank = GRADE_RANK[product.nutriscore_grade] ?? 5;
  const currentNova = product.nova_group || 5;
  const englishCats = (product.categories_tags || []).filter((t) => /^en:[a-z0-9-]+$/.test(t)).reverse().slice(0, 2);

  const isBetter = (p) => {
    const r = GRADE_RANK[p.nutriscore_grade] ?? 5;
    if (r < currentRank) return true;
    return r === currentRank && r <= 1 && (p.nova_group || 5) < currentNova;
  };

  let anyOk = false;
  for (const category of englishCats) {
    try {
      const url = `https://world.openfoodfacts.org/api/v2/search?categories_tags=${encodeURIComponent(category)}&fields=code,product_name,brands,nutriscore_grade,nova_group,image_small_url,stores_tags,unique_scans_n,additives_n&page_size=40&sort_by=nutriscore_score`;
      const { data } = await fetchJSON(url, { retries: 2 });
      if (!data) continue;
      anyOk = true;

      const items = (data.products || [])
        .filter((p) => p.code !== currentCode && p.product_name && isBetter(p))
        .map((p) => {
          const storesText = (p.stores_tags || []).join(" ").toLowerCase();
          const matchedStore = BIG_STORES.find((s) => storesText.includes(s.toLowerCase())) || null;
          return { ...p, matchedStore, scans: p.unique_scans_n || 0 };
        })
        .sort((a, b) => {
          const gradeDiff = (GRADE_RANK[a.nutriscore_grade] ?? 5) - (GRADE_RANK[b.nutriscore_grade] ?? 5);
          if (gradeDiff !== 0) return gradeDiff;
          const novaDiff = (a.nova_group || 5) - (b.nova_group || 5);
          if (novaDiff !== 0) return novaDiff;
          const storeDiff = (b.matchedStore ? 1 : 0) - (a.matchedStore ? 1 : 0);
          if (storeDiff !== 0) return storeDiff;
          return b.scans - a.scans;
        })
        .slice(0, 4);

      if (items.length) return { status: "ok", items, category };
    } catch {}
  }
  return { status: anyOk ? "ok" : "error", items: [] };
}

if (typeof module !== "undefined") {
  module.exports = { hasValidCheckDigit, expandUpcE, barcodeVariants, bestCategoryTag, swapsApplicable, GRADE_RANK };
}
