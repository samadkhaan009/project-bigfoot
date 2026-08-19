/**
 * Builds data_healthcare.geojson from the CMS Provider of Services (POS) file.
 * Source: tools/POS_File_QIES_Q2_2026.csv
 * Filter: PRVDR_CTGRY_SBTYP_CD === '01' (hospitals) AND ELGBLTY_SW === 'Y'.
 * The POS file has no coordinates → geocode by ZIP centroid (midwire free_zipcode_data).
 * Run: node tools/build_healthcare.mjs   (from project root)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, 'POS_File_QIES_Q2_2026.csv');
const OUT = path.join(__dirname, '..', 'public', 'data', 'data_healthcare.geojson');
const ZIP_URL = 'https://raw.githubusercontent.com/midwire/free_zipcode_data/master/all_us_zipcodes.csv';

function parseLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}
const zip5 = z => String(z ?? '').replace(/\D/g, '').slice(0, 5).padStart(5, '0');

async function main() {
  // ── ZIP centroid lookup ──────────────────────────────────────────────────
  console.log('Fetching ZIP centroid CSV…');
  const zres = await fetch(ZIP_URL);
  if (!zres.ok) throw new Error(`ZIP CSV fetch failed: HTTP ${zres.status}`);
  const zraw = (await zres.text()).replace(/^﻿/, '');
  const zlines = zraw.split(/\r?\n/).filter(l => l.length > 0);
  const zhead = parseLine(zlines[0]).map(h => h.trim());
  const zi = Object.fromEntries(zhead.map((h, i) => [h, i]));
  const zipLL = new Map();
  for (let i = 1; i < zlines.length; i++) {
    const r = parseLine(zlines[i]);
    const code = zip5(r[zi.code]);
    const lat = parseFloat(r[zi.lat]), lon = parseFloat(r[zi.lon]);
    if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!zipLL.has(code)) zipLL.set(code, { lat, lon });
  }
  console.log(`  ${zipLL.size} ZIP centroids loaded`);

  // ── POS hospitals ────────────────────────────────────────────────────────
  const raw = fs.readFileSync(SRC, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.length > 0);
  const head = parseLine(lines[0]).map(h => h.trim());
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  const col = (r, name) => (r[idx[name]] ?? '').trim();

  let hospitals = 0, zipMatched = 0, zipMissed = 0;
  const features = [];
  for (let i = 1; i < lines.length; i++) {
    const r = parseLine(lines[i]);
    if (col(r, 'PRVDR_CTGRY_SBTYP_CD') !== '01') continue;
    if (col(r, 'ELGBLTY_SW') !== 'Y') continue;
    hospitals++;
    const z = zip5(col(r, 'ZIP_CD'));
    const ll = zipLL.get(z);
    if (!ll) { zipMissed++; continue; }
    zipMatched++;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ll.lon, ll.lat] },
      properties: {
        name:       col(r, 'FAC_NAME'),
        city:       col(r, 'CITY_NAME'),
        state:      col(r, 'STATE_CD'),
        zip:        col(r, 'ZIP_CD'),
        address:    col(r, 'ST_ADR'),
        phone:      col(r, 'PHNE_NUM'),
        providerId: col(r, 'PRVDR_NUM'),
        category:   'Healthcare',
      },
    });
  }

  fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }));
  const mb = fs.statSync(OUT).size / 1024 / 1024;
  const rate = hospitals ? (zipMatched / hospitals * 100).toFixed(1) : '0';
  console.log(`CMS healthcare layer built`);
  console.log(`  hospitals (01 + eligible): ${hospitals}`);
  console.log(`  ZIP matched (written):     ${zipMatched}`);
  console.log(`  ZIP unmatched (skipped):   ${zipMissed}`);
  console.log(`  ZIP match rate:            ${rate}%`);
  console.log(`  file size:                 ${mb.toFixed(2)} MB`);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
