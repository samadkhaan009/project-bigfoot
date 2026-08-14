/**
 * Regenerates data_psi_radii.geojson from data_psi_sites.geojson.
 * Ensures every radius ring has the correct propertyType, category,
 * and matches the current site list exactly.
 * Run: node tools/regen_radii.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const RADIUS_MILES = 50;
const CIRCLE_PTS   = 64;

function generateCircle(lon, lat) {
  const R = 3958.8, d = RADIUS_MILES / R;
  const lat1 = lat * Math.PI / 180, lon1 = lon * Math.PI / 180;
  const coords = [];
  for (let i = 0; i <= CIRCLE_PTS; i++) {
    const b = (2 * Math.PI * i) / CIRCLE_PTS;
    const lat2 = Math.asin(Math.sin(lat1)*Math.cos(d) + Math.cos(lat1)*Math.sin(d)*Math.cos(b));
    const lon2 = lon1 + Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat1), Math.cos(d) - Math.sin(lat1)*Math.sin(lat2));
    coords.push([+(lon2*180/Math.PI).toFixed(6), +(lat2*180/Math.PI).toFixed(6)]);
  }
  return coords;
}

const sitesPath = path.join(__dirname, '..', 'public', 'data', 'data_psi_sites.geojson');
const radiiPath = path.join(__dirname, '..', 'public', 'data', 'data_psi_radii.geojson');

const sites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));

// Radii are only meaningful for the core PSI footprint — restrict rings to
// O&O (category OO) plus PSI Authorized. Full 4,252-ring generation is avoided.
const ringSites = sites.features.filter(f => {
  const p = f.properties || {};
  return p.category === 'OO' || p.propertyType === 'PSI Authorized';
});

const radiiFeatures = ringSites.map(f => {
  const [lon, lat]  = f.geometry.coordinates;
  const { id, propertyType, category } = f.properties;
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [generateCircle(lon, lat)] },
    properties: { siteId: id, propertyType, category },
  };
});
console.log(`Filtered to O&O + PSI Authorized: ${ringSites.length} of ${sites.features.length} sites`);

fs.writeFileSync(radiiPath, JSON.stringify({ type: 'FeatureCollection', features: radiiFeatures }));

// Verify distribution
const dist = {};
radiiFeatures.forEach(f => {
  const pt = f.properties.propertyType;
  dist[pt] = (dist[pt] || 0) + 1;
});

console.log(`Regenerated ${radiiFeatures.length} radius rings`);
Object.entries(dist).sort((a,b) => b[1]-a[1]).forEach(([pt, n]) => console.log(`  ${n.toString().padStart(4)}  ${pt}`));
