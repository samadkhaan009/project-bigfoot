/**
 * Major network rebuild — replace data_psi_sites.geojson with the full active
 * US network from "Test Center List With Address 14 August 2026.xlsx".
 * Filter: Country === 'USA' AND Current Status === 'Active'.
 * Skips: Virtual property type, and any site with missing/zero coordinates.
 * Backs up the current 552-site file first.
 * Run: node tools/rebuild_sites.mjs   (from project root)
 */
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DD   = path.join(ROOT, 'public', 'data');

const SRC_PATH   = path.join(__dirname, 'Test Center List With Address 14 August 2026.xlsx');
const SHEET      = 'Test Center List With Address';
const SITES_OUT  = path.join(DD, 'data_psi_sites.geojson');
const BACKUP_OUT = path.join(DD, 'data_psi_sites_backup_552.geojson');

// Column indices (confirmed against header row, index 1)
const C = { state:0, id:1, name:3, propertyType:6, status:7, city:16, zip:17, country:18, seats:25, lon:28, lat:29 };

// ── Backup current file first (never clobber an existing backup) ─────────────
if (fs.existsSync(BACKUP_OUT)) {
  const bk = JSON.parse(fs.readFileSync(BACKUP_OUT, 'utf8'));
  console.log(`Backup already exists — preserving ${path.basename(BACKUP_OUT)} (${bk.features?.length ?? '?'} features).`);
} else if (fs.existsSync(SITES_OUT)) {
  fs.copyFileSync(SITES_OUT, BACKUP_OUT);
  const cur = JSON.parse(fs.readFileSync(SITES_OUT, 'utf8'));
  console.log(`Backup written: ${path.basename(BACKUP_OUT)} (${cur.features?.length ?? '?'} features)`);
} else {
  console.log('WARNING: current data_psi_sites.geojson not found — no backup made.');
}

// ── Read source ──────────────────────────────────────────────────────────────
const wb   = xlsx.readFile(SRC_PATH, { raw: false, defval: '' });
const rows = xlsx.utils.sheet_to_json(wb.Sheets[SHEET], { header: 1, raw: false, defval: '' });
console.log(`Source rows: ${rows.length} (data from index 2)`);

const features = [];
const byType = new Map();           // propertyType → written count
let usaActive = 0, skipVirtual = 0, skipNoCoords = 0;
const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);

for (let i = 2; i < rows.length; i++) {
  const r = rows[i];
  const country = String(r[C.country] ?? '').trim();
  const status  = String(r[C.status]  ?? '').trim();
  if (country !== 'USA' || status !== 'Active') continue;
  usaActive++;

  const propertyType = String(r[C.propertyType] ?? '').trim();
  if (propertyType === 'Virtual') { skipVirtual++; continue; }

  const lon = parseFloat(String(r[C.lon] ?? '').replace(/[, ]/g, ''));
  const lat = parseFloat(String(r[C.lat] ?? '').replace(/[, ]/g, ''));
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon === 0 || lat === 0) { skipNoCoords++; continue; }

  const seatsRaw = parseInt(String(r[C.seats] ?? '').replace(/[, ]/g, ''), 10);
  const seats = Number.isFinite(seatsRaw) && seatsRaw > 0 ? seatsRaw : null;

  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id:           String(r[C.id] ?? '').trim(),
      name:         String(r[C.name] ?? '').trim(),
      city:         String(r[C.city] ?? '').trim(),
      state:        String(r[C.state] ?? '').trim(),
      zip:          String(r[C.zip] ?? '').trim().padStart(5, '0'),
      propertyType,
      category:     propertyType === 'PSI Owned' ? 'OO' : '3P',
      country:      'USA',
      seats,
      // IRS fields — default zero (joined later)
      irsActivated:   false,
      irsIslaGranted: 0,
      irsCleared:     0,
      irsInProcess:   0,
      irsTotalTCAs:   0,
      // Enrichment defaults
      scoreBucket:    null,
      cdVolume:       null,
      optimusScore:   null,
      optimusTier:    null,
      leaseAction:    null,
      leaseStatus:    null,
      daysRemaining:  null,
      monthlyRevenue: null,
      contractFlag:   false,
      inPriorityCity: false,
      cbsaCode:       null,
      cbsaName:       null,
    },
  });
  inc(byType, propertyType);
}

fs.writeFileSync(SITES_OUT, JSON.stringify({ type: 'FeatureCollection', features }, null, 2), 'utf8');

// ── Report ───────────────────────────────────────────────────────────────────
console.log('\n════════════════ STEP 1 — REBUILD SITES ════════════════');
console.log(`USA + Active (pre-skip):      ${usaActive}`);
console.log(`Skipped — Virtual:            ${skipVirtual}`);
console.log(`Skipped — null/zero coords:   ${skipNoCoords}`);
console.log(`Total features written:       ${features.length}`);
console.log('\n── Breakdown by propertyType (written) ──');
[...byType.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${v}`));
const oo = features.filter(f => f.properties.category === 'OO').length;
console.log(`\n  category OO:  ${oo}`);
console.log(`  category 3P:  ${features.length - oo}`);
console.log(`\nWrote: ${path.basename(SITES_OUT)}`);
