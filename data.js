// Knowledge base for ingredient/additive flagging.
// tier: "avoid" (red, stronger evidence of concern) or "caution" (yellow, mixed/moderate evidence).
// group: short label used to cluster flags in the UI.
// Keys match Open Food Facts' additive tag format (en:e###). Additives not
// listed here still show up in the Ingredients tab with their official name
// (looked up live from the OFF taxonomy) — they just aren't flagged.

const ADDITIVES = {
  // --- Artificial dyes: the "Southampton six" (E102, E104, E110, E122, E124,
  // E129) require an EU warning label ("may have an adverse effect on
  // activity and attention in children") ---
  "en:e102": { name: "Tartrazine (Yellow 5)", tier: "avoid", group: "Dye", why: "Artificial dye; EU-mandated warning label for hyperactivity in children." },
  "en:e104": { name: "Quinoline Yellow", tier: "avoid", group: "Dye", why: "Artificial dye; EU-mandated warning label for hyperactivity in children. Not permitted in US food." },
  "en:e110": { name: "Sunset Yellow (Yellow 6)", tier: "avoid", group: "Dye", why: "Artificial dye; EU-mandated warning label for hyperactivity in children." },
  "en:e122": { name: "Carmoisine", tier: "avoid", group: "Dye", why: "Artificial dye; EU-mandated warning label for hyperactivity in children. Not permitted in US food." },
  "en:e123": { name: "Amaranth (Red 2)", tier: "avoid", group: "Dye", why: "Artificial dye; banned in US food since 1976 over cancer concerns in animal studies." },
  "en:e124": { name: "Ponceau 4R", tier: "avoid", group: "Dye", why: "Artificial dye; EU-mandated warning label for hyperactivity in children. Not permitted in US food." },
  "en:e127": { name: "Erythrosine (Red 3)", tier: "avoid", group: "Dye", why: "Artificial dye; FDA revoked its food authorization in January 2025 over cancer findings in animal studies." },
  "en:e128": { name: "Red 2G", tier: "avoid", group: "Dye", why: "Artificial dye; withdrawn in the EU (2007) after it was found to break down into a likely carcinogen." },
  "en:e129": { name: "Allura Red (Red 40)", tier: "avoid", group: "Dye", why: "Artificial dye; EU-mandated warning label for hyperactivity in children." },
  "en:e131": { name: "Patent Blue V", tier: "caution", group: "Dye", why: "Artificial dye; can trigger allergic reactions in sensitive individuals." },
  "en:e132": { name: "Indigo Carmine (Blue 2)", tier: "caution", group: "Dye", why: "Artificial dye; some animal studies suggest tumor risk at high doses." },
  "en:e133": { name: "Brilliant Blue (Blue 1)", tier: "caution", group: "Dye", why: "Artificial dye; well-studied, but purely cosmetic and being phased out of US food." },
  "en:e142": { name: "Green S", tier: "caution", group: "Dye", why: "Artificial dye; banned in several countries including the US." },
  "en:e143": { name: "Fast Green (Green 3)", tier: "caution", group: "Dye", why: "Artificial dye; banned in the EU; limited safety data." },
  "en:e151": { name: "Brilliant Black", tier: "caution", group: "Dye", why: "Azo dye; banned in the US and several other countries." },
  "en:e155": { name: "Brown HT", tier: "caution", group: "Dye", why: "Azo dye; not permitted in the US; can trigger intolerance in aspirin-sensitive people." },
  "en:e120": { name: "Carmine (Cochineal)", tier: "caution", group: "Dye", why: "Insect-derived red dye; documented cause of severe allergic reactions. Not vegan." },
  "en:e171": { name: "Titanium Dioxide", tier: "avoid", group: "Dye", why: "Whitening agent; banned in EU food since 2022 after EFSA couldn't rule out DNA damage." },
  "en:e173": { name: "Aluminium", tier: "caution", group: "Dye", why: "Metallic coloring; aluminium intake is limited by EFSA over neurological concerns." },

  // --- Caramel colors (4-MEI concern from high-heat processing) ---
  "en:e150c": { name: "Ammonia Caramel", tier: "caution", group: "Dye", why: "Coloring; produced with ammonia, can contain trace 4-MEI (possible carcinogen)." },
  "en:e150d": { name: "Sulphite Ammonia Caramel", tier: "caution", group: "Dye", why: "Coloring; the caramel type most associated with 4-MEI (possible carcinogen)." },

  // --- Preservatives ---
  "en:e211": { name: "Sodium Benzoate", tier: "caution", group: "Preservative", why: "Preservative; can form benzene (a carcinogen) when combined with vitamin C." },
  "en:e212": { name: "Potassium Benzoate", tier: "caution", group: "Preservative", why: "Preservative; same benzene-forming concern as sodium benzoate." },
  "en:e214": { name: "Ethylparaben", tier: "caution", group: "Preservative", why: "Paraben preservative; parabens show weak hormone-like activity in lab studies." },
  "en:e215": { name: "Sodium Ethylparaben", tier: "caution", group: "Preservative", why: "Paraben preservative; parabens show weak hormone-like activity in lab studies." },
  "en:e216": { name: "Propylparaben", tier: "avoid", group: "Preservative", why: "Paraben; removed from the EU food additive list in 2006 over reproductive effects in animals." },
  "en:e218": { name: "Methylparaben", tier: "caution", group: "Preservative", why: "Paraben preservative; parabens show weak hormone-like activity in lab studies." },
  "en:e220": { name: "Sulfur Dioxide", tier: "caution", group: "Preservative", why: "Sulfite; common trigger for asthma and sulfite-sensitivity reactions." },
  "en:e221": { name: "Sodium Sulfite", tier: "caution", group: "Preservative", why: "Sulfite; common trigger for asthma and sulfite-sensitivity reactions." },
  "en:e222": { name: "Sodium Bisulfite", tier: "caution", group: "Preservative", why: "Sulfite; common trigger for asthma and sulfite-sensitivity reactions." },
  "en:e223": { name: "Sodium Metabisulfite", tier: "caution", group: "Preservative", why: "Sulfite; common trigger for asthma and sulfite-sensitivity reactions." },
  "en:e224": { name: "Potassium Metabisulfite", tier: "caution", group: "Preservative", why: "Sulfite; common trigger for asthma and sulfite-sensitivity reactions." },
  "en:e226": { name: "Calcium Sulfite", tier: "caution", group: "Preservative", why: "Sulfite; common trigger for asthma and sulfite-sensitivity reactions." },
  "en:e228": { name: "Potassium Bisulfite", tier: "caution", group: "Preservative", why: "Sulfite; common trigger for asthma and sulfite-sensitivity reactions." },
  "en:e239": { name: "Hexamine", tier: "caution", group: "Preservative", why: "Preservative; releases formaldehyde. Restricted to a single cheese use in the EU." },
  "en:e249": { name: "Potassium Nitrite", tier: "avoid", group: "Preservative", why: "Curing agent; can form nitrosamines, linked to cancer risk in processed meat." },
  "en:e250": { name: "Sodium Nitrite", tier: "avoid", group: "Preservative", why: "Curing agent; can form nitrosamines, linked to cancer risk in processed meat." },
  "en:e251": { name: "Sodium Nitrate", tier: "avoid", group: "Preservative", why: "Curing agent; converts to nitrite, same cancer-risk concern." },
  "en:e252": { name: "Potassium Nitrate", tier: "avoid", group: "Preservative", why: "Curing agent; converts to nitrite, same cancer-risk concern." },
  "en:e284": { name: "Boric Acid", tier: "caution", group: "Preservative", why: "Preservative; EU classifies boric acid as toxic to reproduction. Restricted to caviar." },
  "en:e285": { name: "Borax", tier: "caution", group: "Preservative", why: "Preservative; EU classifies it as toxic to reproduction. Restricted to caviar." },

  // --- Antioxidants ---
  "en:e310": { name: "Propyl Gallate", tier: "caution", group: "Antioxidant", why: "Synthetic antioxidant; possible endocrine effects in lab studies." },
  "en:e311": { name: "Octyl Gallate", tier: "caution", group: "Antioxidant", why: "Synthetic antioxidant; can cause skin/allergic sensitivity." },
  "en:e312": { name: "Dodecyl Gallate", tier: "caution", group: "Antioxidant", why: "Synthetic antioxidant; can cause skin/allergic sensitivity." },
  "en:e319": { name: "TBHQ", tier: "caution", group: "Antioxidant", why: "Synthetic antioxidant; high-dose animal studies show liver/immune effects." },
  "en:e320": { name: "BHA", tier: "avoid", group: "Antioxidant", why: "Synthetic antioxidant; listed as \"reasonably anticipated\" carcinogen by the US NTP." },
  "en:e321": { name: "BHT", tier: "caution", group: "Antioxidant", why: "Synthetic antioxidant; some studies suggest endocrine disruption at high doses." },
  "en:e385": { name: "Calcium Disodium EDTA", tier: "caution", group: "Antioxidant", why: "Chelating agent; binds minerals, poorly absorbed; high doses affect mineral balance." },

  // --- Phosphates / acids ---
  "en:e338": { name: "Phosphoric Acid", tier: "caution", group: "Acid / Phosphate", why: "Acidulant (typical in colas); observational studies link high intake to lower bone density." },
  "en:e339": { name: "Sodium Phosphates", tier: "caution", group: "Acid / Phosphate", why: "Added phosphate; highly absorbable, and high phosphate intake is linked to heart and kidney strain." },
  "en:e340": { name: "Potassium Phosphates", tier: "caution", group: "Acid / Phosphate", why: "Added phosphate; highly absorbable, and high phosphate intake is linked to heart and kidney strain." },
  "en:e341": { name: "Calcium Phosphates", tier: "caution", group: "Acid / Phosphate", why: "Added phosphate; contributes to total phosphate load." },
  "en:e450": { name: "Diphosphates", tier: "caution", group: "Acid / Phosphate", why: "Added phosphate; highly absorbable, and high phosphate intake is linked to heart and kidney strain." },
  "en:e451": { name: "Triphosphates", tier: "caution", group: "Acid / Phosphate", why: "Added phosphate; highly absorbable, and high phosphate intake is linked to heart and kidney strain." },
  "en:e452": { name: "Polyphosphates", tier: "caution", group: "Acid / Phosphate", why: "Added phosphate; highly absorbable, and high phosphate intake is linked to heart and kidney strain." },
  "en:e541": { name: "Sodium Aluminium Phosphate", tier: "caution", group: "Acid / Phosphate", why: "Leavening agent; a source of dietary aluminium." },

  // --- Emulsifiers / texturizers under scrutiny ---
  "en:carrageenan": { name: "Carrageenan", tier: "caution", group: "Emulsifier", why: "Thickener; animal/lab studies link it to gut inflammation, evidence still debated." },
  "en:e407": { name: "Carrageenan", tier: "caution", group: "Emulsifier", why: "Thickener; animal/lab studies link it to gut inflammation, evidence still debated." },
  "en:e407a": { name: "Processed Eucheuma Seaweed", tier: "caution", group: "Emulsifier", why: "Carrageenan-type thickener; same gut-inflammation questions." },
  "en:e432": { name: "Polysorbate 20", tier: "caution", group: "Emulsifier", why: "Emulsifier; the polysorbate family is linked to gut microbiome disruption in mouse studies." },
  "en:e433": { name: "Polysorbate 80", tier: "caution", group: "Emulsifier", why: "Emulsifier; mouse studies link it to disrupted gut microbiome and inflammation." },
  "en:e435": { name: "Polysorbate 60", tier: "caution", group: "Emulsifier", why: "Emulsifier; the polysorbate family is linked to gut microbiome disruption in mouse studies." },
  "en:e436": { name: "Polysorbate 65", tier: "caution", group: "Emulsifier", why: "Emulsifier; the polysorbate family is linked to gut microbiome disruption in mouse studies." },
  "en:e466": { name: "CMC (Carboxymethylcellulose)", tier: "caution", group: "Emulsifier", why: "Thickener; a 2022 human trial found it altered gut bacteria and nutrient levels." },
  "en:e471": { name: "Mono- & Diglycerides", tier: "caution", group: "Emulsifier", why: "Emulsifier; can carry hidden trans fats, and a large French cohort (2023) linked it to higher heart-disease risk." },
  "en:e476": { name: "PGPR", tier: "caution", group: "Emulsifier", why: "Emulsifier (often replaces cocoa butter); considered safe at normal levels but signals a cost-cut recipe." },

  // --- Flavor enhancers ---
  "en:e621": { name: "MSG (Monosodium Glutamate)", tier: "caution", group: "Flavor Enhancer", why: "Flavor enhancer; generally recognized as safe, but some report headache/flushing sensitivity." },
  "en:e622": { name: "Monopotassium Glutamate", tier: "caution", group: "Flavor Enhancer", why: "Flavor enhancer; same glutamate-sensitivity profile as MSG." },
  "en:e623": { name: "Calcium Glutamate", tier: "caution", group: "Flavor Enhancer", why: "Flavor enhancer; same glutamate-sensitivity profile as MSG." },
  "en:e627": { name: "Disodium Guanylate", tier: "caution", group: "Flavor Enhancer", why: "Flavor enhancer (usually paired with MSG); a purine, so best avoided with gout." },
  "en:e631": { name: "Disodium Inosinate", tier: "caution", group: "Flavor Enhancer", why: "Flavor enhancer (usually paired with MSG); a purine, so best avoided with gout." },
  "en:e635": { name: "Disodium Ribonucleotides", tier: "caution", group: "Flavor Enhancer", why: "Flavor enhancer; purine-based, linked to itchy rashes in some people and best avoided with gout." },

  // --- Flour treatments ---
  "en:e924": { name: "Potassium Bromate", tier: "avoid", group: "Flour Treatment", why: "Dough conditioner; IARC possible carcinogen, banned in the EU, UK, Canada and California (from 2027)." },
  "en:e927a": { name: "Azodicarbonamide", tier: "avoid", group: "Flour Treatment", why: "Dough conditioner; banned in the EU; breaks down into semicarbazide, a suspected carcinogen." },

  // --- Sweeteners ---
  "en:e420": { name: "Sorbitol", tier: "caution", group: "Sweetener", why: "Sugar alcohol; laxative effect and bloating at moderate doses." },
  "en:e950": { name: "Acesulfame K", tier: "caution", group: "Sweetener", why: "Artificial sweetener; some animal studies raise unresolved metabolic questions." },
  "en:e951": { name: "Aspartame", tier: "caution", group: "Sweetener", why: "Artificial sweetener; WHO classified as \"possibly carcinogenic\" in 2023 (weak evidence)." },
  "en:e952": { name: "Cyclamate", tier: "caution", group: "Sweetener", why: "Artificial sweetener; banned in the US since 1969 over animal bladder-cancer studies." },
  "en:e954": { name: "Saccharin", tier: "caution", group: "Sweetener", why: "Artificial sweetener; early cancer concerns were later found not to apply to humans, but still debated." },
  "en:e955": { name: "Sucralose", tier: "caution", group: "Sweetener", why: "Artificial sweetener; recent studies suggest possible gut microbiome and DNA-damage effects." },
  "en:e961": { name: "Neotame", tier: "caution", group: "Sweetener", why: "Artificial sweetener; a 2023 lab study found it damaged gut cells and bacteria." },
  "en:e962": { name: "Aspartame-Acesulfame Salt", tier: "caution", group: "Sweetener", why: "Blend of aspartame and acesulfame K; inherits both sets of questions." },
  "en:e965": { name: "Maltitol", tier: "caution", group: "Sweetener", why: "Sugar alcohol; raises blood sugar more than others and has a strong laxative effect." },
  "en:e968": { name: "Erythritol", tier: "caution", group: "Sweetener", why: "Sugar alcohol; a 2023 Nature Medicine study linked high blood levels to clotting and heart events." }
};

