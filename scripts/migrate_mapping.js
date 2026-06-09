/**
 * MIGRATION: Re-index _mapping.json to use correct product IDs from products-data.js
 *
 * The image scraper (find_image_urls.js) was assigning its own IDs from Excel,
 * which didn't match the IDs in products-data.js (because generate_website_data.js
 * filters out rows with invalid prices). This caused a +2 ID offset for many products.
 *
 * This migration fixes existing _mapping.json by matching product NAMES from
 * _mapping.json against products-data.js, then re-assigning to the correct ID.
 *
 * Usage: node scripts/migrate_mapping.js
 */

const fs = require('fs');
const path = require('path');

// Load products-data.js (source of truth)
const { products } = require(path.join(__dirname, '..', 'products-data.js'));

// Build lookup: product name (uppercase) -> correct id from products-data.js
const nameToId = new Map();
const idToName = new Map();
for (const p of products) {
  const key = p.name.toUpperCase().trim();
  nameToId.set(key, p.id);
  idToName.set(p.id, p.name);
}

// Load existing _mapping.json
const mappingPath = path.join(__dirname, '..', 'assets', 'images', '_mapping.json');
const oldMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

// Build new mapping with corrected IDs
const newMapping = {};
let matched = 0;
let unmatched = 0;
const unmatchedEntries = [];

for (const [oldId, entry] of Object.entries(oldMapping)) {
  const nameKey = entry.name.toUpperCase().trim();
  
  if (nameToId.has(nameKey)) {
    const correctId = nameToId.get(nameKey);
    newMapping[correctId] = { ...entry };
    matched++;
  } else {
    // Product name in _mapping.json doesn't exist in products-data.js
    // These are "ghost" products that the scraper found but aren't in the actual product list
    unmatched++;
    unmatchedEntries.push({ oldId, name: entry.name });
  }
}

// Report
console.log('\n=== Migration Report ===');
console.log(`Total entries in old _mapping.json: ${Object.keys(oldMapping).length}`);
console.log(`Total products in products-data.js: ${products.length}`);
console.log(`✅ Matched and re-indexed: ${matched}`);
console.log(`❌ Unmatched (not in products-data.js): ${unmatched}`);
if (unmatchedEntries.length > 0) {
  console.log('\nUnmatched entries (will be dropped):');
  unmatchedEntries.forEach(e => console.log(`   Old ID ${e.oldId}: "${e.name}"`));
}

// Check for products that are still missing images
const missing = [];
for (const p of products) {
  if (!newMapping[p.id] || !newMapping[p.id].url) {
    missing.push(p);
  }
}
console.log(`\nProducts still missing images: ${missing.length}`);
if (missing.length > 0) {
  console.log('First 20 missing:');
  missing.slice(0, 20).forEach(p => console.log(`   ID ${p.id}: "${p.name}"`));
}

// Write corrected _mapping.json
fs.writeFileSync(mappingPath, JSON.stringify(newMapping, null, 2), 'utf-8');
console.log(`\n✅ Written corrected _mapping.json (${Object.keys(newMapping).length} entries)`);

// Regenerate image-mapping.js
let outDir = path.join(__dirname, '..', 'assets', 'images');
const entries = Object.entries(newMapping).filter(([_, e]) => e.url);
const lines = [`/** Auto-generated — ${entries.length} product image URLs */`, "const productImages = {"];
for (const [id, entry] of entries) {
  lines.push(`  "${id}":${JSON.stringify(entry)},`);
}
lines.push("};");
lines.push("function getProductImage(id){const e=productImages[id];return e&&e.url?e.url:null;}");
lines.push("function getImageStatus(id){const e=productImages[id];return e?e.status:\"missing\";}");
fs.writeFileSync(path.join(outDir, "image-mapping.js"), lines.join("\n") + "\n", "utf-8");
console.log(`✅ Regenerated image-mapping.js`);

console.log('\n=== Migration Complete ===');
console.log('Run `node scripts/find_image_urls.js --mode=batch` to continue scraping missing products.');
