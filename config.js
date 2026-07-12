// Free key from https://fdc.nal.usda.gov/api-key-signup.html — takes about
// 30 seconds, just an email address. Used to backfill nutrition fields
// Open Food Facts is missing, verified against the scanned barcode.
//
// This file is public (static site, no backend) — that's expected for a
// free, rate-limited USDA key, not a secret credential. Worst case if
// someone else uses it is hitting the shared rate limit sooner.
const USDA_API_KEY = "";