// Plain-text ingredient patterns that don't reliably get an additive tag in
// Open Food Facts. Matched case-insensitively against ingredients_text.
// `pref` ties a pattern to a toggle in the user's profile (see PREFERENCES).
const INGREDIENT_FLAGS = [
  { match: ["partially hydrogenated"], name: "Partially Hydrogenated Oil", tier: "avoid", group: "Fat", why: "Source of artificial trans fat — FDA revoked its safe status in 2015; no safe intake level." },
  { match: ["brominated vegetable oil"], name: "Brominated Vegetable Oil", tier: "avoid", group: "Fat", why: "FDA revoked authorization in 2024 after thyroid effects in animal studies." },
  { match: ["potassium bromate", "bromated flour"], name: "Potassium Bromate", tier: "avoid", group: "Flour Treatment", why: "Dough conditioner; IARC possible carcinogen, banned in the EU, UK and Canada." },
  { match: ["high fructose corn syrup", "glucose-fructose syrup", "fructose-glucose syrup", "glucose fructose syrup"], name: "High-Fructose Corn Syrup", tier: "caution", group: "Sugar", why: "Cheap added sugar; heavy intake linked to fatty liver and metabolic issues." },
  { match: ["fully hydrogenated", "hydrogenated vegetable", "hydrogenated palm", "hydrogenated soybean", "hydrogenated cottonseed"], exclude: ["partially hydrogenated"], name: "Hydrogenated Oil", tier: "caution", group: "Fat", why: "Hardened fat; fully hydrogenated oils contain little trans fat but are highly processed." },
  { match: ["interesterified"], name: "Interesterified Fat", tier: "caution", group: "Fat", why: "Chemically rearranged fat used as a trans-fat replacement; long-term effects are poorly studied." },
  { match: ["artificial flavor", "artificial flavour", "artificial flavoring"], name: "Artificial Flavor", tier: "caution", group: "Flavor", why: "Undisclosed lab-made flavor blend; manufacturers aren't required to list its components." },
  { match: ["palm oil", "palm kernel", "palm fat", "palmolein"], name: "Palm Oil", tier: "caution", group: "Fat", pref: "flagPalm", why: "High in saturated fat, and a major driver of tropical deforestation." },
  { match: ["soybean oil", "soya oil", "soy oil"], name: "Soybean Oil", tier: "caution", group: "Seed Oil", pref: "flagSeedOils", why: "Seed oil; high omega-6 content and heavily industrially refined." },
  { match: ["canola oil", "rapeseed oil"], name: "Canola Oil", tier: "caution", group: "Seed Oil", pref: "flagSeedOils", why: "Seed oil; industrially refined with solvents and high heat." },
  { match: ["corn oil"], name: "Corn Oil", tier: "caution", group: "Seed Oil", pref: "flagSeedOils", why: "Seed oil; very high omega-6 to omega-3 ratio." },
  { match: ["cottonseed oil"], name: "Cottonseed Oil", tier: "caution", group: "Seed Oil", pref: "flagSeedOils", why: "Seed oil; high omega-6, from a crop heavily treated with pesticides." },
  { match: ["sunflower oil"], name: "Sunflower Oil", tier: "caution", group: "Seed Oil", pref: "flagSeedOils", why: "Seed oil; high omega-6 content (unless labeled high-oleic)." },
  { match: ["safflower oil"], name: "Safflower Oil", tier: "caution", group: "Seed Oil", pref: "flagSeedOils", why: "Seed oil; high omega-6 content (unless labeled high-oleic)." },
  { match: ["grapeseed oil"], name: "Grapeseed Oil", tier: "caution", group: "Seed Oil", pref: "flagSeedOils", why: "Seed oil; one of the highest omega-6 contents of any oil." },
  { match: ["rice bran oil"], name: "Rice Bran Oil", tier: "caution", group: "Seed Oil", pref: "flagSeedOils", why: "Seed oil; industrially refined." },
  { match: ["vegetable oil"], name: "Vegetable Oil (Unspecified)", tier: "caution", group: "Seed Oil", pref: "flagSeedOils", why: "Usually a blend of refined seed oils; the label doesn't say which." },
  { match: ["peanut oil", "groundnut oil"], name: "Peanut Oil", tier: "caution", group: "Seed Oil", pref: "flagSeedOils", why: "Seed oil; high omega-6 content." }
];

