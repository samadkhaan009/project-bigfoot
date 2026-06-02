/**
 * Finds PSI sites with coordinates outside valid USA + territory bounds.
 * A correct 50-mile ring's width in degrees depends on latitude:
 *   width = 2 × 50 / (69.11 × cos(lat)) — grows naturally at high latitudes.
 *   At 38°N it's already 1.81°; at 60°N (Alaska) it's ~3°.
 * So bounding-box size is NOT a valid check. The only reliable signal
 * of a bad coordinate is it being outside the valid USA geographic envelope.
 *
 * Valid USA + territories envelope:
 *   Latitude:  13° – 72°  (VI/PR ~17–18°N, Alaska ~72°N)
 *   Longitude: –180° – –60°  (VI ~–64.7°W, Alaska ~–130° to –180°)
 *
 * Run: node tools/remove_outlier_radii.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const LAT_MIN = 13,  LAT_MAX = 72;
const LON_MIN = -180, LON_MAX = -60;

const sitesPath = path.join(__dirname, '..', 'public', 'data', 'data_psi_sites.geojson');
const radiiPath = path.join(__dirname, '..', 'public', 'data', 'data_psi_radii.geojson');

const sites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
const radii  = JSON.parse(fs.readFileSync(radiiPath,  'utf8'));

console.log(`Checking ${sites.features.length} sites against USA coordinate bounds`);
console.log(`Valid range: lat ${LAT_MIN}–${LAT_MAX}°, lon ${LON_MIN}–${LON_MAX}°`);
console.log('─'.repeat(65));

const outliers = [];

for (const f of sites.features) {
  const [lon, lat] = f.geometry.coordinates;
  const { id, name, propertyType } = f.properties;

  const latOk = lat >= LAT_MIN && lat <= LAT_MAX;
  const lonOk = lon >= LON_MIN && lon <= LON_MAX;

  if (!latOk || !lonOk) {
    // Also compute expected ring width to show context
    const expectedWidth = 2 * 50 / (69.11 * Math.cos(lat * Math.PI / 180));
    outliers.push({ id, name, propertyType, lon, lat, latOk, lonOk, expectedWidth });
  }
}

if (outliers.length === 0) {
  console.log('✓  No outliers found. All site coordinates are within valid USA bounds.');
  console.log(`\nNote on ring widths: a correct 50-mile ring spans more degrees of longitude`);
  console.log(`at higher latitudes (Alaska rings are ~3° wide — this is correct, not a bug).`);
  process.exit(0);
}

console.log(`Found ${outliers.length} site(s) with invalid coordinates:\n`);
outliers.forEach(o => {
  const issues = [];
  if (!o.latOk) issues.push(`lat=${o.lat.toFixed(4)} outside [${LAT_MIN}, ${LAT_MAX}]`);
  if (!o.lonOk) issues.push(`lon=${o.lon.toFixed(4)} outside [${LON_MIN}, ${LON_MAX}]`);
  console.log(`  [${o.id}] ${o.name}`);
  console.log(`    propertyType: ${o.propertyType}`);
  console.log(`    Issue: ${issues.join('; ')}`);
  console.log();
});

const badIds = new Set(outliers.map(o => o.id));
const preSites = sites.features.length;
const preRadii  = radii.features.length;

sites.features = sites.features.filter(f => !badIds.has(f.properties.id));
radii.features  = radii.features.filter(f  => !badIds.has(f.properties.siteId));

fs.writeFileSync(sitesPath, JSON.stringify(sites));
fs.writeFileSync(radiiPath,  JSON.stringify(radii));

console.log(`Removed ${outliers.length} invalid site(s).`);
console.log(`  Sites: ${preSites} → ${sites.features.length}`);
console.log(`  Radii: ${preRadii}  → ${radii.features.length}`);
