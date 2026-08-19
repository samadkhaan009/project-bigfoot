/**
 * Adds FAA/AKT testing sites to data_psi_sites.geojson.
 *  A) Build 668 active FAA site features from "FAA-AKT Sites List Aug 2026.xlsx".
 *  B) Join 2026 YTD volume (Jan–Aug) from "FAA_Volumes.xlsx" by ZIP (+ name tie-break).
 *     — skipped gracefully if the volumes file is not present.
 *  C) Append the FAA features to the existing GeoJSON.
 * Run: node tools/join_faa.mjs   (from project root)
 */
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_LIST = path.join(__dirname, 'FAA-AKT Sites List Aug 2026.xlsx');
const VOLUMES    = path.join(__dirname, 'FAA Volumes.xlsx');
const GEO        = path.join(__dirname, '..', 'public', 'data', 'data_psi_sites.geojson');

const zip5 = z => String(z ?? '').replace(/\D/g, '').slice(0, 5).padStart(5, '0');
const num  = v => { const n = parseFloat(String(v ?? '').replace(/[, ]/g, '')); return Number.isFinite(n) ? n : null; };

// ── Part A: FAA site features ────────────────────────────────────────────────
const wb   = xlsx.readFile(SITES_LIST, { raw: false, defval: '' });
const rows = xlsx.utils.sheet_to_json(wb.Sheets['Dataset'], { header: 1, raw: false, defval: '' });
// column indices (header row 0, data row 1+)
const C = { code:0, name:1, status:4, address:5, city:6, state:7, zip:8, ada:19, aktVol25:34, aud:39, lat:166, lon:167 };

const faa = [];
let active = 0, skipCoord = 0;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (String(r[C.status] ?? '').trim() !== 'Active') continue;
  active++;
  const lat = num(r[C.lat]), lon = num(r[C.lon]);
  if (lat === null || lon === null || lat === 0 || lon === 0) { skipCoord++; continue; }
  faa.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id:           String(r[C.code] ?? '').trim(),
      name:         String(r[C.name] ?? '').trim(),
      city:         String(r[C.city] ?? '').trim(),
      state:        String(r[C.state] ?? '').trim(),
      zip:          zip5(r[C.zip]),
      address:      String(r[C.address] ?? '').trim(),
      propertyType: 'FAA/AKT',
      category:     '3P',
      seats:        null,
      aktVol25:     num(r[C.aktVol25]) ?? 0,
      aktAudScore:  num(r[C.aud]),
      adaCompliant: String(r[C.ada] ?? '').trim() === 'Yes',
      faaYtd2026:   0,
      irsActivated: false, irsIslaGranted: 0, irsCleared: 0, irsInProcess: 0, irsTotalTCAs: 0,
      scoreBucket: null, cdVolume: null, optimusScore: null, optimusTier: null,
      leaseAction: null, leaseStatus: null, daysRemaining: null, monthlyRevenue: null,
      contractFlag: false, inPriorityCity: false, cbsaCode: null, cbsaName: null,
    },
  });
}
console.log(`Part A: ${active} active FAA sites · ${faa.length} with coords · ${skipCoord} skipped (no coords)`);

// ── Part B: 2026 YTD volume join (Jan–Aug) ───────────────────────────────────
let volMatched = 0, volTotal = 0, unmatchedVol = 0;
if (fs.existsSync(VOLUMES)) {
  const vwb = xlsx.readFile(VOLUMES, { raw: false, defval: '' });
  const vrows = xlsx.utils.sheet_to_json(vwb.Sheets['Sheet 1'], { header: 1, raw: false, defval: '' });
  // header row 2, data row 3+. name col1, city col3, state col4, zip col5, months cols 6-13 (Jan..Aug 2026)
  const words = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  // index FAA features by zip
  const byZip = new Map();
  for (const f of faa) { const z = f.properties.zip; if (!byZip.has(z)) byZip.set(z, []); byZip.get(z).push(f); }

  for (let i = 3; i < vrows.length; i++) {
    const vr = vrows[i];
    if (!vr || (!vr[1] && !vr[5])) continue;
    let sum = 0; for (let c = 6; c <= 13; c++) { const n = num(vr[c]); if (n !== null) sum += n; }
    const z = zip5(vr[5]);
    const cands = byZip.get(z) || [];
    let target = null;
    if (cands.length === 1) target = cands[0];
    else if (cands.length > 1) {
      const vw = new Set(words(vr[1]));
      target = cands.find(f => words(f.properties.name).filter(w => vw.has(w)).length >= 2) || null;
    }
    if (target) { target.properties.faaYtd2026 = (target.properties.faaYtd2026 || 0) + sum; volMatched++; volTotal += sum; }
    else { unmatchedVol++; console.log(`  unmatched volume row: "${vr[1]}" (${vr[3]}, ${vr[4]} ${z}) sum=${sum}`); }
  }
  console.log(`Part B: matched ${volMatched} volume rows · total 2026 YTD = ${volTotal.toLocaleString()} · ${unmatchedVol} unmatched`);
} else {
  console.log('Part B: SKIPPED — FAA_Volumes.xlsx not found in tools/. faaYtd2026 left at 0 for all FAA sites.');
}

// ── Part C: append to GeoJSON ────────────────────────────────────────────────
const geo = JSON.parse(fs.readFileSync(GEO, 'utf8'));
const before = geo.features.length;
// idempotency: drop any prior FAA/AKT features before appending
geo.features = geo.features.filter(f => f.properties.propertyType !== 'FAA/AKT');
const removed = before - geo.features.length;
geo.features.push(...faa);
fs.writeFileSync(GEO, JSON.stringify(geo));
console.log(`Part C: ${removed ? `removed ${removed} prior FAA features, ` : ''}appended ${faa.length} FAA features`);
console.log(`\nTotal features after append: ${geo.features.length}`);
