/**
 * Major network rebuild — DUAL SOURCE.
 *  Source 1 (O&O): authoritative owned-and-operated list — the "O&O" sheet of
 *    "14 Aug Test Center List With Address (3) (1).xlsx" (135 PSI Owned sites).
 *    That sheet has no lat/lon, so geodata is joined by Test Center ID from the
 *    main August TC list (which has coordinates for all 135).
 *  Source 2 (3P): "Test Center List With Address 14 August 2026.xlsx",
 *    Active + USA + propertyType !== 'PSI Owned' (all non-owned channel types).
 *  PSI Owned rows in the main list that are NOT in the authoritative O&O whitelist
 *  (labelled PSI Owned but off the GPS/OPS platform) are dropped.
 * Skips: Virtual property type, and any site with missing/zero coordinates.
 * Run: node tools/rebuild_sites.mjs   (from project root)
 */
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DD   = path.join(ROOT, 'public', 'data');

const AUG_PATH   = path.join(__dirname, 'Test Center List With Address 14 August 2026.xlsx');
const AUG_SHEET  = 'Test Center List With Address';
const OO_PATH    = path.join(__dirname, '14 Aug Test Center List With Address (3) (1).xlsx');
const OO_SHEET   = 'O&O';
const SITES_OUT  = path.join(DD, 'data_psi_sites.geojson');
const BACKUP_OUT = path.join(DD, 'data_psi_sites_backup_552.geojson');

// Main August TC list column indices (title row0, header row1, data row2+)
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

// ── Source 1: authoritative O&O ID whitelist (O&O sheet, header row0, data row1+) ──
const oowb   = xlsx.readFile(OO_PATH, { raw: false, defval: '' });
const ooRows = xlsx.utils.sheet_to_json(oowb.Sheets[OO_SHEET], { header: 1, raw: false, defval: '' });
const authOO = new Set();
for (let i = 1; i < ooRows.length; i++) {
  const id = String(ooRows[i][1] ?? '').trim();
  if (id) authOO.add(id);
}
console.log(`Authoritative O&O whitelist: ${authOO.size} IDs (from "${OO_SHEET}" sheet)`);

const propsFor = (r, propertyType, category, seats) => ({
  id:           String(r[C.id] ?? '').trim(),
  name:         String(r[C.name] ?? '').trim(),
  city:         String(r[C.city] ?? '').trim(),
  state:        String(r[C.state] ?? '').trim(),
  zip:          String(r[C.zip] ?? '').trim().padStart(5, '0'),
  propertyType,
  category,
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
});

// ── Read main August TC list ─────────────────────────────────────────────────
const wb   = xlsx.readFile(AUG_PATH, { raw: false, defval: '' });
const rows = xlsx.utils.sheet_to_json(wb.Sheets[AUG_SHEET], { header: 1, raw: false, defval: '' });
console.log(`August TC list rows: ${rows.length} (data from index 2)`);

const features = [];
const byType = new Map();
let usaActive = 0, skipVirtual = 0, skipNoCoords = 0, droppedNonAuthOO = 0;
const ooMatched = new Set();
const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);

for (let i = 2; i < rows.length; i++) {
  const r = rows[i];
  const country = String(r[C.country] ?? '').trim();
  const status  = String(r[C.status]  ?? '').trim();
  if (country !== 'USA' || status !== 'Active') continue;
  usaActive++;

  const propertyType = String(r[C.propertyType] ?? '').trim();
  if (propertyType === 'Virtual') { skipVirtual++; continue; }

  const id = String(r[C.id] ?? '').trim();
  const isOwned = propertyType === 'PSI Owned';
  // Source 1 gate: keep an owned row only if it's on the authoritative whitelist
  if (isOwned && !authOO.has(id)) { droppedNonAuthOO++; continue; }

  const lon = parseFloat(String(r[C.lon] ?? '').replace(/[, ]/g, ''));
  const lat = parseFloat(String(r[C.lat] ?? '').replace(/[, ]/g, ''));
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon === 0 || lat === 0) { skipNoCoords++; continue; }

  const seatsRaw = parseInt(String(r[C.seats] ?? '').replace(/[, ]/g, ''), 10);
  const seats = Number.isFinite(seatsRaw) && seatsRaw > 0 ? seatsRaw : null;

  if (isOwned) ooMatched.add(id);
  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: propsFor(r, propertyType, isOwned ? 'OO' : '3P', seats),
  });
  inc(byType, propertyType);
}

fs.writeFileSync(SITES_OUT, JSON.stringify({ type: 'FeatureCollection', features }, null, 2), 'utf8');

// authoritative O&O IDs that never matched a coordinate-bearing August row
const ooUnmatched = [...authOO].filter(id => !ooMatched.has(id));

// ── Report ───────────────────────────────────────────────────────────────────
console.log('\n════════════════ REBUILD SITES (dual-source) ════════════════');
console.log(`USA + Active (pre-skip):        ${usaActive}`);
console.log(`Dropped — non-authoritative O&O:${droppedNonAuthOO}`);
console.log(`Skipped — Virtual:              ${skipVirtual}`);
console.log(`Skipped — null/zero coords:     ${skipNoCoords}`);
console.log(`Total features written:         ${features.length}`);
console.log(`O&O matched from whitelist:     ${ooMatched.size} / ${authOO.size}`);
if (ooUnmatched.length) console.log(`  O&O whitelist IDs with no coord row: ${ooUnmatched.join(', ')}`);
console.log('\n── Breakdown by propertyType (written) ──');
[...byType.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${v}`));
const oo = features.filter(f => f.properties.category === 'OO').length;
console.log(`\n  category OO:  ${oo}`);
console.log(`  category 3P:  ${features.length - oo}`);
console.log(`\nWrote: ${path.basename(SITES_OUT)}`);
