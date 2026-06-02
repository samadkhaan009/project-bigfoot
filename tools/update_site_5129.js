import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const CORRECT_LON = -74.4432;
const CORRECT_LAT = 40.6998;

// ── Update data_psi_sites.geojson ────────────────────
const sitesPath = path.join(ROOT, 'public', 'data', 'data_psi_sites.geojson');
const sites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
const f = sites.features.find(x => x.properties.id === '5129');
const [oldLon, oldLat] = f.geometry.coordinates;

f.properties.name    = 'NEW PROVIDENCE - Murray Hill Office Center';
f.properties.address = '571 Central Avenue, Suite 117';
f.properties.city    = 'New Providence';
f.properties.state   = 'New Jersey';
f.properties.zip     = '07974';
f.properties.phone   = '(908) 219-4595';
f.properties.email   = 'NJ.NewProvidence@psionline.com';
f.geometry.coordinates = [CORRECT_LON, CORRECT_LAT];

fs.writeFileSync(sitesPath, JSON.stringify(sites));
const dLon = Math.abs(CORRECT_LON - oldLon);
const dKm  = (dLon * 111 * Math.cos(40.7 * Math.PI / 180)).toFixed(2);
console.log(`data_psi_sites.geojson updated`);
console.log(`  Coord: (${oldLon.toFixed(5)},${oldLat.toFixed(5)}) → (${CORRECT_LON},${CORRECT_LAT})`);
console.log(`  Shift:  Δlon=${dLon.toFixed(4)}° (~${dKm} km west)`);

// ── Regenerate radius for site 5129 ──────────────────
const radiiPath = path.join(ROOT, 'public', 'data', 'data_psi_radii.geojson');
const radii = JSON.parse(fs.readFileSync(radiiPath, 'utf8'));
const ri = radii.features.findIndex(x => x.properties.siteId === '5129');
if (ri >= 0) {
  const R=3958.8, d=50/R, PTS=64;
  const lat1=CORRECT_LAT*Math.PI/180, lon1=CORRECT_LON*Math.PI/180;
  const ring=[];
  for(let i=0; i<=PTS; i++) {
    const b=2*Math.PI*i/PTS;
    const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(b));
    const lon2=lon1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
    ring.push([+(lon2*180/Math.PI).toFixed(6), +(lat2*180/Math.PI).toFixed(6)]);
  }
  radii.features[ri].geometry.coordinates = [ring];
  fs.writeFileSync(radiiPath, JSON.stringify(radii));
  console.log(`data_psi_radii.geojson updated — ring regenerated at (${CORRECT_LON},${CORRECT_LAT})`);
}