// Allergens the profile can watch for. `tags` are OFF allergen/trace tags.
const ALLERGENS = [
  { id: "gluten", label: "Gluten", tags: ["en:gluten"] },
  { id: "milk", label: "Dairy", tags: ["en:milk"] },
  { id: "eggs", label: "Eggs", tags: ["en:eggs"] },
  { id: "peanuts", label: "Peanuts", tags: ["en:peanuts"] },
  { id: "nuts", label: "Tree Nuts", tags: ["en:nuts"] },
  { id: "soybeans", label: "Soy", tags: ["en:soybeans"] },
  { id: "fish", label: "Fish", tags: ["en:fish"] },
  { id: "crustaceans", label: "Shellfish", tags: ["en:crustaceans", "en:molluscs"] },
  { id: "sesame", label: "Sesame", tags: ["en:sesame-seeds"] },
  { id: "mustard", label: "Mustard", tags: ["en:mustard"] },
  { id: "celery", label: "Celery", tags: ["en:celery"] },
  { id: "sulphites", label: "Sulfites", tags: ["en:sulphur-dioxide-and-sulphites"] },
  { id: "lupin", label: "Lupin", tags: ["en:lupin"] }
];

const DIETS = [
  { id: "vegan", label: "Vegan", tag: "en:non-vegan", maybe: "en:maybe-vegan", unknown: "en:vegan-status-unknown" },
  { id: "vegetarian", label: "Vegetarian", tag: "en:non-vegetarian", maybe: "en:maybe-vegetarian", unknown: "en:vegetarian-status-unknown" },
  { id: "palmfree", label: "Palm-oil free", tag: "en:palm-oil", maybe: "en:may-contain-palm-oil", unknown: "en:palm-oil-content-unknown" }
];

