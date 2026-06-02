/**
 * Applies small circular offsets (~20m) to groups of sites sharing exact coordinates,
 * so each site is individually clickable on the map. Also regenerates radius rings
 * for the moved sites.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const sitesPath = path.join(ROOT, 'public', 'data', 'data_psi_sites.geojson');
const radiiPath = path.join(ROOT, 'public', 'data', 'data_psi_radii.geojson');

const sites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
const radii  = JSON.parse(fs.readFileSync(radiiPath,  'utf8'));

const radiiMap = Object.fromEntries(radii.features.map((f, i) => [f.properties.siteId, i]));

// Find duplicate-coordinate groups
const coordMap = {};
sites.features.forEach((f, i) => {
  const [lon, lat] = f.geometry.coordinates;
  const k = `${lon.toFixed(6)},${lat.toFixed(6)}`;
  if (!coordMap[k]) coordMap[k] = [];
  coordMap[k].push(i);
});

const dupes = Object.entries(coordMap).filter(([, idxs]) => idxs.length > 1);
const RADIUS_DEG = 0.00025; // ~20 metres at mid-latitudes

function generateCircle(lon, lat) {
  const R = 3958.8, d = 50 / R, PTS = 64;
  const lat1 = lat * Math.PI / 180, lon1 = lon * Math.PI / 180;
  const ring = [];
  for (let i = 0; i <= PTS; i++) {
    const b = (2 * Math.PI * i) / PTS;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([+(lon2 * 180 / Math.PI).toFixed(6), +(lat2 * 180 / Math.PI).toFixed(6)]);
  }
  return ring;
}

let sitesOffset = 0;
for (const [coord, idxs] of dupes) {
  const n = idxs.length;
  console.log(`\nGroup at ${coord} (${n} sites):`);
  idxs.forEach((idx, j) => {
    const angle  = (2 * Math.PI * j) / n;
    const dLon   = RADIUS_DEG * Math.cos(angle);
    const dLat   = RADIUS_DEG * Math.sin(angle);
    const f      = sites.features[idx];
    const [oLon, oLat] = f.geometry.coordinates;
    const nLon   = +(oLon + dLon).toFixed(7);
    const nLat   = +(oLat + dLat).toFixed(7);
    f.geometry.coordinates = [nLon, nLat];
    console.log(`  [${f.properties.id}] ${f.properties.name} → offset (${dLon >= 0 ? '+' : ''}${dLon.toFixed(5)}, ${dLat >= 0 ? '+' : ''}${dLat.toFixed(5)})`);
    // Regenerate radius ring at new center
    const ri = radiiMap[f.properties.id];
    if (ri !== undefined) {
      radii.features[ri].geometry.coordinates = [generateCircle(nLon, nLat)];
    }
    sitesOffset++;
  });
}

fs.writeFileSync(sitesPath, JSON.stringify(sites));
fs.writeFileSync(radiiPath,  JSON.stringify(radii));

console.log(`\nFixed ${dupes.length} groups — offset ${sitesOffset} sites`);
console.log('Radius rings updated for all moved sites');
