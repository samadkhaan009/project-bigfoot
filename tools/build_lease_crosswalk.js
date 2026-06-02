/**
 * Builds tools/lease_crosswalk.json by matching lease sites to PSI TC IDs.
 * Match order: city+state exact → fuzzy name similarity → UNMATCHED.
 * Run: node tools/build_lease_crosswalk.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── State abbreviation → full name ────────────────────
const STATE_ABBR = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
  KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
  NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',
  NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia',PR:'Puerto Rico',VI:'Virgin Islands, U.S.',
};

// Strip words that don't help matching, normalize abbreviations
const STOP = /\b(THE|OF|AND|LLC|INC|TESTING|SERVICES|SERVICE|SUITES?|SUITE|PSI|LAB|LABS|CENTER|CENTRE)\b/g;
function norm(s) {
  return (s || '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(STOP, ' ')
    .replace(/\bFT\b/g, 'FORT')
    .replace(/\bST\b/g, 'SAINT')
    .replace(/\bMT\b/g, 'MOUNT')
    .replace(/\s+/g, ' ')
    .trim();
}

function normCity(c) { return norm(c); }

// Jaccard similarity on word tokens
function similarity(a, b) {
  const wa = new Set(norm(a).split(' ').filter(Boolean));
  const wb = new Set(norm(b).split(' ').filter(Boolean));
  if (wa.size === 0 && wb.size === 0) return 1;
  const inter = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

// Normalize lease action values to canonical display labels
function normalizeAction(a) {
  const u = a.toUpperCase();
  if (u.includes('RELOC')) return 'Relocate';
  if (u.includes('ASSESS') || u.includes('CLOSE')) return 'Assess-Close';
  if (u.includes('RENEW') && u.includes('EXPAND')) return 'Renew+Expand';
  if (u.includes('RENEW')) return 'Renew';
  if (u.includes('REFURB')) return 'Refurbish';
  if (u.includes('REVIEW')) return 'Review';
  return a;
}

// ── Load data ──────────────────────────────────────────
const psiRaw   = JSON.parse(fs.readFileSync(path.join(__dirname, 'psi_raw.json'),         'utf8').replace(/^﻿/, ''));
const leaseRaw = JSON.parse(fs.readFileSync(path.join(__dirname, 'lease_raw.json'),        'utf8').replace(/^﻿/, ''));
const flagsRaw = JSON.parse(fs.readFileSync(path.join(__dirname, 'lease_flags_raw.json'),  'utf8').replace(/^﻿/, ''));

// Build contract flag set (by normalized city+state)
const flagSet = new Set(flagsRaw.map(f => `${normCity(f.city)}|${STATE_ABBR[f.state]||f.state}`));

// Filter PSI to O&O US sites only (lease only covers O&O)
const ooSites = psiRaw.filter(s => s.propertyType === 'PSI Owned' && s.country === 'USA');

// Index O&O sites by normalized city+fullState
const psiByCity = {};
for (const s of ooSites) {
  const key = `${normCity(s.city)}|${s.state}`;
  if (!psiByCity[key]) psiByCity[key] = [];
  psiByCity[key].push(s);
}

// ── Match lease rows ───────────────────────────────────
const crosswalk = [];
let matched_city = 0, matched_fuzzy = 0, unmatched = 0;
const unmatchedList = [], ambiguousList = [];

for (const lease of leaseRaw) {
  const fullState = STATE_ABBR[lease.state] || lease.state;
  const cityKey   = `${normCity(lease.city)}|${fullState}`;
  const candidates = psiByCity[cityKey] || [];
  const leaseNorm  = norm(lease.testCenter);
  const isFlag     = flagSet.has(cityKey);
  const action     = normalizeAction(lease.action);

  const base = {
    leaseTestCenter:  lease.testCenter,
    leaseCity:        lease.city,
    leaseState:       lease.state,
    action,
    leaseExpiry:      lease.leaseExpiry,
    status:           lease.status,
    daysRemaining:    lease.daysRemaining,
    fy25Volume:       lease.fy25Volume,
    utilization:      lease.utilization,
    monthlyRevenue:   lease.monthlyRevenue,
    contractAlignment:lease.contractAlignment,
    licensureNote:    lease.licensureNote,
    opsNotes:         lease.opsNotes,
    recommendedAction:lease.recommendedAction,
    contractFlag:     isFlag,
  };

  if (candidates.length === 0) {
    // No PSI site in this city+state — try state-level name match (suburb mismatch)
    const stateCandidates = ooSites.filter(s => s.state === fullState);
    const stateBest = stateCandidates.map(s => ({ s, score: similarity(leaseNorm, norm(s.name)) }))
      .sort((a,b) => b.score - a.score)[0];
    if (stateBest && stateBest.score >= 0.50) {
      crosswalk.push({ ...base, matchedTcId: Number(stateBest.s.testCenterId), matchedSiteName: stateBest.s.name, matchMethod: 'state_fuzzy', confidence: 'MEDIUM' });
      matched_fuzzy++;
      ambiguousList.push(`MEDIUM (suburb fix): ${lease.testCenter} (${lease.city},${lease.state}) score=${stateBest.score.toFixed(2)} → "${stateBest.s.name}" PSI city=${stateBest.s.city}`);
    } else {
      crosswalk.push({ ...base, matchedTcId: null, matchedSiteName: null, matchMethod: 'UNMATCHED', confidence: 'UNMATCHED' });
      unmatched++;
      unmatchedList.push(`${lease.testCenter} (${lease.city}, ${lease.state})`);
    }
  } else if (candidates.length === 1) {
    // Unique city+state — HIGH confidence
    const s = candidates[0];
    crosswalk.push({ ...base, matchedTcId: Number(s.testCenterId), matchedSiteName: s.name, matchMethod: 'city_state', confidence: 'HIGH' });
    matched_city++;
  } else {
    // Multiple O&O in same city — fuzzy name match
    const scored = candidates.map(s => ({
      s,
      score: similarity(leaseNorm, norm(s.name)),
    })).sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best.score >= 0.40) {
      crosswalk.push({ ...base, matchedTcId: Number(best.s.testCenterId), matchedSiteName: best.s.name, matchMethod: 'fuzzy_name', confidence: best.score >= 0.70 ? 'HIGH' : 'MEDIUM' });
      matched_fuzzy++;
      if (best.score < 0.70) {
        ambiguousList.push(`${lease.testCenter} (${lease.city}, ${lease.state}) → score=${best.score.toFixed(2)} matched to "${best.s.name}" [candidates: ${candidates.map(c=>c.name).join(', ')}]`);
      }
    } else {
      // All fuzzy scores too low — try state-level name match as fallback
      const stateCandidates = ooSites.filter(s => s.state === fullState);
      const stateBest = stateCandidates.map(s => ({ s, score: similarity(leaseNorm, norm(s.name)) }))
        .sort((a,b) => b.score - a.score)[0];
      if (stateBest && stateBest.score >= 0.50) {
        crosswalk.push({ ...base, matchedTcId: Number(stateBest.s.testCenterId), matchedSiteName: stateBest.s.name, matchMethod: 'state_fuzzy', confidence: 'MEDIUM' });
        matched_fuzzy++;
        ambiguousList.push(`MEDIUM: ${lease.testCenter} (${lease.city},${lease.state}) score=${stateBest.score.toFixed(2)} → "${stateBest.s.name}" [city mismatch: lease=${lease.city} PSI=${stateBest.s.city}]`);
      } else {
        crosswalk.push({ ...base, matchedTcId: null, matchedSiteName: null, matchMethod: 'UNMATCHED', confidence: 'UNMATCHED' });
        unmatched++;
        ambiguousList.push(`UNMATCHED: ${lease.testCenter} (${lease.city}, ${lease.state}) — candidates: ${candidates.map(c=>c.name).join(', ')}`);
        unmatchedList.push(`${lease.testCenter} (${lease.city}, ${lease.state}) [ambiguous]`);
      }
    }
  }
}

// ── Save ───────────────────────────────────────────────
fs.writeFileSync(path.join(__dirname, 'lease_crosswalk.json'), JSON.stringify(crosswalk, null, 2));

// ── Report ─────────────────────────────────────────────
console.log('═'.repeat(55));
console.log('LEASE CROSSWALK SUMMARY');
console.log('═'.repeat(55));
console.log(`Total lease sites:      ${leaseRaw.length}`);
console.log(`Matched city+state:     ${matched_city}`);
console.log(`Matched fuzzy name:     ${matched_fuzzy}`);
console.log(`Unmatched:              ${unmatched}`);
if (unmatchedList.length) {
  console.log('\nUnmatched sites:');
  unmatchedList.forEach(s => console.log('  ✗ ' + s));
}
if (ambiguousList.length) {
  console.log('\nAmbiguous / low-confidence:');
  ambiguousList.forEach(s => console.log('  ⚠ ' + s));
}
console.log('\nAction distribution:');
const actionCounts = {};
crosswalk.forEach(r => { actionCounts[r.action] = (actionCounts[r.action]||0)+1; });
Object.entries(actionCounts).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${v.toString().padStart(3)}  ${k}`));

const issues = unmatched + ambiguousList.filter(s => s.startsWith('UNMATCHED')).length;
console.log(`\n${issues <= 10 ? '✓' : '✗'} ${issues} issue(s) — ${issues <= 10 ? 'PROCEEDING to Part 2' : 'STOPPING — manual review required'}`);