// Toggles in the profile sheet (besides allergens/diets). Defaults are
// the behavior before profiles existed, so nothing changes silently.
const PREFERENCES = [
  { id: "flagSeedOils", label: "Flag seed oils", default: true },
  { id: "flagPalm", label: "Flag palm oil", default: true }
];

// Label tags worth surfacing as positives.
const GOOD_LABELS = {
  "en:organic": "Organic",
  "en:usda-organic": "USDA Organic",
  "en:eu-organic": "EU Organic",
  "en:no-gmos": "Non-GMO",
  "en:non-gmo-project": "Non-GMO Project",
  "en:fair-trade": "Fair Trade",
  "en:fairtrade-international": "Fairtrade",
  "en:rainforest-alliance": "Rainforest Alliance",
  "en:gluten-free": "Gluten-Free",
  "en:no-added-sugar": "No Added Sugar",
  "en:no-preservatives": "No Preservatives",
  "en:no-artificial-flavors": "No Artificial Flavors",
  "en:no-colorings": "No Colorings",
  "en:whole-grain": "Whole Grain",
  "en:grass-fed": "Grass-Fed",
  "en:free-range": "Free Range",
  "en:msc": "MSC Sustainable Fish",
  "en:kosher": "Kosher",
  "en:halal": "Halal",
  "en:vegan": "Vegan",
  "en:vegetarian": "Vegetarian"
};

// US FDA Daily Values (2020 label rules), in the unit shown on the label.
const DAILY_VALUES = {
  fat: 78, satFat: 20, cholesterol: 300, sodium: 2300, carbs: 275,
  fiber: 28, addedSugars: 50, protein: 50,
  vitaminD: 20, calcium: 1300, iron: 18, potassium: 4700
};

// Matched case-insensitively as substrings against each candidate's
// stores_tags entries. That field is crowdsourced and noisy (sometimes
// contains manufacturer address fragments instead of real store names —
// confirmed via testing), but a real retailer name, when present, matches
// cleanly as a substring regardless of that surrounding noise.
const BIG_STORES = [
  "Costco", "Whole Foods", "Target", "Walmart", "Kroger", "Trader Joe",
  "Safeway", "Publix", "Albertsons", "Sam's Club", "Aldi", "Sprouts",
  "Wegmans", "H-E-B", "Meijer"
];

if (typeof module !== "undefined") {
  module.exports = { ADDITIVES, INGREDIENT_FLAGS, ALLERGENS, DIETS, PREFERENCES, GOOD_LABELS, DAILY_VALUES, BIG_STORES };
}
