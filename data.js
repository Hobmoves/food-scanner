// Knowledge base for ingredient/additive flagging.
// tier: "avoid" (red, stronger evidence of concern) or "caution" (yellow, mixed/moderate evidence).
// Keys match Open Food Facts' additive tag format (en:e###) or plain lowercase
// substrings for text-matched ingredients (seed oils), which don't have OFF tags.

const ADDITIVES = {
  // --- Artificial dyes: several require an EU warning label ("may have an
  // adverse effect on activity and attention in children") ---
  "en:e102": { name: "Tartrazine (Yellow 5)", tier: "avoid", why: "Artificial dye; EU-mandated warning label for hyperactivity in children." },
  "en:e104": { name: "Quinoline Yellow", tier: "avoid", why: "Artificial dye; EU-mandated warning label for hyperactivity in children." },
  "en:e110": { name: "Sunset Yellow (Yellow 6)", tier: "avoid", why: "Artificial dye; EU-mandated warning label for hyperactivity in children." },
  "en:e122": { name: "Carmoisine", tier: "avoid", why: "Artificial dye; EU-mandated warning label for hyperactivity in children." },
  "en:e124": { name: "Ponceau 4R", tier: "avoid", why: "Artificial dye; EU-mandated warning label for hyperactivity in children." },
  "en:e127": { name: "Erythrosine (Red 3)", tier: "avoid", why: "Artificial dye; FDA revoked approval in food (2023) over cancer risk in animal studies." },
  "en:e129": { name: "Allura Red (Red 40)", tier: "avoid", why: "Artificial dye; EU-mandated warning label for hyperactivity in children." },
  "en:e131": { name: "Patent Blue V", tier: "caution", why: "Artificial dye; can trigger allergic reactions in sensitive individuals." },
  "en:e132": { name: "Indigo Carmine (Blue 2)", tier: "caution", why: "Artificial dye; some animal studies suggest tumor risk at high doses." },
  "en:e133": { name: "Brilliant Blue (Blue 1)", tier: "caution", why: "Artificial dye; generally well-studied but avoided by some for being purely cosmetic." },
  "en:e142": { name: "Green S", tier: "caution", why: "Artificial dye; banned in some countries outside the EU/US." },
  "en:e151": { name: "Brilliant Black", tier: "caution", why: "Artificial dye; EU-mandated warning label for hyperactivity in children." },

  // --- Preservatives / antioxidants ---
  "en:e211": { name: "Sodium Benzoate", tier: "caution", why: "Preservative; can form benzene (a carcinogen) when combined with vitamin C." },
  "en:e212": { name: "Potassium Benzoate", tier: "caution", why: "Preservative; same benzene-forming concern as sodium benzoate." },
  "en:e220": { name: "Sulfur Dioxide", tier: "caution", why: "Preservative; common trigger for asthma and sulfite sensitivity reactions." },
  "en:e249": { name: "Potassium Nitrite", tier: "avoid", why: "Curing agent; can form nitrosamines, linked to cancer risk in processed meat." },
  "en:e250": { name: "Sodium Nitrite", tier: "avoid", why: "Curing agent; can form nitrosamines, linked to cancer risk in processed meat." },
  "en:e251": { name: "Sodium Nitrate", tier: "avoid", why: "Curing agent; converts to nitrite, same cancer-risk concern." },
  "en:e319": { name: "TBHQ", tier: "caution", why: "Synthetic antioxidant; high-dose animal studies show liver/neurological effects." },
  "en:e320": { name: "BHA", tier: "avoid", why: "Synthetic antioxidant; listed as \"reasonably anticipated\" carcinogen by the US NTP." },
  "en:e321": { name: "BHT", tier: "caution", why: "Synthetic antioxidant; some studies suggest endocrine disruption at high doses." },

  // --- Caramel colors (4-MEI concern from high-heat processing) ---
  "en:e150c": { name: "Ammonia Caramel", tier: "caution", why: "Coloring; produced with ammonia, can contain trace 4-MEI (possible carcinogen)." },
  "en:e150d": { name: "Sulphite Ammonia Caramel", tier: "caution", why: "Coloring; the caramel type most associated with 4-MEI (possible carcinogen)." },

  // --- Emulsifiers / texturizers under scrutiny ---
  "en:carrageenan": { name: "Carrageenan", tier: "caution", why: "Thickener; animal/lab studies link it to gut inflammation, evidence still debated." },
  "en:e407": { name: "Carrageenan", tier: "caution", why: "Thickener; animal/lab studies link it to gut inflammation, evidence still debated." },
  "en:e433": { name: "Polysorbate 80", tier: "caution", why: "Emulsifier; mouse studies link it to disrupted gut microbiome." },
  "en:e466": { name: "CMC (Carboxymethylcellulose)", tier: "caution", why: "Thickener; mouse studies link it to disrupted gut microbiome." },

  // --- Flavor enhancers ---
  "en:e621": { name: "MSG (Monosodium Glutamate)", tier: "caution", why: "Flavor enhancer; generally recognized as safe, but some report headache/flushing sensitivity." },
  "en:e622": { name: "Monopotassium Glutamate", tier: "caution", why: "Flavor enhancer; same glutamate-sensitivity profile as MSG." },
  "en:e623": { name: "Calcium Glutamate", tier: "caution", why: "Flavor enhancer; same glutamate-sensitivity profile as MSG." },

  // --- Artificial sweeteners ---
  "en:e950": { name: "Acesulfame K", tier: "caution", why: "Artificial sweetener; some animal studies raise unresolved metabolic questions." },
  "en:e951": { name: "Aspartame", tier: "caution", why: "Artificial sweetener; WHO classified as \"possibly carcinogenic\" in 2023 (weak evidence)." },
  "en:e954": { name: "Saccharin", tier: "caution", why: "Artificial sweetener; early cancer concerns were later found not to apply to humans, but still debated." },
  "en:e955": { name: "Sucralose", tier: "caution", why: "Artificial sweetener; recent studies suggest possible gut microbiome and DNA-damage effects." }
};

// Seed oils aren't tagged as "additives" by Open Food Facts — they're plain
// ingredients — so they need a separate text search against ingredients_text
// rather than the additives_tags array. Concern: high omega-6 content and
// industrial extraction/refining process.
const SEED_OILS = [
  "soybean oil", "canola oil", "rapeseed oil", "corn oil", "cottonseed oil",
  "sunflower oil", "safflower oil", "grapeseed oil", "rice bran oil",
  "vegetable oil", "peanut oil"
];

if (typeof module !== "undefined") {
  module.exports = { ADDITIVES, SEED_OILS };
}
