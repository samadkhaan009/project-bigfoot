/**
 * Joins lease data onto data_psi_sites.geojson by Site Code → feature.id.
 * No fuzzy city/state matching. lease_crosswalk.json is obsolete — not used.
 * Run: node tools/join_lease.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const sitesPath = path.join(ROOT, 'public', 'data', 'data_psi_sites.geojson');
const sites     = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
const leaseRaw  = JSON.parse(fs.readFileSync(path.join(__dirname, 'lease_raw.json'),       'utf8').replace(/^﻿/, ''));
const flagsRaw  = JSON.parse(fs.readFileSync(path.join(__dirname, 'lease_flags_raw.json'), 'utf8').replace(/^﻿/, ''));

// Sites that are 3P (Partner) but appear in the lease file — pending user confirmation.
// leaseOnThirdParty is set so they are not miscounted as O&O lease obligations.
const THIRD_PARTY_LEASE_IDS = new Set(['11859', '12944']);

// Contract flag set keyed by siteCode string
const flaggedCodes = new Set(flagsRaw.map(r => String(r.siteCode)));

// Normalise action label to the standard display value
function normaliseAction(raw) {
  const u = (raw || '').toUpperCase();
  if (u.includes('RELOC'))  return 'Relocate';
  if (u.includes('ASSESS') || u.includes('CLOSE')) return 'Assess-Close';
  if (u.includes('RENEW') && u.includes('EXPAND')) return 'Renew+Expand';
  if (u.includes('RENEW'))  return 'Renew';
  if (u.includes('REFURB')) return 'Refurbish';
  if (u.includes('REVIEW')) return 'Review';
  return raw;
}

// Build lookup keyed by siteCode string.
// If a code appears more than once keep the first occurrence (likely earlier audit).
const leaseById = {};
const duplicates = [];
for (const rec of leaseRaw) {
  const code = String(rec.siteCode || '').trim();
  if (!code) continue;                       // empty = Towson etc., handled below
  if (leaseById[code]) { duplicates.push(code); continue; }
  leaseById[code] = rec;
}

// Build feature lookup by id for reporting
const featureById = Object.fromEntries(
  sites.features.map(f => [String(f.properties.id), f])
);

// ── Join ──────────────────────────────────────────────
let joined = 0, cleared = 0;
const unplaced    = [];   // lease rows with no matching feature
const thirdPartyJoined = [];

// First: clear all lease fields on every feature
sites.features.forEach(f => {
  const p = f.properties;
  p.leaseAction = p.leaseStatus = p.daysRemaining = p.leaseUtilization = null;
  p.monthlyRevenue = p.contractFlag = p.recommendedAction = null;
  p.licensureNote = p.opsNotes = p.leaseExpiry = null;
  p.leaseOnThirdParty = false;
  cleared++;
});

// Apply joined records
for (const [code, rec] of Object.entries(leaseById)) {
  const feat = featureById[code];
  if (!feat) {
    unplaced.push({ code, name: rec.testCenter, city: rec.city, state: rec.state, reason: 'No feature with this id' });
    continue;
  }
  const p = feat.properties;
  p.leaseAction        = normaliseAction(rec.action)   || null;
  p.leaseStatus        = rec.status                    || null;
  p.daysRemaining      = rec.daysRemaining             ?? null;
  p.leaseUtilization   = rec.utilization               ?? null;
  p.monthlyRevenue     = rec.monthlyRevenue            ?? null;
  p.contractFlag       = flaggedCodes.has(code);
  p.recommendedAction  = rec.recommendedAction         || null;
  p.licensureNote      = rec.licensureNote             || null;
  p.opsNotes           = rec.opsNotes                  || null;
  p.leaseExpiry        = rec.leaseExpiry               || null;
  p.leaseOnThirdParty  = THIRD_PARTY_LEASE_IDS.has(code);
  joined++;
  if (THIRD_PARTY_LEASE_IDS.has(code)) thirdPartyJoined.push(code);
}

// Unplaced: lease rows with empty site code OR code present but no matching feature
for (const rec of leaseRaw) {
  const code = String(rec.siteCode || '').trim();
  if (!code) {
    unplaced.push({ code: '(none)', name: rec.testCenter, city: rec.city, state: rec.state, reason: 'No Site Code in file' });
  }
}

fs.writeFileSync(sitesPath, JSON.stringify(sites));

// ── Report stats ──────────────────────────────────────
const withLease    = sites.features.filter(f => f.properties.leaseAction);
const ooLease      = withLease.filter(f => f.properties.propertyType === 'PSI Owned' && !f.properties.leaseOnThirdParty);
const tpLease      = withLease.filter(f => f.properties.leaseOnThirdParty);
const expiredAll   = withLease.filter(f => f.properties.leaseStatus === 'EXPIRED');
const expiredOO    = ooLease.filter(f => f.properties.leaseStatus === 'EXPIRED');
const expiredTP    = tpLease.filter(f => f.properties.leaseStatus === 'EXPIRED');
const flagged      = withLease.filter(f => f.properties.contractFlag);

const rev = (arr) => arr.reduce((s, f) => s + (f.properties.monthlyRevenue || 0), 0);
const totalRev     = rev(withLease);
const expiredRev   = rev(expiredAll);
const flaggedRev   = rev(flagged);
const atRiskRev    = rev([...new Set([...expiredAll, ...flagged])]);

const statusDist = {};
withLease.forEach(f => { const s = f.properties.leaseStatus; statusDist[s] = (statusDist[s]||0)+1; });

const actionDist = {};
withLease.forEach(f => { const a = f.properties.leaseAction; actionDist[a] = (actionDist[a]||0)+1; });

// ── Write lease_join_report.md ────────────────────────
const now = new Date().toISOString().slice(0,16).replace('T',' ') + ' UTC';
const fmt$ = n => '$' + Math.round(n).toLocaleString();
const fmtM = n => '$' + (n/1e6).toFixed(2) + 'M';

const unplacedRows = unplaced.map(u =>
  `| ${u.code} | ${u.name} | ${u.city}, ${u.state} | ${u.reason} |`
).join('\n');

const actionRows = Object.entries(actionDist).sort((a,b)=>b[1]-a[1])
  .map(([k,v]) => `| ${k} | ${v} |`).join('\n');

const statusRows = Object.entries(statusDist).sort((a,b)=>b[1]-a[1])
  .map(([k,v]) => `| ${k} | ${v} |`).join('\n');

const expiredSiteRows = expiredAll.map(f => {
  const p = f.properties;
  return `| ${p.id} | ${p.name} | ${p.city}, ${p.state} | ${p.propertyType}${p.leaseOnThirdParty?' (3P-under-lease)':''} | ${p.daysRemaining ?? 'n/a'} | ${fmt$(p.monthlyRevenue||0)} |`;
}).join('\n');

const report = `# Project Big Foot — Lease Join Report

_Generated: ${now} — joined by Site Code (exact match)_

---

## Summary

| Metric | Value |
|---|---|
| Lease rows in file | **${leaseRaw.length}** |
| Rows joined to a feature | **${joined}** |
| Rows unplaced | **${unplaced.length}** |
| Duplicate site codes (first kept) | ${duplicates.length > 0 ? duplicates.join(', ') : 'none'} |
| **O&O sites with lease data** | **${ooLease.length}** |
| **3P sites under lease** (pending confirmation) | **${tpLease.length}** |
| Total sites with lease data | **${withLease.length}** |

---

## Lease Action Distribution

| Action | Sites |
|---|---|
${actionRows}

---

## Lease Status Distribution

| Status | Sites |
|---|---|
${statusRows}

---

## Expired Lease Sites (${expiredAll.length} sites)

| ID | Name | City, State | Type | Days Overdue | Monthly Revenue |
|---|---|---|---|---|---|
${expiredSiteRows}

### Revenue at Risk

| Category | Sites | Monthly Revenue |
|---|---|---|
| Expired (O&O) | ${expiredOO.length} | ${fmtM(rev(expiredOO))} |
| Expired (3P-under-lease) | ${expiredTP.length} | ${fmtM(rev(expiredTP))} |
| Expired (all) | ${expiredAll.length} | **${fmtM(expiredRev)}** |
| Contract flagged | ${flagged.length} | ${fmtM(flaggedRev)} |
| **At risk total (expired + contract flag)** | **${[...new Set([...expiredAll.map(f=>f.properties.id), ...flagged.map(f=>f.properties.id)])].length}** | **${fmtM(atRiskRev)}** |

> Total monthly revenue across all ${withLease.length} leased sites: **${fmtM(totalRev)}**

---

## 3P Sites Under Lease (${tpLease.length})

These sites resolved to PSI Authorized (Partner) features, not O&O. Included in the map with \`leaseOnThirdParty = true\`. Pending user confirmation that these are correct.

${tpLease.map(f => `- **${f.properties.id}** ${f.properties.name} (${f.properties.city}, ${f.properties.state}) — ${f.properties.leaseAction}, ${f.properties.leaseStatus}`).join('\n')}

---

## Unplaced Lease Rows (${unplaced.length})

| Site Code | Test Center | City, State | Reason |
|---|---|---|---|
${unplacedRows || '_None_'}

> **Towson, MD** has no Site Code in the file and no matching feature in the GeoJSON. It has been confirmed as unplaceable.
`;

fs.writeFileSync(path.join(__dirname, 'lease_join_report.md'), report);

// ── Console output ────────────────────────────────────
console.log('\n' + '═'.repeat(55));
console.log('LEASE JOIN — Site Code exact match');
console.log('═'.repeat(55));
console.log(`  Rows in file:     ${leaseRaw.length}`);
console.log(`  Joined:           ${joined}`);
console.log(`  Unplaced:         ${unplaced.length}${unplaced.length ? ' — ' + unplaced.map(u=>u.name||'(no name)').join(', ') : ''}`);
if (duplicates.length) console.log(`  Duplicate codes:  ${duplicates.join(', ')} (first kept)`);
console.log(`\n  O&O lease sites:  ${ooLease.length}`);
console.log(`  3P-under-lease:   ${tpLease.length} (${tpLease.map(f=>f.properties.id+' '+f.properties.name).join(', ')})`);
console.log(`\n  EXPIRED total:    ${expiredAll.length} (O&O:${expiredOO.length} 3P:${expiredTP.length})`);
console.log(`  Contract flags:   ${flagged.length}`);
console.log(`  Revenue at risk:  ${fmtM(atRiskRev)} (expired + flagged)`);
console.log(`  Total rev (all):  ${fmtM(totalRev)}`);
console.log('\n  Report: tools/lease_join_report.md');
