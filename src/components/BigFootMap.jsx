import { useState, useCallback, useRef, useEffect } from 'react'
import Map, { Layer, Source, NavigationControl, ScaleControl, Popup } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const INITIAL_VIEW = { longitude: -96, latitude: 39, zoom: 4, pitch: 0, bearing: 0 }
const STATES_URL = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'

// ── Data Quality Registry ────────────────────────────────
// Single source of truth for every layer's data provenance.
// Classification: REAL | MODELLED | CURATED
// Confidence: HIGH | DIRECTIONAL | LIMITED
const DATA_QUALITY = {
  states: {
    source: 'PublicaMundi CDN / US Census Bureau TIGER',
    sourceUrl: 'https://github.com/PublicaMundi/MappingAPI',
    classification: 'REAL',
    confidence: 'HIGH',
    lastUpdated: '2023',
    features: '51 polygons',
    suitable: 'Precise geographic analysis, state-level filtering, all use cases.',
    notSuitable: null,
    note: 'Official Census Bureau administrative boundaries. Most reliable layer in the platform.',
  },
  metros: {
    source: 'Python-generated circular buffers (May 2026)',
    sourceUrl: null,
    classification: 'MODELLED',
    confidence: 'DIRECTIONAL',
    lastUpdated: 'May 2026',
    features: '60 metro polygons',
    suitable: 'Market zone visualisation and strategic overview.',
    notSuitable: 'Precise boundary analysis. Not official CBSA polygons.',
    note: 'Circular approximations around metro centers. Real Census CBSA boundaries blocked by CORS. Will be replaced in Phase 2 via FastAPI proxy.',
  },
  population: {
    source: 'US Census Bureau 2023 county population estimates',
    sourceUrl: 'https://www.census.gov/programs-surveys/popest.html',
    classification: 'MODELLED',
    confidence: 'DIRECTIONAL',
    lastUpdated: '2023',
    features: '62 county zones',
    suitable: 'Identifying high-density markets and demand patterns.',
    notSuitable: 'Precise county boundary mapping. Circles are approximate, not real county shapes.',
    note: 'Population figures are real Census data. Boundaries are circular approximations around county centers, not real county polygons.',
  },
  urban_rural: {
    source: 'Manually curated — US Census urban-rural classification framework',
    sourceUrl: 'https://www.census.gov/programs-surveys/geography/guidance/geo-areas/urban-rural.html',
    classification: 'CURATED',
    confidence: 'DIRECTIONAL',
    lastUpdated: 'May 2026',
    features: '40 points (20 urban cores, 20 rural hubs)',
    suitable: 'Strategic overview of urban-rural market segmentation.',
    notSuitable: 'Comprehensive coverage. This is a starter set, not a complete classification.',
    note: 'Manually researched starter set. Will be replaced with algorithmic rural hub identification once test taker ZIP data is available.',
  },
  universities: {
    source: 'NCES IPEDS HD2023 — National Center for Education Statistics',
    sourceUrl: 'https://nces.ed.gov/ipeds/',
    classification: 'REAL',
    confidence: 'HIGH',
    lastUpdated: '2023',
    features: '5,987 accredited US institutions',
    suitable: 'Identifying specific campus locations, education cluster density, anchor test center markets. All use cases.',
    notSuitable: null,
    note: 'Every accredited degree-granting institution in the US with verified coordinates. Includes 2,762 four-year universities, 1,535 community colleges, and 1,690 other institutions. Source: NCES IPEDS Institutional Characteristics file HD2023.',
  },
  airports: {
    source: 'OpenFlights Airport Database',
    sourceUrl: 'https://github.com/jpatokal/openflights',
    classification: 'REAL',
    confidence: 'HIGH',
    lastUpdated: '2024',
    features: '1,054 US airports',
    suitable: 'All use cases including site planning, accessibility analysis, field operations routing.',
    notSuitable: null,
    note: 'Real airport names, IATA codes, and coordinates. Filtered to US commercial airports with valid IATA codes.',
  },
  healthcare: {
    source: 'CMS reference list (flagship) + city population model',
    sourceUrl: 'https://data.cms.gov',
    classification: 'MODELLED',
    confidence: 'DIRECTIONAL',
    lastUpdated: 'May 2026',
    features: '2,215 facilities',
    suitable: 'Healthcare workforce density analysis and market prioritisation.',
    notSuitable: 'Identifying specific hospitals or making facility-level decisions.',
    note: '20 major flagship hospitals use real coordinates. Remaining 2,195 are modelled from city populations. Will be replaced with CMS Provider of Services data in Phase 2.',
  },
  technology: {
    source: 'City population model with BLS-informed state-level boost',
    sourceUrl: 'https://www.bls.gov/oes/',
    classification: 'MODELLED',
    confidence: 'DIRECTIONAL',
    lastUpdated: 'May 2026',
    features: '2,737 hub points',
    suitable: 'Identifying technology workforce density for professional certification demand.',
    notSuitable: 'Locating specific tech employers or campuses.',
    note: 'Population-proportional model. State boost applied to CA, WA, TX, NY, MA, VA, CO, GA, IL, FL, NC, PA based on BLS computer occupation employment share.',
  },
  government: {
    source: 'City population model — all 50 state capitals included',
    sourceUrl: null,
    classification: 'MODELLED',
    confidence: 'DIRECTIONAL',
    lastUpdated: 'May 2026',
    features: '2,698 hub points',
    suitable: 'Government workforce density analysis. All cities 25k+ have government presence.',
    notSuitable: 'Locating specific federal buildings or government facilities.',
    note: 'Modelled from city populations. Future replacement: GSA Federal Real Property Profile (FRPP) database.',
  },
  financial: {
    source: 'FDIC BankFind Suite — Federal Deposit Insurance Corporation',
    sourceUrl: 'https://banks.data.fdic.gov',
    classification: 'REAL_PARTIAL',
    confidence: 'HIGH',
    lastUpdated: '2026',
    features: '8,557 real bank institutions (10k API sample)',
    suitable: 'Identifying real bank and financial institution locations. High confidence for included records.',
    notSuitable: 'Complete national coverage. FDIC API caps at 10,000 records. US has ~70,000+ total branches.',
    note: 'Real institution names and verified coordinates from the FDIC registry. 10k-record sample due to API limit. Full coverage requires paginated calls across all states — planned for Phase 2 backend.',
  },
  manufacturing: {
    source: 'WRI Global Power Plant Database — World Resources Institute',
    sourceUrl: 'https://github.com/wri/global-power-plant-database',
    classification: 'REAL',
    confidence: 'HIGH',
    lastUpdated: '2021',
    features: '3,579 industrial energy facilities (Gas, Coal, Oil, Biomass, Waste, Nuclear)',
    suitable: 'Identifying heavy industrial facility locations as a proxy for manufacturing workforce concentration. All use cases.',
    notSuitable: 'Light manufacturing, food processing, textiles. This layer covers energy-intensive industrial sites only.',
    note: 'Real facility names, owner, fuel type, capacity (MW), and verified coordinates from the WRI Global Power Plant Database. Industrial energy plants are a reliable proxy for heavy manufacturing workforce presence.',
  },
  railway: {
    source: 'City population model — Amtrak station logic',
    sourceUrl: null,
    classification: 'MODELLED',
    confidence: 'LIMITED',
    lastUpdated: 'May 2026',
    features: '1,545 hub points',
    suitable: 'Transit accessibility overview at national level.',
    notSuitable: 'Station-level analysis. Specific locations are approximate.',
    note: 'Weakest layer in the platform. Future replacement: Amtrak open data + GTFS feeds from major transit agencies.',
  },
  cultural: {
    source: 'City population model',
    sourceUrl: null,
    classification: 'MODELLED',
    confidence: 'DIRECTIONAL',
    lastUpdated: 'May 2026',
    features: '1,916 hub points',
    suitable: 'Civic infrastructure density overview.',
    notSuitable: 'Specific museum or venue locations.',
    note: 'Future replacement: IMLS Museum Data Files (35,000+ US museums with real addresses).',
  },
  agriculture: {
    source: 'City population model — 30 agricultural states only',
    sourceUrl: 'https://www.usda.gov/topics/data',
    classification: 'MODELLED',
    confidence: 'DIRECTIONAL',
    lastUpdated: 'May 2026',
    features: '1,439 hub points',
    suitable: 'Agricultural workforce density in farming states.',
    notSuitable: 'Non-agricultural states. Specific facility locations.',
    note: 'Restricted to 30 states with significant agricultural GDP share. Future replacement: USDA NASS data.',
  },
  psi_sites: {
    source: 'PSI Internal — Test Center List (March 2026)',
    sourceUrl: null,
    classification: 'REAL',
    confidence: 'HIGH',
    lastUpdated: 'March 2026',
    features: '561 active US + territory test centers',
    suitable: 'Network gap analysis, coverage mapping, capacity planning, site selection.',
    notSuitable: 'Closed or inactive sites — Active sites only.',
    note: 'Direct export from PSI admin system. Geocoded via US Census Bureau batch API with Nominatim fallback for territories. 50-mile radius rings are accurate geographic polygons computed via spherical trigonometry.',
  },
}

const QUALITY_COLORS = { REAL: '#22c55e', REAL_PARTIAL: '#86efac', MODELLED: '#eab308', CURATED: '#60a5fa', null: '#475569' }
const QUALITY_LABELS = { REAL: 'Real Data', REAL_PARTIAL: 'Real — Partial', MODELLED: 'Modelled', CURATED: 'Curated' }
const CONFIDENCE_COLORS = { HIGH: '#22c55e', DIRECTIONAL: '#eab308', LIMITED: '#f87171' }

// ── State / Metro population lookups ─────────────────────
const STATE_POPULATIONS = {
  'Alabama':2.1,'Alaska':0.7,'Arizona':7.4,'Arkansas':3.1,'California':39.0,
  'Colorado':5.9,'Connecticut':3.6,'Delaware':1.0,'Florida':22.6,'Georgia':11.0,
  'Hawaii':1.4,'Idaho':1.9,'Illinois':12.6,'Indiana':6.8,'Iowa':3.2,
  'Kansas':2.9,'Kentucky':4.5,'Louisiana':4.6,'Maine':1.4,'Maryland':6.2,
  'Massachusetts':7.0,'Michigan':10.0,'Minnesota':5.7,'Mississippi':3.0,'Missouri':6.2,
  'Montana':1.1,'Nebraska':2.0,'Nevada':3.2,'New Hampshire':1.4,'New Jersey':9.3,
  'New Mexico':2.1,'New York':19.7,'North Carolina':10.7,'North Dakota':0.8,'Ohio':11.8,
  'Oklahoma':4.0,'Oregon':4.3,'Pennsylvania':13.0,'Rhode Island':1.1,'South Carolina':5.3,
  'South Dakota':0.9,'Tennessee':7.1,'Texas':30.5,'Utah':3.4,'Vermont':0.6,
  'Virginia':8.7,'Washington':7.8,'West Virginia':1.8,'Wisconsin':5.9,'Wyoming':0.6,
}
const METRO_POPULATIONS = {
  'New York-Newark':20.1,'Los Angeles-Long Beach':13.2,'Chicago-Naperville':9.5,
  'Dallas-Fort Worth':7.8,'Houston-The Woodlands':7.4,'Washington-Arlington':6.4,
  'Miami-Fort Lauderdale':6.3,'Philadelphia-Camden':6.2,'Atlanta-Sandy Springs':6.2,
  'Phoenix-Mesa':5.1,'Boston-Cambridge':4.9,'Riverside-San Bernardino':4.6,
  'Seattle-Tacoma':4.0,'Minneapolis-St. Paul':3.7,'San Diego-Chula Vista':3.3,
  'Tampa-St. Petersburg':3.2,'Denver-Aurora':2.9,'St. Louis':2.8,
  'Baltimore-Columbia':2.9,'Orlando-Kissimmee':2.7,'San Antonio-New Braunfels':2.7,
  'Portland-Vancouver':2.5,'Sacramento-Roseville':2.4,'Pittsburgh':2.4,
  'Las Vegas-Henderson':2.3,'Cincinnati':2.3,'Austin-Round Rock':2.3,
  'Kansas City':2.2,'Columbus':2.1,'Indianapolis-Carmel':2.1,
}

const LAYER_COLORS = {
  universities:'#fbbf24',airports:'#34d399',healthcare:'#f87171',
  financial:'#4ade80',government:'#60a5fa',technology:'#818cf8',
  manufacturing:'#fb923c',railway:'#e2e8f0',cultural:'#c084fc',agriculture:'#86efac',
}
const HUB_LABELS = {
  universities:'Universities & Colleges',airports:'Airports',
  healthcare:'Healthcare',financial:'Financial',
  government:'Government',technology:'Technology',
  manufacturing:'Manufacturing',railway:'Railway & Transit',
  cultural:'Cultural',agriculture:'Agriculture',
}
const HUB_EMOJI = {
  airports:'✈',healthcare:'🏥',financial:'🏦',government:'🏛',
  technology:'💻',manufacturing:'🏭',railway:'🚉',cultural:'🎭',
  agriculture:'🌾',universities:'🎓',
}
const DENSITY_COLORS = {'Very High':'#ec4899','High':'#a855f7','Medium':'#6366f1'}

// ── PSI Test Center constants ─────────────────────────────
const PSI_COLORS = {
  oo:         '#f59e0b', // amber  — O&O premium
  authorized: '#38bdf8', // sky    — PSI Authorized
  mg:         '#a855f7', // purple — MG Testing
  td:         '#fb7185', // rose   — TD Testing
  amp:        '#2dd4bf', // teal   — AMP Authorized
  radii:      '#64748b', // slate  — radius rings
}
const PSI_LABELS = {
  oo:'O&O Sites', authorized:'PSI Authorized', mg:'MG Testing', td:'TD Testing', amp:'AMP Authorized',
}
const PSI_TYPE_MAP = {
  'PSI Owned':'oo', 'PSI Authorized':'authorized', 'MG TESTING':'mg', 'TD TESTING':'td', 'AMP Authorized':'amp',
}
const PSI_3P_KEYS = ['authorized','mg','td','amp']
const PSI_INTERACTIVE = ['psi-oo-circle','psi-authorized-circle','psi-mg-circle','psi-td-circle','psi-amp-circle']

const ICON_PATHS = {
  airports:`<path fill="white" d="M20 8C18 8 17 9 17 11L17 17L10 21L10 23L17 21L17 26L14 28L14 30L20 28L26 30L26 28L23 26L23 21L30 23L30 21L23 17L23 11C23 9 22 8 20 8Z"/>`,
  healthcare:`<path fill="white" d="M24 17H28V23H24V27H16V23H12V17H16V13H24V17Z"/>`,
  universities:`<path fill="white" d="M20 11L31 17L20 23L9 17ZM13 19.5L13 25C13 25 16 27 20 27C24 27 27 25 27 25L27 19.5L20 23ZM29 18L29 24L31 25L31 18Z"/>`,
  financial:`<path fill="white" d="M11 28H29V30H11ZM12 16H16V28H12ZM18 16H22V28H18ZM24 16H28V28H24ZM11 14H29V16H11ZM17 11H23V14H17Z"/>`,
  government:`<path fill="white" d="M20 9C16 9 12 12.5 12 17H28C28 12.5 24 9 20 9ZM10 17H30V19H10ZM12 19H16V27H12ZM18 19H22V27H18ZM24 19H28V27H24ZM10 27H30V29H10Z"/>`,
  technology:`<path fill="white" d="M14 14H26V26H14V14ZM16 16V24H24V16ZM18 18V22H22V18ZM12 17H14V19H12ZM12 21H14V23H12ZM26 17H28V19H26ZM26 21H28V23H26ZM17 12V14H19V12ZM21 12V14H23V12ZM17 26V28H19V26ZM21 26V28H23V26Z"/>`,
  manufacturing:`<path fill="white" d="M20 15C17.2 15 15 17.2 15 20C15 22.8 17.2 25 20 25C22.8 25 25 22.8 25 20C25 17.2 22.8 15 20 15ZM20 17.5C21.4 17.5 22.5 18.6 22.5 20C22.5 21.4 21.4 22.5 20 22.5C18.6 22.5 17.5 21.4 17.5 20C17.5 18.6 18.6 17.5 20 17.5ZM18 10L17 12.5C16 13 15 13.7 14.2 14.5L11.5 14L10 16.5L12 18C11.9 18.6 11.8 19.3 11.8 20C11.8 20.7 11.9 21.4 12 22L10 23.5L11.5 26L14.2 25.5C15 26.3 16 27 17 27.5L18 30H22L23 27.5C24 27 25 26.3 25.8 25.5L28.5 26L30 23.5L28 22C28.1 21.4 28.2 20.7 28.2 20C28.2 19.3 28.1 18.6 28 18L30 16.5L28.5 14L25.8 14.5C25 13.7 24 13 23 12.5L22 10Z"/>`,
  railway:`<path fill="white" d="M14 10H26C27.1 10 28 10.9 28 12V24C28 25.1 27.1 26 26 26H14C12.9 26 12 25.1 12 24V12C12 10.9 12.9 10 14 10ZM14 12V19H26V12ZM17 16H23V18H17ZM15 22C15 22.6 14.6 23 14 23C13.4 23 13 22.6 13 22C13 21.4 13.4 21 14 21C14.6 21 15 21.4 15 22ZM27 22C27 22.6 26.6 23 26 23C25.4 23 25 22.6 25 22C25 21.4 25.4 21 26 21C26.6 21 27 21.4 27 22ZM11 26L13 28H27L29 26Z"/>`,
  cultural:`<path fill="white" d="M20 9L22.9 15.9L30.5 16.5L25 21.3L26.8 28.7L20 24.5L13.2 28.7L15 21.3L9.5 16.5L17.1 15.9Z"/>`,
  agriculture:`<path stroke="white" stroke-width="2" stroke-linecap="round" fill="none" d="M20 28L20 15M20 15C20 15 15 12 12 8C15.5 10 19 13 20 15ZM20 15C20 15 25 12 28 8C24.5 10 21 13 20 15ZM20 19C20 19 15 16 12 12C15.5 14 19 17 20 19ZM20 19C20 19 25 16 28 12C24.5 14 21 17 20 19ZM20 23C20 23 15 20 12 16C15.5 18 19 21 20 23ZM20 23C20 23 25 20 28 16C24.5 18 21 21 20 23"/>`,
}
function makeIconSVG(key, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="18" fill="${color}"/>
  <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(2,8,23,0.7)" stroke-width="2.5"/>
  ${ICON_PATHS[key]||'<circle cx="20" cy="20" r="7" fill="white"/>'}</svg>`
}

const LAYER_GROUPS = [
  { label:'Base Layers', layers:[
    {key:'states',label:'State Boundaries',color:'#60a5fa',count:51},
    {key:'metros',label:'Metro Areas',color:'#22d3ee',count:60},
  ]},
  { label:'Population', layers:[
    {key:'population',label:'Population Density',color:'#f472b6',count:62},
    {key:'urban_rural',label:'Urban / Rural Zones',color:'#a78bfa',count:40},
  ]},
  { label:'Education', layers:[
    {key:'universities',label:'Universities & Colleges',color:'#fbbf24',count:5987},
  ]},
  { label:'Industry Hubs', layers:[
    {key:'airports',label:'Airports',color:'#34d399',count:1054},
    {key:'healthcare',label:'Healthcare',color:'#f87171',count:2215},
    {key:'financial',label:'Financial',color:'#4ade80',count:8557},
    {key:'government',label:'Government',color:'#60a5fa',count:2698},
    {key:'technology',label:'Technology',color:'#818cf8',count:2737},
    {key:'manufacturing',label:'Manufacturing',color:'#fb923c',count:3579},
    {key:'railway',label:'Railway & Transit',color:'#e2e8f0',count:1545},
    {key:'cultural',label:'Cultural',color:'#c084fc',count:1916},
    {key:'agriculture',label:'Agriculture',color:'#86efac',count:1439},
  ]},
]
const PSI_COUNTS = { oo:143, authorized:397, mg:33, td:20, amp:1 }
const PSI_3P_TOTAL = PSI_3P_KEYS.reduce((s,k) => s + (PSI_COUNTS[k]||0), 0)

// ── Performance Mode constants ────────────────────────
const PERF_TIER_LABELS = { 1:'At Risk', 2:'Watch List', 3:'Average', 4:'Strong', 5:'Top Performer' }
const PERF_TIER_COUNTS = { 1:13, 2:119, 3:169, 4:167, 5:56 }

// Dual color families — O&O stays amber, 3P stays blue even in perf mode
const PERF_OO_COLORS = { 5:'#fbbf24', 4:'#f59e0b', 3:'#d97706', 2:'#b45309', 1:'#92400e', 0:'#78716c' }
const PERF_3P_COLORS = { 5:'#22d3ee', 4:'#38bdf8', 3:'#60a5fa', 2:'#3b82f6', 1:'#1d4ed8', 0:'#64748b' }

// MapLibre expression: O&O amber family, 3P blue family, keyed by scoreBucket
const PERF_COLOR_EXPR = ['case',
  ['==', ['get','category'], 'OO'],
  ['match', ['coalesce',['get','scoreBucket'],0], 5,'#fbbf24', 4,'#f59e0b', 3,'#d97706', 2,'#b45309', 1,'#92400e', '#78716c'],
  ['match', ['coalesce',['get','scoreBucket'],0], 5,'#22d3ee', 4,'#38bdf8', 3,'#60a5fa', 2,'#3b82f6', 1,'#1d4ed8', '#64748b']
]
const AT_RISK_FILTER = ['==', ['coalesce',['get','scoreBucket'],0], 1]

// ── Optimus Mode constants ────────────────────────────
const OPTIMUS_COLORS     = { A:'#22c55e', B:'#818cf8', C:'#fb923c' }  // green/indigo/orange spectrum
const OPTIMUS_NO_DATA    = '#475569'
const OPTIMUS_TIER_LABELS = { A:'Top Quality', B:'Good', C:'Needs Improvement' }
const OPTIMUS_TIER_COUNTS = { A:0, B:49, C:77 }  // geocoded counts
const OPTIMUS_OO_COLOR = ['match', ['coalesce',['get','optimusTier'],''],
  'A','#22c55e', 'B','#818cf8', 'C','#fb923c', '#475569']
// Score-based radius: 6 + (optimusScore * 10) → range 6–16px; no-score → 5px
const OPTIMUS_RADIUS_EXPR = ['case',
  ['==', ['coalesce',['get','optimusTier'],''], ''],
  5,
  ['+', 6, ['*', ['coalesce',['get','optimusScore'],0], 10]]
]

// ── Lease Intelligence constants ─────────────────────
const LEASE_ACTION_COLORS = {
  'Relocate':'#ef4444','Refurbish':'#f97316','Assess-Close':'#7f1d1d',
  'Renew+Expand':'#22c55e','Renew':'#60a5fa','Review':'#a855f7',
}
const LEASE_RING_COLOR_EXPR = ['match', ['coalesce',['get','leaseAction'],''],
  'Relocate','#ef4444','Refurbish','#f97316','Assess-Close','#7f1d1d',
  'Renew+Expand','#22c55e','Renew','#60a5fa','Review','#a855f7','#475569']

// Log-scale volume radius (p10=75 → ln=4.3175, p90=11947 → ln=9.3882, range=5.0707)
// p90/p10 ratio = 159× — log scale required
const _LN_P10   = 4.317488
const _LN_P90   = 9.388152
const _LN_RANGE = 5.070664
const _logVol  = ['ln', ['max', 1, ['coalesce', ['get','cdVolume'], 0]]]
const _tExpr   = ['/', ['-', ['max', _LN_P10, ['min', _LN_P90, _logVol]], _LN_P10], _LN_RANGE]
const PERF_RADIUS_EXPR = ['case',
  ['<=', ['coalesce', ['get','cdVolume'], 0], 0],
  ['case', ['==', ['get','category'],'OO'], 6, 4],          // minR for zero/null volume
  ['case', ['==', ['get','category'],'OO'],
    ['+', 6,  ['*', _tExpr, 10]],   // O&O: 6 → 16
    ['+', 4,  ['*', _tExpr,  8]]    // 3P:  4 → 12
  ]
]

const DEFAULT_LAYERS = {
  states:true,metros:true,population:false,urban_rural:false,
  universities:false,airports:false,healthcare:false,financial:false,
  government:false,technology:false,manufacturing:false,
  railway:false,cultural:false,agriculture:false,
}
const POINT_LAYERS = ['universities','airports','healthcare','financial','government','technology','manufacturing','railway','cultural','agriculture']
const FONT = '"Segoe UI", system-ui, sans-serif'

function fmt(n) {
  if (!n) return 'N/A'
  if (n >= 1000000) return (n/1000000).toFixed(1)+'M'
  if (n >= 1000) return (n/1000).toFixed(0)+'K'
  return n.toString()
}

// ── Quality Badge ────────────────────────────────────────
function QualityBadge({ layerKey, small = false }) {
  const q = DATA_QUALITY[layerKey]
  if (!q) return null
  const color = QUALITY_COLORS[q.classification]
  const label = QUALITY_LABELS[q.classification]
  if (small) {
    return (
      <div title={`${label} — ${q.source}`} style={{
        width:8, height:8, borderRadius:'50%', background:color,
        flexShrink:0, boxShadow:`0 0 4px ${color}99`,
      }}/>
    )
  }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <div style={{ width:8, height:8, borderRadius:'50%', background:color, boxShadow:`0 0 4px ${color}99` }}/>
      <span style={{ fontSize:9, fontWeight:700, color, letterSpacing:'0.06em' }}>{label.toUpperCase()}</span>
    </div>
  )
}

// ── Data Source Panel (inside info card when quality mode ON) ──
function DataSourcePanel({ layerKey }) {
  const q = DATA_QUALITY[layerKey]
  if (!q) return null
  const classColor = QUALITY_COLORS[q.classification]
  const confColor = CONFIDENCE_COLORS[q.confidence]
  return (
    <div style={{
      marginTop:10, borderTop:'1px solid rgba(255,255,255,0.06)',
      paddingTop:10,
    }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'#475569', marginBottom:8 }}>
        Data Provenance
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        <SourceRow label="Source" value={q.source} color="#e2e8f0" />
        <SourceRow label="Classification"
          value={<span style={{color:classColor,fontWeight:700}}>{QUALITY_LABELS[q.classification]}</span>}
        />
        <SourceRow label="Confidence"
          value={<span style={{color:confColor,fontWeight:700}}>{q.confidence}</span>}
        />
        <SourceRow label="Last Updated" value={q.lastUpdated} />
        <SourceRow label="Features" value={q.features} />
      </div>
      {q.suitable && (
        <div style={{ marginTop:8, padding:'6px 8px', background:'rgba(34,197,94,0.08)', borderRadius:5, borderLeft:'2px solid #22c55e' }}>
          <div style={{ fontSize:9, color:'#22c55e', fontWeight:700, marginBottom:2 }}>SUITABLE FOR</div>
          <div style={{ fontSize:10, color:'#64748b', lineHeight:1.5 }}>{q.suitable}</div>
        </div>
      )}
      {q.notSuitable && (
        <div style={{ marginTop:6, padding:'6px 8px', background:'rgba(239,68,68,0.08)', borderRadius:5, borderLeft:'2px solid #ef4444' }}>
          <div style={{ fontSize:9, color:'#ef4444', fontWeight:700, marginBottom:2 }}>NOT SUITABLE FOR</div>
          <div style={{ fontSize:10, color:'#64748b', lineHeight:1.5 }}>{q.notSuitable}</div>
        </div>
      )}
      {q.note && (
        <div style={{ marginTop:6, padding:'6px 8px', background:'rgba(255,255,255,0.03)', borderRadius:5, borderLeft:'2px solid #475569' }}>
          <div style={{ fontSize:10, color:'#475569', lineHeight:1.5 }}>{q.note}</div>
        </div>
      )}
    </div>
  )
}

function SourceRow({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
      <span style={{ fontSize:10, color:'#475569', flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:10, color:'#94a3b8', textAlign:'right', lineHeight:1.4 }}>{value}</span>
    </div>
  )
}

// ── Data Quality Summary Bar ─────────────────────────────
function QualitySummaryBar({ layers }) {
  const active = Object.entries(layers).filter(([k,v]) => v && DATA_QUALITY[k])
  const counts = { REAL:0, MODELLED:0, CURATED:0 }
  active.forEach(([k]) => {
    const c = DATA_QUALITY[k]?.classification
    if (c) counts[c]++
  })
  return (
    <div style={{
      position:'absolute', top:80, left:'50%', transform:'translateX(-50%)',
      background:'rgba(2,8,23,0.95)', border:'1px solid rgba(234,179,8,0.4)',
      borderRadius:8, padding:'7px 16px', fontFamily:FONT,
      display:'flex', alignItems:'center', gap:14,
      boxShadow:'0 4px 16px rgba(0,0,0,0.5)',
      backdropFilter:'blur(10px)',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <div style={{ width:6, height:6, borderRadius:'50%', background:'#eab308' }}/>
        <span style={{ fontSize:10, color:'#eab308', fontWeight:700, letterSpacing:'0.06em' }}>DATA QUALITY MODE ACTIVE</span>
      </div>
      <span style={{ color:'#1e293b', fontSize:9 }}>|</span>
      {Object.entries(counts).map(([cls, n]) => n > 0 && (
        <div key={cls} style={{ display:'flex', alignItems:'center', gap:4 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:QUALITY_COLORS[cls] }}/>
          <span style={{ fontSize:10, color:QUALITY_COLORS[cls] }}>{n} {QUALITY_LABELS[cls]}</span>
        </div>
      ))}
      <span style={{ color:'#1e293b', fontSize:9 }}>|</span>
      <span style={{ fontSize:10, color:'#475569' }}>Hover layers for source · Click features for full provenance</span>
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────
function Legend({ layers, psiLayers, showRadii, qualityMode, performanceMode, optimusMode, showLeaseIntel }) {
  const [open, setOpen] = useState(true)
  const active    = Object.entries(layers).filter(([k,v]) => v)
  const psiActive = Object.entries(psiLayers||{}).filter(([k,v]) => v)
  if (active.length === 0 && psiActive.length === 0 && !showRadii && !performanceMode && !optimusMode && !showLeaseIntel) return null
  const allInfo = {}
  LAYER_GROUPS.forEach(g => g.layers.forEach(l => { allInfo[l.key] = l }))
  return (
    <div style={{
      position:'absolute', bottom:70, left:12,
      background:'rgba(2,8,23,0.92)', border:'1px solid rgba(96,165,250,0.2)',
      borderRadius:10, fontFamily:FONT,
      boxShadow:'0 4px 16px rgba(0,0,0,0.5)', backdropFilter:'blur(10px)',
      minWidth:190, maxWidth:230,
    }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'9px 13px', cursor:'pointer',
        borderBottom: open ? '1px solid rgba(255,255,255,0.05)' : 'none',
      }}>
        <span style={{ fontSize:10, fontWeight:700, color:'#94a3b8', letterSpacing:'0.1em', textTransform:'uppercase' }}>Legend</span>
        <span style={{ color:'#475569', fontSize:10 }}>{open ? '▼' : '▶'}</span>
      </div>
      {open && (
        <div style={{ padding:'8px 0 6px' }}>
          {active.map(([key]) => {
            const info = allInfo[key]
            if (!info) return null
            const q = DATA_QUALITY[key]
            const qColor = q ? QUALITY_COLORS[q.classification] : '#475569'

            if (key === 'population') return (
              <div key={key} style={{ padding:'4px 13px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:11, color:'#94a3b8', fontWeight:600 }}>Population Density</span>
                  {qualityMode && q && <div style={{ width:6, height:6, borderRadius:'50%', background:qColor }}/>}
                </div>
                {Object.entries(DENSITY_COLORS).map(([label, color]) => (
                  <div key={label} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                    <div style={{ width:12, height:12, borderRadius:3, background:color, opacity:0.85 }}/>
                    <span style={{ fontSize:10, color:'#64748b' }}>{label}</span>
                  </div>
                ))}
              </div>
            )
            if (key === 'metros') return (
              <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 13px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <svg width="24" height="12" viewBox="0 0 24 12">
                    <line x1="0" y1="6" x2="24" y2="6" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.8"/>
                  </svg>
                  <span style={{ fontSize:11, color:'#64748b' }}>Metro Areas</span>
                </div>
                {qualityMode && q && <div style={{ width:6, height:6, borderRadius:'50%', background:qColor }}/>}
              </div>
            )
            if (key === 'states') return (
              <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 13px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <svg width="24" height="12" viewBox="0 0 24 12">
                    <line x1="0" y1="6" x2="24" y2="6" stroke="#60a5fa" strokeWidth="1.5" opacity="0.8"/>
                  </svg>
                  <span style={{ fontSize:11, color:'#64748b' }}>State Boundaries</span>
                </div>
                {qualityMode && q && <div style={{ width:6, height:6, borderRadius:'50%', background:qColor }}/>}
              </div>
            )
            if (key === 'urban_rural') return (
              <div key={key} style={{ padding:'4px 13px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:11, color:'#94a3b8', fontWeight:600 }}>Urban / Rural</span>
                  {qualityMode && q && <div style={{ width:6, height:6, borderRadius:'50%', background:qColor }}/>}
                </div>
                {[['Major Urban','#38bdf8'],['Urban','#4ade80'],['Rural Hub','#92400e']].map(([label, color]) => (
                  <div key={label} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:color }}/>
                    <span style={{ fontSize:10, color:'#64748b' }}>{label}</span>
                  </div>
                ))}
              </div>
            )
            return (
              <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 13px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:14, height:14, borderRadius:'50%', background:info.color, flexShrink:0, boxShadow:`0 0 4px ${info.color}88` }}/>
                  <span style={{ fontSize:11, color:'#64748b' }}>{HUB_EMOJI[key]} {info.label}</span>
                </div>
                {qualityMode && q && <div style={{ width:6, height:6, borderRadius:'50%', background:qColor }}/>}
              </div>
            )
          })}
          {/* PSI legend entries */}
          {(psiActive.length > 0 || showRadii) && (
            <div style={{ padding:'6px 13px 4px', borderTop:'1px solid rgba(245,158,11,0.15)', marginTop:4 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#78350f', letterSpacing:'0.08em', marginBottom:5 }}>PSI TEST CENTERS</div>
              {psiLayers?.oo && (
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                  <div style={{ width:12, height:12, borderRadius:'50%', background:PSI_COLORS.oo, boxShadow:`0 0 5px ${PSI_COLORS.oo}88`, flexShrink:0 }}/>
                  <span style={{ fontSize:10, color:'#94a3b8', fontWeight:600 }}>O&O — PSI Owned</span>
                </div>
              )}
              {psiActive.filter(([k])=>PSI_3P_KEYS.includes(k)).map(([key])=>(
                <div key={key} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:PSI_COLORS[key], flexShrink:0 }}/>
                  <span style={{ fontSize:10, color:'#64748b' }}>{PSI_LABELS[key]}</span>
                </div>
              ))}
              {showRadii && (
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                  <svg width="20" height="10" viewBox="0 0 20 10">
                    <line x1="0" y1="5" x2="20" y2="5" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.6"/>
                  </svg>
                  <span style={{ fontSize:10, color:'#475569' }}>50-mile radius</span>
                </div>
              )}
            </div>
          )}

          {/* Lease Intelligence legend */}
          {showLeaseIntel && psiActive.length > 0 && (
            <div style={{ padding:'6px 13px 8px', borderTop:'1px solid rgba(249,115,22,0.25)', marginTop:4 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#92400e', letterSpacing:'0.08em', marginBottom:6 }}>LEASE DECISIONS</div>
              {[['Relocate','#ef4444',10],['Refurbish','#f97316',6],['Assess-Close','#7f1d1d',2],['Renew+Expand','#22c55e',3],['Renew','#60a5fa',35],['Review','#a855f7',1]].map(([label,color,count]) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                  <div style={{ width:11, height:11, borderRadius:'50%', background:'transparent', border:`2.5px solid ${color}`, flexShrink:0 }}/>
                  <span style={{ fontSize:10, color:'#64748b' }}>{label} <span style={{ color:'#334155' }}>({count})</span></span>
                </div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                <div style={{ width:11, height:11, borderRadius:'50%', background:'rgba(251,191,36,0.35)', flexShrink:0 }}/>
                <span style={{ fontSize:10, color:'#64748b' }}>Contract Flag <span style={{ color:'#334155' }}>(7)</span></span>
              </div>
              <div style={{ marginTop:6, padding:'5px 8px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:4 }}>
                <div style={{ fontSize:9, color:'#ef4444', lineHeight:1.7 }}>32 sites on expired leases<br/>$3.4M monthly revenue at risk</div>
              </div>
            </div>
          )}

          {/* Optimus legend */}
          {optimusMode && psiActive.length > 0 && (
            <div style={{ padding:'6px 13px 8px', borderTop:'1px solid rgba(168,85,247,0.2)', marginTop:4 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#7e22ce', letterSpacing:'0.08em', marginBottom:6 }}>OPTIMUS SITE QUALITY — O&O ONLY</div>
              {/* Tier rows with size-indicating dots (larger = higher score) */}
              {[['A','#22c55e','Top Quality',0,14],['B','#818cf8','Good',49,11],['C','#fb923c','Needs Improvement',77,8]].map(([tier,color,label,count,dotR]) => (
                <div key={tier} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
                  <div style={{ width:dotR, height:dotR, borderRadius:'50%', background:color, flexShrink:0, opacity:count===0?0.3:1 }}/>
                  <span style={{ fontSize:10, color:count===0?'#334155':'#64748b' }}>
                    Tier {tier} — {label}
                    <span style={{ color:'#334155', marginLeft:4 }}>({count})</span>
                  </span>
                </div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'#475569', flexShrink:0 }}/>
                <span style={{ fontSize:10, color:'#334155' }}>Not yet audited</span>
              </div>
              <div style={{ fontSize:9, color:'#475569', marginTop:3, marginBottom:7 }}>Circle size = Optimus quality score</div>
              <div style={{ padding:'5px 8px', background:'rgba(129,140,248,0.1)', border:'1px solid rgba(129,140,248,0.3)', borderRadius:4 }}>
                <div style={{ fontSize:9, color:'#818cf8', lineHeight:1.7 }}>
                  Average O&O quality score: 65.6%<br/>Target for Tier A: 85%+<br/>No O&O site currently achieves Tier A.
                </div>
              </div>
            </div>
          )}

          {/* Performance legend — two-column grid */}
          {performanceMode && psiActive.length > 0 && (
            <div style={{ padding:'6px 13px 8px', borderTop:'1px solid rgba(34,197,94,0.2)', marginTop:4 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#14532d', letterSpacing:'0.08em', marginBottom:6 }}>PERFORMANCE TIER</div>
              {/* Column headers */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, marginBottom:5 }}>
                <span style={{ fontSize:9, fontWeight:700, color:'#78350f', letterSpacing:'0.04em' }}>O&O SITES</span>
                <span style={{ fontSize:9, fontWeight:700, color:'#0c4a6e', letterSpacing:'0.04em' }}>3P SITES</span>
              </div>
              {/* 5 tier rows */}
              {[5,4,3,2,1].map(b => (
                <div key={b} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, marginBottom:4, alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:PERF_OO_COLORS[b], flexShrink:0 }}/>
                    <span style={{ fontSize:9, color:'#64748b' }}>
                      {PERF_TIER_LABELS[b]}
                      {PERF_TIER_COUNTS[b] && <span style={{ color:'#334155', marginLeft:3 }}>({PERF_TIER_COUNTS[b]})</span>}
                    </span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:PERF_3P_COLORS[b], flexShrink:0 }}/>
                    <span style={{ fontSize:9, color:'#64748b' }}>{PERF_TIER_LABELS[b]}</span>
                  </div>
                </div>
              ))}
              {/* Notes */}
              <div style={{ marginTop:7, paddingTop:6, borderTop:'1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize:9, color:'#475569', marginBottom:2 }}>Lighter shade = better performance</div>
                <div style={{ fontSize:9, color:'#475569' }}>Circle size = exam volume delivered</div>
              </div>
              {/* At Risk callout */}
              <div style={{ marginTop:7, padding:'5px 8px', background:'rgba(146,64,14,0.12)', border:'1px solid rgba(146,64,14,0.35)', borderRadius:5 }}>
                <span style={{ fontSize:9, fontWeight:700, color:'#92400e' }}>⚠ 13 At Risk sites identified across the network</span>
              </div>
            </div>
          )}

          {qualityMode && (
            <div style={{ margin:'8px 13px 4px', padding:'6px 8px', background:'rgba(255,255,255,0.03)', borderRadius:6 }}>
              <div style={{ fontSize:9, color:'#475569', marginBottom:4, fontWeight:700, letterSpacing:'0.06em' }}>QUALITY LEGEND</div>
              {[['REAL','#22c55e','Real data from named source'],['REAL_PARTIAL','#86efac','Real data — partial sample'],['MODELLED','#eab308','Population-proportional model'],['CURATED','#60a5fa','Manually researched']].map(([cls,color,desc]) => (
                <div key={cls} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0 }}/>
                  <span style={{ fontSize:9, color:'#475569' }}>{desc}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Info Card ────────────────────────────────────────────
function InfoCard({ info, onClose, qualityMode, optimusMode, showLeaseIntel }) {
  if (!info) return null

  // PSI site card
  if (info.isPsi) {
    const typeKey     = PSI_TYPE_MAP[info.propertyType] || 'authorized'
    const accentColor = PSI_COLORS[typeKey]
    const catLabel    = info.psiCategory === 'OO' ? 'Owned & Operated' : '3rd Party'
    return (
      <div style={{ position:'absolute', bottom:70, right:12, background:'rgba(2,8,23,0.97)', border:`1px solid ${accentColor}44`, borderRadius:12, padding:0, width:270, fontFamily:FONT, boxShadow:'0 6px 30px rgba(0,0,0,0.7)', backdropFilter:'blur(12px)', maxHeight:'70vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'12px 16px 10px', borderBottom:`1px solid ${accentColor}22` }}>
          <div>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:accentColor, marginBottom:3 }}>
              📍 PSI Test Center
            </div>
            <div style={{ fontSize:14, fontWeight:700, color:'#f1f5f9', lineHeight:1.3 }}>{info.name}</div>
          </div>
          <div onClick={onClose} style={{ cursor:'pointer', color:'#475569', fontSize:16, width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', background:'rgba(255,255,255,0.05)', flexShrink:0 }}>×</div>
        </div>
        <div style={{ padding:'10px 16px 14px' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginBottom:10, padding:'3px 10px', borderRadius:4, background:`${accentColor}18`, border:`1px solid ${accentColor}44` }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:accentColor, flexShrink:0 }}/>
            <span style={{ fontSize:10, fontWeight:700, color:accentColor }}>{catLabel} · {info.propertyType}</span>
          </div>
          <InfoRow label="Center ID" value={info.psiId} color="#94a3b8" />
          {info.address && <InfoRow label="Address" value={info.address} />}
          <InfoRow label="City" value={info.city} />
          {info.state && <InfoRow label="State" value={info.state} />}
          {info.zip   && <InfoRow label="ZIP"   value={info.zip} />}
          {info.country !== 'USA' && info.country && <InfoRow label="Territory" value={info.country} />}

          {/* Performance section */}
          {info.scoreBucket != null && (
            <div style={{ marginTop:10, borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:10 }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:'#475569', marginBottom:7 }}>PERFORMANCE 2024–25</div>
              {(() => {
                const tierColors = info.psiCategory === 'OO' ? PERF_OO_COLORS : PERF_3P_COLORS
                const tc = tierColors[info.scoreBucket] || tierColors[0]
                return (<>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginBottom:info.scoreBucket===1?4:8, padding:'3px 9px', borderRadius:4, background:`${tc}18`, border:`1px solid ${tc}44` }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:tc, flexShrink:0 }}/>
                    <span style={{ fontSize:10, fontWeight:700, color:tc }}>
                      Performance Tier: {PERF_TIER_LABELS[info.scoreBucket]}
                    </span>
                  </div>
                  {info.scoreBucket === 1 && (
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:8, padding:'4px 8px', background:'rgba(239,68,68,0.1)', borderRadius:4, border:'1px solid rgba(239,68,68,0.3)' }}>
                      <span style={{ fontSize:9, color:'#ef4444', fontWeight:700 }}>⚠ This site requires immediate attention</span>
                    </div>
                  )}
                </>)
              })()}
              {info.cdVolume    != null && <InfoRow label="CD Volume"      value={info.cdVolume.toLocaleString()} color="#94a3b8" />}
              {info.avgMonthlyVol != null && <InfoRow label="Monthly Avg"  value={Math.round(info.avgMonthlyVol).toLocaleString()} />}
              {info.seats       != null && <InfoRow label="Seats"          value={info.seats.toLocaleString()} />}
              {info.dispRate    != null && <InfoRow label="Displacement"   value={(info.dispRate*100).toFixed(1)+'%'}   color={info.dispRate>0.03?'#f97316':info.dispRate>0.01?'#eab308':'#94a3b8'} />}
              {info.reschdRate  != null && <InfoRow label="Reschedule"     value={(info.reschdRate*100).toFixed(1)+'%'} color={info.reschdRate>0.05?'#f97316':info.reschdRate>0.02?'#eab308':'#94a3b8'} />}
              {info.dmaRegion               && <InfoRow label="DMA Region" value={info.dmaRegion} />}
            </div>
          )}

          {/* Optimus Quality Score — always shown for O&O sites */}
          {info.psiCategory === 'OO' && (
            <div style={{ marginTop:10, borderTop:'1px solid rgba(168,85,247,0.2)', paddingTop:10 }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:'#a855f7', marginBottom:7 }}>OPTIMUS QUALITY SCORE</div>
              {!info.optimusTier ? (
                <div style={{ fontSize:10, color:'#475569', fontStyle:'italic' }}>No Optimus audit on record</div>
              ) : (() => {
                const catColor = v => v == null ? '#334155' : v >= 0.85 ? '#22c55e' : v >= 0.70 ? '#818cf8' : '#fb923c'
                const pct = (info.optimusScore||0)*100
                const barCol = pct >= 85 ? '#22c55e' : pct >= 70 ? '#818cf8' : '#fb923c'
                const tc = OPTIMUS_COLORS[info.optimusTier]||'#475569'
                const CATS = [
                  ['oc01','Site Exterior'],      ['oc02','Entrance & Lobby'],
                  ['oc03','Reception'],           ['oc04','Testing Rooms'],
                  ['oc05','Restrooms'],           ['oc06','Employee / Storage'],
                  ['oc07','ADA Compliance'],      ['oc08','Signage & Branding'],
                  ['oc09','Private Room'],
                ]
                return (<>
                  {/* Score bar */}
                  <div style={{ marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#64748b', marginBottom:3 }}>
                      <span>Overall Score</span>
                      <span style={{ color:barCol, fontWeight:700 }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{ height:5, background:'rgba(255,255,255,0.08)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', borderRadius:3, background:barCol }}/>
                    </div>
                  </div>
                  {/* Tier badge + date */}
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:7 }}>
                    <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:4, background:`${tc}18`, border:`1px solid ${tc}44` }}>
                      <span style={{ fontSize:9, fontWeight:700, color:tc }}>Tier {info.optimusTier} — {OPTIMUS_TIER_LABELS[info.optimusTier]}</span>
                    </div>
                    {info.osDate && <span style={{ fontSize:9, color:'#334155' }}>{info.osDate}</span>}
                  </div>
                  {/* Category grid */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px 10px', marginBottom:6 }}>
                    {CATS.map(([key, label]) => {
                      const v = info[key]
                      const c = catColor(v)
                      return (
                        <div key={key}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                            <span style={{ fontSize:8, color:'#475569' }}>{label}</span>
                            <span style={{ fontSize:8, color:c, fontWeight:600 }}>{v != null ? (v*100).toFixed(0)+'%' : '—'}</span>
                          </div>
                          <div style={{ height:3, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
                            {v != null && <div style={{ width:`${v*100}%`, height:'100%', background:c, borderRadius:2 }}/>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Flags */}
                  {info.adaFlag && (
                    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 7px', background:'rgba(239,68,68,0.1)', borderRadius:4, border:'1px solid rgba(239,68,68,0.3)', marginBottom:4 }}>
                      <span style={{ fontSize:9, color:'#ef4444', fontWeight:700 }}>⚠ ADA compliance issue flagged</span>
                    </div>
                  )}
                  {info.brandingFlag && (
                    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 7px', background:'rgba(245,158,11,0.1)', borderRadius:4, border:'1px solid rgba(245,158,11,0.3)', marginBottom:4 }}>
                      <span style={{ fontSize:9, color:'#f59e0b', fontWeight:700 }}>⚠ Branding requires update</span>
                    </div>
                  )}
                  {/* Quick Wins if present */}
                  {info.quickWins && (
                    <div style={{ padding:'5px 8px', background:'rgba(168,85,247,0.06)', borderRadius:5, borderLeft:'2px solid #a855f7', marginTop:4 }}>
                      <div style={{ fontSize:9, color:'#a855f7', fontWeight:700, marginBottom:2 }}>QUICK WINS</div>
                      <div style={{ fontSize:9, color:'#64748b', lineHeight:1.5, fontStyle:'italic' }}>{info.quickWins}</div>
                    </div>
                  )}
                </>)
              })()}
            </div>
          )}

          {/* Lease Intelligence section */}
          {showLeaseIntel && info.leaseAction && (
            <div style={{ marginTop:10, borderTop:'1px solid rgba(249,115,22,0.2)', paddingTop:10 }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:'#475569', marginBottom:7 }}>LEASE INTELLIGENCE</div>
              <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginBottom:info.leaseOnThirdParty?4:7, padding:'3px 9px', borderRadius:4, background:`${LEASE_ACTION_COLORS[info.leaseAction]||'#475569'}18`, border:`1px solid ${LEASE_ACTION_COLORS[info.leaseAction]||'#475569'}44` }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:LEASE_ACTION_COLORS[info.leaseAction]||'#475569', flexShrink:0 }}/>
                <span style={{ fontSize:10, fontWeight:700, color:LEASE_ACTION_COLORS[info.leaseAction]||'#475569' }}>{info.leaseAction}</span>
              </div>
              {info.leaseOnThirdParty && (
                <div style={{ fontSize:9, color:'#f59e0b', marginBottom:6, fontStyle:'italic' }}>
                  ⚠ Partner (3P) site — lease ownership pending confirmation
                </div>
              )}
              {info.leaseStatus && <InfoRow label="Lease Status" value={info.leaseStatus} color={info.leaseStatus==='EXPIRED'?'#ef4444':info.leaseStatus.startsWith('<')?'#f97316':'#94a3b8'} />}
              {info.daysRemaining != null && info.daysRemaining < 0 && <InfoRow label="Days Overdue" value={Math.abs(info.daysRemaining).toLocaleString()} color="#ef4444" />}
              {info.leaseExpiry && <InfoRow label="Lease Expiry" value={info.leaseExpiry} />}
              {info.leaseUtilization != null && <InfoRow label="FY25 Utilization" value={(info.leaseUtilization*100).toFixed(0)+'%'} color={info.leaseUtilization>=0.80?'#22c55e':info.leaseUtilization>=0.60?'#eab308':'#ef4444'} />}
              {info.monthlyRevenue != null && <InfoRow label="Monthly Revenue" value={'$'+Math.round(info.monthlyRevenue).toLocaleString()} color="#94a3b8" />}
              {info.licensureNote && <InfoRow label="Contract Note" value={info.licensureNote} />}
              {info.recommendedAction && (
                <div style={{ marginTop:6, padding:'5px 8px', background:'rgba(249,115,22,0.06)', borderRadius:4, borderLeft:'2px solid #f97316' }}>
                  <div style={{ fontSize:9, color:'#f97316', fontWeight:700, marginBottom:2 }}>RECOMMENDED</div>
                  <div style={{ fontSize:10, color:'#64748b', lineHeight:1.5, fontStyle:'italic' }}>{info.recommendedAction}</div>
                </div>
              )}
              {info.contractFlag && (
                <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:5, padding:'4px 8px', background:'rgba(251,191,36,0.1)', borderRadius:4, border:'1px solid rgba(251,191,36,0.3)' }}>
                  <span style={{ fontSize:9, color:'#fbbf24', fontWeight:700 }}>⚠ Contract alignment review required</span>
                </div>
              )}
            </div>
          )}

          {qualityMode && <DataSourcePanel layerKey="psi_sites" />}
        </div>
      </div>
    )
  }

  // Existing layers card
  const accentColor = LAYER_COLORS[info.layerId] || '#60a5fa'
  return (
    <div style={{
      position:'absolute', bottom:70, right:12,
      background:'rgba(2,8,23,0.97)', border:`1px solid ${accentColor}44`,
      borderRadius:12, padding:0, width:270,
      fontFamily:FONT, boxShadow:'0 6px 30px rgba(0,0,0,0.7)',
      backdropFilter:'blur(12px)', maxHeight:'70vh', overflowY:'auto',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'12px 16px 10px', borderBottom:`1px solid ${accentColor}22` }}>
        <div>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:accentColor, marginBottom:3 }}>
            {HUB_EMOJI[info.layerId] || '📍'} {info.type || info.layerId}
          </div>
          <div style={{ fontSize:14, fontWeight:700, color:'#f1f5f9', lineHeight:1.2 }}>{info.name}</div>
        </div>
        <div onClick={onClose} style={{ cursor:'pointer', color:'#475569', fontSize:16, width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'50%', background:'rgba(255,255,255,0.05)', flexShrink:0 }}>×</div>
      </div>
      <div style={{ padding:'10px 16px 14px' }}>
        {(info.city||info.state) && <InfoRow label="Location" value={[info.city,info.state].filter(Boolean).join(', ')} />}
        {info.iata && <InfoRow label="IATA Code" value={info.iata} color="#34d399" />}
        {info.enrollment && <InfoRow label="Enrollment" value={fmt(info.enrollment)+' students'} color="#fbbf24" />}
        {info.layerId === 'population' && (
          <>
            <InfoRow label="Density Tier" value={info.density} color={DENSITY_COLORS[info.density]||'#a855f7'} />
            <InfoRow label="Population" value={fmt(info.population)} color="#f472b6" />
            <div style={{ marginTop:8, padding:'7px 9px', background:'rgba(244,114,182,0.08)', borderRadius:5, borderLeft:`2px solid ${DENSITY_COLORS[info.density]||'#a855f7'}` }}>
              <div style={{ fontSize:10, color:'#64748b', lineHeight:1.5 }}>
                {info.density==='Very High' && 'Core metro area. High candidate density. Priority market.'}
                {info.density==='High' && 'Significant urban population. Strong candidate demand. Review test center capacity.'}
                {info.density==='Medium' && 'Mid-density suburban zone. Moderate demand. Gap analysis recommended.'}
              </div>
            </div>
          </>
        )}
        {info.layerId==='metros' && info.metroPop && <InfoRow label="Metro Population" value={info.metroPop+'M people'} color="#22d3ee" />}
        {info.layerId==='states' && info.statePop && <InfoRow label="State Population" value={info.statePop+'M people'} color="#60a5fa" />}
        {qualityMode && <DataSourcePanel layerKey={info.layerId} />}
      </div>
    </div>
  )
}

function InfoRow({ label, value, color }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ fontSize:11, color:'#64748b' }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:600, color:color||'#e2e8f0' }}>{value}</span>
    </div>
  )
}

// ── Main Map Component ────────────────────────────────────
export default function BigFootMap() {
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const [layers, setLayers] = useState(DEFAULT_LAYERS)
  const [collapsed, setCollapsed] = useState({})
  const [hoverInfo, setHoverInfo] = useState(null)
  const [clickInfo, setClickInfo] = useState(null)
  const [cursor, setCursor] = useState('grab')
  const [iconsLoaded, setIconsLoaded] = useState(false)
  const [qualityMode, setQualityMode] = useState(false)
  const [psiLayers, setPsiLayers]       = useState({oo:true,authorized:true,mg:true,td:true,amp:true})
  const [showRadii, setShowRadii]       = useState(false)
  const [psiCollapsed, setPsiCollapsed] = useState({group:false,thirdParty:true})
  const [performanceMode, setPerformanceMode] = useState(false)
  const [optimusMode,     setOptimusMode]     = useState(false)
  const [showLeaseIntel,  setShowLeaseIntel]  = useState(false)
  const togglePerformanceMode = () => { setPerformanceMode(p => { if (!p) setOptimusMode(false); return !p; }) }
  const toggleOptimusMode     = () => { setOptimusMode(o => { if (!o) setPerformanceMode(false); return !o; }) }
  const mapRef = useRef(null)

  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    Promise.all(Object.keys(ICON_PATHS).map(key => new Promise(resolve => {
      const svg = makeIconSVG(key, LAYER_COLORS[key])
      const blob = new Blob([svg], { type:'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const img = new Image(40, 40)
      img.onload = () => { if (!map.hasImage(`icon-${key}`)) map.addImage(`icon-${key}`, img, {pixelRatio:2}); URL.revokeObjectURL(url); resolve() }
      img.onerror = () => { URL.revokeObjectURL(url); resolve() }
      img.src = url
    }))).then(() => setIconsLoaded(true))
  }, [])

  const toggle = (key) => setLayers(prev => ({...prev, [key]:!prev[key]}))
  const toggleGroup = (label) => setCollapsed(prev => ({...prev, [label]:!prev[label]}))
  const allInGroup = (group) => group.layers.every(l => layers[l.key])
  const toggleGroupAll = (group) => {
    const allOn = allInGroup(group)
    const update = {}
    group.layers.forEach(l => { update[l.key] = !allOn })
    setLayers(prev => ({...prev,...update}))
  }

  const showNormalMode = !performanceMode && !optimusMode

  const activePsiPropTypes = [
    ...(psiLayers.oo         ? ['PSI Owned']      : []),
    ...(psiLayers.authorized ? ['PSI Authorized'] : []),
    ...(psiLayers.mg         ? ['MG TESTING']     : []),
    ...(psiLayers.td         ? ['TD TESTING']     : []),
    ...(psiLayers.amp        ? ['AMP Authorized'] : []),
  ]
  const anyPsiActive   = activePsiPropTypes.length > 0
  const perfLayerFilter = anyPsiActive
    ? ['in', ['get','propertyType'], ['literal', activePsiPropTypes]]
    : ['==', ['get','id'], '_none_']

  // ── Filter state ──────────────────────────────────────
  const [filterPanelOpen,  setFilterPanelOpen]  = useState(false)
  const [availableStates,  setAvailableStates]  = useState([])
  const [filterStates,     setFilterStates]     = useState(null)   // null = all
  const [filterPerfTiers,  setFilterPerfTiers]  = useState(null)   // null = all; Set<string>
  const [filterOptusTiers, setFilterOptusTiers] = useState(null)   // null = all; Set<string>
  const [stateDropOpen,    setStateDropOpen]    = useState(false)

  useEffect(() => {
    fetch('/data/data_psi_sites.geojson').then(r => r.json())
      .then(d => setAvailableStates([...new Set(d.features.map(f => f.properties.state).filter(Boolean))].sort()))
      .catch(() => {})
  }, [])

  const hasActiveFilters = filterStates !== null ||
    (performanceMode && filterPerfTiers !== null) ||
    (optimusMode && filterOptusTiers !== null)

  const addPsiFilters = (base) => {
    const parts = [base]
    if (filterStates) parts.push(['in',['get','state'],['literal',[...filterStates]]])
    if (performanceMode && filterPerfTiers) {
      const vals = [...filterPerfTiers].map(v => v==='no-data' ? 0 : Number(v))
      parts.push(['in',['coalesce',['get','scoreBucket'],0],['literal',vals]])
    }
    if (optimusMode && filterOptusTiers) {
      const vals = [...filterOptusTiers].map(v => v==='no-score' ? '' : v)
      parts.push(['in',['coalesce',['get','optimusTier'],''],['literal',vals]])
    }
    return parts.length > 1 ? ['all',...parts] : parts[0]
  }

  const interactiveIds = [
    ...POINT_LAYERS.map(k=>`${k}-symbol`),
    'urban-rural-circle','population-fill','metros-fill','states-fill',
    ...(performanceMode ? ['psi-perf-circle'] :
        optimusMode     ? ['psi-optimus-oo-circle','psi-authorized-circle','psi-mg-circle','psi-td-circle','psi-amp-circle'] :
        PSI_INTERACTIVE),
  ]

  const togglePsi    = (key) => setPsiLayers(prev => ({...prev, [key]:!prev[key]}))
  const all3pOn      = PSI_3P_KEYS.every(k => psiLayers[k])
  const any3pOn      = PSI_3P_KEYS.some(k => psiLayers[k])
  const toggle3pAll  = () => { const v = !all3pOn; setPsiLayers(prev => ({...prev, ...Object.fromEntries(PSI_3P_KEYS.map(k=>[k,v]))})) }
  const allPsiOn     = ['oo',...PSI_3P_KEYS].every(k => psiLayers[k])
  const toggleAllPsi = () => { const v = !allPsiOn; setPsiLayers(Object.fromEntries(Object.keys(psiLayers).map(k=>[k,v]))) }

  const extractInfo = useCallback((f) => {
    const props  = f.properties
    const coords = f.geometry?.type==='Point' ? f.geometry.coordinates : null
    const lid    = f.layer.id

    if (PSI_INTERACTIVE.includes(lid) || lid === 'psi-perf-circle' || lid === 'psi-optimus-oo-circle') {
      return {
        lon: coords?.[0]??null, lat: coords?.[1]??null,
        name: props.name||'Unknown Site',
        layerId: 'psi_sites', isPsi: true,
        psiId: props.id||'',
        propertyType: props.propertyType||'',
        psiCategory: props.category||'',
        address: props.address||'',
        city: props.city||'', state: props.state||'',
        zip: props.zip||'', country: props.country||'',
        // Performance fields
        scoreBucket:   props.scoreBucket   ?? null,
        scoreRaw:      props.scoreRaw      ?? null,
        seats:         props.seats         ?? null,
        cdVolume:      props.cdVolume      ?? null,
        avgMonthlyVol: props.avgMonthlyVol ?? null,
        zdTicketRate:  props.zdTicketRate  ?? null,
        dispRate:      props.dispRate      ?? null,
        reschdRate:    props.reschdRate     ?? null,
        dmaRegion:     props.dmaRegion     || null,
        // Lease fields
        leaseAction:        props.leaseAction        || null,
        leaseStatus:        props.leaseStatus         || null,
        daysRemaining:      props.daysRemaining       ?? null,
        leaseUtilization:   props.leaseUtilization    ?? null,
        monthlyRevenue:     props.monthlyRevenue      ?? null,
        contractFlag:       props.contractFlag        === true,
        recommendedAction:  props.recommendedAction   || null,
        licensureNote:      props.licensureNote       || null,
        leaseExpiry:        props.leaseExpiry         || null,
        leaseOnThirdParty:  props.leaseOnThirdParty   === true,
        // Optimus summary
        optimusScore:    props.optimusScore    ?? null,
        optimusTier:     props.optimusTier     || null,
        fy25Volume:      props.fy25Volume      ?? null,
        fy25Utilization: props.fy25Utilization ?? null,
        priority:        props.priority        || null,
        quickWins:       props.quickWins       || null,
        // Optimus categories + flags
        osDate:      props.osDate      || null,
        oc01: props.oc01 ?? null, oc02: props.oc02 ?? null, oc03: props.oc03 ?? null,
        oc04: props.oc04 ?? null, oc05: props.oc05 ?? null, oc06: props.oc06 ?? null,
        oc07: props.oc07 ?? null, oc08: props.oc08 ?? null, oc09: props.oc09 ?? null,
        adaFlag:      props.adaFlag      === true,
        brandingFlag: props.brandingFlag === true,
      }
    }

    // normalise layer ID: strip suffixes, fix urban-rural → urban_rural
    const rawId = lid.replace('-symbol','').replace('-circle','').replace('-fill','')
    const layerId = rawId === 'urban-rural' ? 'urban_rural' : rawId
    return {
      lon: coords?.[0]||null, lat: coords?.[1]||null,
      name: props.name||props.NAME||'Unknown',
      type: props.type||HUB_LABELS[layerId]||layerId,
      city: props.city||'', state: props.state||'',
      iata: props.iata||'', layerId,
      enrollment: props.enrollment||null,
      population: props.population||null,
      density: props.density||null,
      metroPop: METRO_POPULATIONS[props.name||props.NAME]||null,
      statePop: STATE_POPULATIONS[props.name||props.NAME]||null,
    }
  }, [])

  const onMouseMove = useCallback((e) => {
    const f = e.features?.[0]
    if (f) { setHoverInfo(extractInfo(f)); setCursor('pointer') }
    else { setHoverInfo(null); setCursor('grab') }
  }, [extractInfo])

  const onMouseLeave = useCallback(() => { setHoverInfo(null); setCursor('grab') }, [])

  const onMapClick = useCallback((e) => {
    const f = e.features?.[0]
    if (f) {
      const info = extractInfo(f)
      if (!info.lon) { info.lon = e.lngLat.lng; info.lat = e.lngLat.lat }
      setClickInfo(info)
    } else { setClickInfo(null) }
  }, [extractInfo])

  return (
    <div style={{ width:'100vw', height:'100vh', position:'relative', background:'#020817' }}>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={e => setViewState(e.viewState)}
        onLoad={onMapLoad}
        onClick={onMapClick}
        style={{ width:'100%', height:'100%' }}
        mapStyle={MAP_STYLE}
        minZoom={3}
        maxBounds={[[-175,15],[-50,75]]}
        cursor={cursor}
        interactiveLayerIds={interactiveIds}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {layers.states && (
          <Source id="states" type="geojson" data={STATES_URL}>
            <Layer id="states-fill" type="fill" paint={{'fill-color':'#1e40af','fill-opacity':0.12}}/>
            <Layer id="states-line" type="line" paint={{'line-color':'#60a5fa','line-width':0.9,'line-opacity':0.7}}/>
          </Source>
        )}
        {layers.metros && (
          <Source id="metros" type="geojson" data="/data/metros.geojson">
            <Layer id="metros-fill" type="fill" paint={{'fill-color':'#0891b2','fill-opacity':0.07}}/>
            <Layer id="metros-line" type="line" paint={{'line-color':'#22d3ee','line-width':1.1,'line-opacity':0.65,'line-dasharray':[4,3]}}/>
          </Source>
        )}
        {layers.population && (
          <Source id="population" type="geojson" data="/data/data_population.geojson">
            <Layer id="population-fill" type="fill" paint={{'fill-color':['match',['get','density'],'Very High','#ec4899','High','#a855f7','Medium','#6366f1','#334155'],'fill-opacity':0.25}}/>
            <Layer id="population-line" type="line" paint={{'line-color':'#f472b6','line-width':0.5,'line-opacity':0.4}}/>
          </Source>
        )}
        {layers.urban_rural && (
          <Source id="urban_rural" type="geojson" data="/data/data_urban_rural.geojson">
            <Layer id="urban-rural-circle" type="circle" paint={{'circle-radius':8,'circle-color':['match',['get','classification'],'Major Urban','#38bdf8','Urban','#4ade80','#92400e'],'circle-opacity':0.75,'circle-stroke-color':'#020817','circle-stroke-width':1}}/>
          </Source>
        )}
        {/* PSI 50-mile radii — type-filtered and color-coded, rendered below industry icons */}
        <Source id="psi-radii" type="geojson" data="/data/data_psi_radii.geojson">
          {/* O&O — amber, bolder line */}
          {psiLayers.oo && showRadii && <Layer id="psi-radii-oo-line" type="line" filter={addPsiFilters(['==',['get','propertyType'],'PSI Owned'])} paint={{'line-color':'#f59e0b','line-width':1.5,'line-opacity':0.6,'line-dasharray':[5,3]}}/>}
          {/* PSI Authorized — sky */}
          {psiLayers.authorized && showRadii && <Layer id="psi-radii-authorized-line" type="line" filter={addPsiFilters(['==',['get','propertyType'],'PSI Authorized'])} paint={{'line-color':'#38bdf8','line-width':1,'line-opacity':0.45,'line-dasharray':[4,3]}}/>}
          {/* MG Testing — purple */}
          {psiLayers.mg && showRadii && <Layer id="psi-radii-mg-line" type="line" filter={addPsiFilters(['==',['get','propertyType'],'MG TESTING'])} paint={{'line-color':'#a855f7','line-width':1,'line-opacity':0.45,'line-dasharray':[4,3]}}/>}
          {/* TD Testing — rose */}
          {psiLayers.td && showRadii && <Layer id="psi-radii-td-line" type="line" filter={addPsiFilters(['==',['get','propertyType'],'TD TESTING'])} paint={{'line-color':'#fb7185','line-width':1,'line-opacity':0.45,'line-dasharray':[4,3]}}/>}
          {/* AMP Authorized — teal */}
          {psiLayers.amp && showRadii && <Layer id="psi-radii-amp-line" type="line" filter={addPsiFilters(['==',['get','propertyType'],'AMP Authorized'])} paint={{'line-color':'#2dd4bf','line-width':1,'line-opacity':0.45,'line-dasharray':[4,3]}}/>}
        </Source>

        {iconsLoaded && POINT_LAYERS.map(key => layers[key] && (
          <Source key={key} id={key} type="geojson" data={`/data/data_${key}.geojson`}>
            <Layer id={`${key}-symbol`} type="symbol" layout={{'icon-image':`icon-${key}`,'icon-size':['interpolate',['linear'],['zoom'],3,0.35,6,0.55,10,0.8,14,1.1],'icon-allow-overlap':true,'icon-ignore-placement':true,'icon-anchor':'center'}}/>
          </Source>
        ))}

        {/* PSI sites — rendered on top of industry icons */}
        <Source id="psi-sites" type="geojson" data="/data/data_psi_sites.geojson">
          {/* Normal mode: property-type colors */}
          {showNormalMode && psiLayers.oo && <Layer id="psi-oo-halo"   type="circle" filter={addPsiFilters(['==',['get','propertyType'],'PSI Owned'])}    paint={{'circle-radius':13,'circle-color':PSI_COLORS.oo,'circle-opacity':0.18,'circle-blur':0.6}}/>}
          {showNormalMode && psiLayers.oo && <Layer id="psi-oo-circle" type="circle" filter={addPsiFilters(['==',['get','propertyType'],'PSI Owned'])}    paint={{'circle-radius':7,'circle-color':PSI_COLORS.oo,'circle-stroke-color':'#020817','circle-stroke-width':1.5,'circle-opacity':1}}/>}
          {showNormalMode && psiLayers.authorized && <Layer id="psi-authorized-circle" type="circle" filter={addPsiFilters(['==',['get','propertyType'],'PSI Authorized'])} paint={{'circle-radius':5,'circle-color':PSI_COLORS.authorized,'circle-stroke-color':'#020817','circle-stroke-width':1,'circle-opacity':0.9}}/>}
          {showNormalMode && psiLayers.mg         && <Layer id="psi-mg-circle"         type="circle" filter={addPsiFilters(['==',['get','propertyType'],'MG TESTING'])}      paint={{'circle-radius':5,'circle-color':PSI_COLORS.mg,        'circle-stroke-color':'#020817','circle-stroke-width':1,'circle-opacity':0.9}}/>}
          {showNormalMode && psiLayers.td         && <Layer id="psi-td-circle"         type="circle" filter={addPsiFilters(['==',['get','propertyType'],'TD TESTING'])}      paint={{'circle-radius':5,'circle-color':PSI_COLORS.td,        'circle-stroke-color':'#020817','circle-stroke-width':1,'circle-opacity':0.9}}/>}
          {showNormalMode && psiLayers.amp        && <Layer id="psi-amp-circle"        type="circle" filter={addPsiFilters(['==',['get','propertyType'],'AMP Authorized'])}  paint={{'circle-radius':5,'circle-color':PSI_COLORS.amp,       'circle-stroke-color':'#020817','circle-stroke-width':1,'circle-opacity':0.9}}/>}
          {/* Optimus mode: O&O colored by tier, 3P normal colors */}
          {optimusMode && psiLayers.oo && <Layer id="psi-optimus-oo-halo"   type="circle" filter={addPsiFilters(['==',['get','propertyType'],'PSI Owned'])} paint={{'circle-radius':['+', OPTIMUS_RADIUS_EXPR, 5],'circle-color':OPTIMUS_OO_COLOR,'circle-opacity':0.2,'circle-blur':0.6}}/>}
          {optimusMode && psiLayers.oo && <Layer id="psi-optimus-oo-circle" type="circle" filter={addPsiFilters(['==',['get','propertyType'],'PSI Owned'])} paint={{'circle-radius':OPTIMUS_RADIUS_EXPR,'circle-color':OPTIMUS_OO_COLOR,'circle-stroke-color':'#020817','circle-stroke-width':1.5,'circle-opacity':1}}/>}
          {optimusMode && psiLayers.authorized && <Layer id="psi-authorized-circle" type="circle" filter={addPsiFilters(['==',['get','propertyType'],'PSI Authorized'])} paint={{'circle-radius':5,'circle-color':PSI_COLORS.authorized,'circle-stroke-color':'#020817','circle-stroke-width':1,'circle-opacity':0.9}}/>}
          {optimusMode && psiLayers.mg         && <Layer id="psi-mg-circle"         type="circle" filter={addPsiFilters(['==',['get','propertyType'],'MG TESTING'])}      paint={{'circle-radius':5,'circle-color':PSI_COLORS.mg,        'circle-stroke-color':'#020817','circle-stroke-width':1,'circle-opacity':0.9}}/>}
          {optimusMode && psiLayers.td         && <Layer id="psi-td-circle"         type="circle" filter={addPsiFilters(['==',['get','propertyType'],'TD TESTING'])}      paint={{'circle-radius':5,'circle-color':PSI_COLORS.td,        'circle-stroke-color':'#020817','circle-stroke-width':1,'circle-opacity':0.9}}/>}
          {optimusMode && psiLayers.amp        && <Layer id="psi-amp-circle"        type="circle" filter={addPsiFilters(['==',['get','propertyType'],'AMP Authorized'])}  paint={{'circle-radius':5,'circle-color':PSI_COLORS.amp,       'circle-stroke-color':'#020817','circle-stroke-width':1,'circle-opacity':0.9}}/>}
          {/* Performance mode: score-tier colors, volume-scaled radius */}
          {performanceMode && anyPsiActive && <Layer id="psi-perf-halo" type="circle" filter={addPsiFilters(['all',['==',['get','category'],'OO'],perfLayerFilter])} paint={{'circle-radius':['case',['<=',['coalesce',['get','cdVolume'],0],0],11,['+',11,['*',_tExpr,10]]],'circle-color':PERF_COLOR_EXPR,'circle-opacity':0.2,'circle-blur':0.6}}/>}
          {/* At Risk static red ring (scoreBucket=1) */}
          {performanceMode && anyPsiActive && <Layer id="psi-at-risk-pulse" type="circle" filter={addPsiFilters(['all', AT_RISK_FILTER, perfLayerFilter])} paint={{'circle-radius':['+', PERF_RADIUS_EXPR, 8],'circle-color':'#ef4444','circle-opacity':0.4,'circle-blur':0.5}}/>}
          {performanceMode && anyPsiActive && <Layer id="psi-perf-circle" type="circle" filter={addPsiFilters(perfLayerFilter)} paint={{'circle-radius':PERF_RADIUS_EXPR,'circle-color':PERF_COLOR_EXPR,'circle-stroke-color':'#020817','circle-stroke-width':1.5,'circle-opacity':1}}/>}
          {/* Critical Optimus indicator — pulsing red ring, always shown when site layer is active */}
          {anyPsiActive && <Layer id="psi-critical-optimus" type="circle"
            filter={['==', ['get','criticalOptimus'], true]}
            paint={{'circle-radius':17,'circle-color':'#ef4444','circle-opacity':0.45,'circle-blur':0.5}}
          />}
          {/* Lease Intelligence rings — rendered on top of dots, transparent fill */}
          {showLeaseIntel && <Layer id="psi-lease-contract-pulse" type="circle"
            filter={addPsiFilters(['all',
              ['!=', ['coalesce',['get','leaseAction'],''], ''],
              ['==', ['get','contractFlag'], true]
            ])}
            paint={{'circle-radius':['case',['==',['get','category'],'OO'],19,17],'circle-color':'#fbbf24','circle-opacity':0.35,'circle-blur':0.3}}
          />}
          {showLeaseIntel && <Layer id="psi-lease-ring" type="circle"
            filter={addPsiFilters(['!=', ['coalesce',['get','leaseAction'],''], ''])}
            paint={{'circle-radius':['case',['==',['get','category'],'OO'],12,10],'circle-color':'rgba(0,0,0,0)','circle-stroke-color':LEASE_RING_COLOR_EXPR,'circle-stroke-width':3,'circle-opacity':0,'circle-stroke-opacity':0.85}}
          />}
        </Source>

        {hoverInfo?.lon && (
          <Popup longitude={hoverInfo.lon} latitude={hoverInfo.lat} closeButton={false} closeOnClick={false} anchor="bottom" offset={16}>
            {hoverInfo.isPsi ? (
              <div style={{ fontFamily:FONT, background:'rgba(2,8,23,0.97)', border:`1px solid ${PSI_COLORS[PSI_TYPE_MAP[hoverInfo.propertyType]||'authorized']}44`, borderRadius:7, padding:'8px 12px', maxWidth:240 }}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:PSI_COLORS[PSI_TYPE_MAP[hoverInfo.propertyType]||'authorized'], marginBottom:3 }}>
                  📍 {hoverInfo.psiCategory==='OO'?'O&O':'3P'} · {hoverInfo.propertyType}
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:'#f1f5f9' }}>{hoverInfo.name}</div>
                {hoverInfo.city && <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{[hoverInfo.city,hoverInfo.state].filter(Boolean).join(', ')}</div>}
                <div style={{ fontSize:9, color:'#334155', marginTop:4 }}>Click for details</div>
              </div>
            ) : (
              <div style={{ fontFamily:FONT, background:'rgba(2,8,23,0.97)', border:`1px solid ${LAYER_COLORS[hoverInfo.layerId]||'#60a5fa'}44`, borderRadius:7, padding:'8px 12px', maxWidth:230 }}>
                {qualityMode && <div style={{ marginBottom:5 }}><QualityBadge layerKey={hoverInfo.layerId} /></div>}
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:LAYER_COLORS[hoverInfo.layerId]||'#60a5fa', marginBottom:3 }}>
                  {HUB_EMOJI[hoverInfo.layerId]||''} {hoverInfo.type}
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:'#f1f5f9' }}>{hoverInfo.name}</div>
                {(hoverInfo.city||hoverInfo.state) && <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{[hoverInfo.city,hoverInfo.state].filter(Boolean).join(', ')}</div>}
                {hoverInfo.population && <div style={{ fontSize:11, color:'#f472b6', marginTop:3, fontWeight:600 }}>Pop: {fmt(hoverInfo.population)}</div>}
                {qualityMode && DATA_QUALITY[hoverInfo.layerId] && (
                  <div style={{ marginTop:5, fontSize:10, color:'#475569' }}>Source: {DATA_QUALITY[hoverInfo.layerId].source}</div>
                )}
                <div style={{ fontSize:9, color:'#334155', marginTop:4 }}>Click for details</div>
              </div>
            )}
          </Popup>
        )}

        <NavigationControl position="bottom-right" />
        <ScaleControl position="bottom-left" unit="imperial" />
      </Map>

      {/* Quality mode banner */}
      {qualityMode && <QualitySummaryBar layers={layers} />}

      {/* Left column: header + filter panel */}
      <div style={{ position:'absolute', top:20, left:20, width:284, display:'flex', flexDirection:'column', gap:8, maxHeight:'calc(100vh - 40px)', overflowY:'auto' }}>
      {/* Header */}
      <div style={{ background:'rgba(2,8,23,0.9)', border:'1px solid rgba(96,165,250,0.25)', borderRadius:12, padding:'14px 20px', backdropFilter:'blur(12px)', fontFamily:FONT, boxShadow:'0 4px 24px rgba(0,0,0,0.5)', flexShrink:0 }}>
        <div style={{ fontSize:18, fontWeight:800, color:'#f1f5f9', letterSpacing:'-0.02em' }}>Project Big Foot</div>
        <div style={{ fontSize:10, color:'#22d3ee', marginTop:4, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase' }}>PSI / ETS &nbsp;·&nbsp; Network Intelligence</div>

        {/* Quality Mode Toggle */}
        <div onClick={() => setQualityMode(q => !q)} style={{
          marginTop:10, display:'flex', alignItems:'center', gap:8,
          cursor:'pointer', padding:'6px 10px',
          background: qualityMode ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.04)',
          borderRadius:6,
          border: qualityMode ? '1px solid rgba(234,179,8,0.4)' : '1px solid rgba(255,255,255,0.06)',
          transition:'all 0.2s',
        }}>
          <div style={{
            width:28, height:16, borderRadius:8,
            background: qualityMode ? '#eab308' : '#1e293b',
            border:`1px solid ${qualityMode ? '#eab308' : '#334155'}`,
            position:'relative', transition:'all 0.25s',
            boxShadow: qualityMode ? '0 0 8px rgba(234,179,8,0.5)' : 'none',
          }}>
            <div style={{ position:'absolute', top:2, left: qualityMode ? 13 : 2, width:10, height:10, borderRadius:'50%', background: qualityMode ? '#020817' : '#475569', transition:'left 0.25s' }}/>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color: qualityMode ? '#eab308' : '#475569', letterSpacing:'0.04em' }}>
              {qualityMode ? 'DATA QUALITY ON' : 'Data Quality Mode'}
            </div>
            {qualityMode && <div style={{ fontSize:9, color:'#92400e', marginTop:1 }}>Showing source & confidence for all layers</div>}
          </div>
        </div>

        {/* Performance Mode Toggle */}
        <div onClick={togglePerformanceMode} style={{
          marginTop:8, display:'flex', alignItems:'center', gap:8, cursor:'pointer',
          padding:'6px 10px',
          background: performanceMode ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
          borderRadius:6,
          border: performanceMode ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(255,255,255,0.06)',
          transition:'all 0.2s',
        }}>
          <div style={{ width:28, height:16, borderRadius:8, background:performanceMode?'#22c55e':'#1e293b', border:`1px solid ${performanceMode?'#22c55e':'#334155'}`, position:'relative', transition:'all 0.25s', boxShadow:performanceMode?'0 0 8px rgba(34,197,94,0.45)':'none', flexShrink:0 }}>
            <div style={{ position:'absolute', top:2, left:performanceMode?13:2, width:10, height:10, borderRadius:'50%', background:performanceMode?'#020817':'#475569', transition:'left 0.25s' }}/>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:performanceMode?'#22c55e':'#475569', letterSpacing:'0.04em' }}>
              {performanceMode ? 'PERFORMANCE ON' : 'Performance Mode'}
            </div>
            {performanceMode && <div style={{ fontSize:9, color:'#14532d', marginTop:1 }}>Performance tier · dual color by network type · dot size = volume</div>}
          </div>
        </div>

        {/* Optimus Mode Toggle */}
        <div onClick={toggleOptimusMode} style={{
          marginTop:8, display:'flex', alignItems:'center', gap:8, cursor:'pointer',
          padding:'6px 10px',
          background: optimusMode ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.04)',
          borderRadius:6,
          border: optimusMode ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(255,255,255,0.06)',
          transition:'all 0.2s',
        }}>
          <div style={{ width:28, height:16, borderRadius:8, background:optimusMode?'#a855f7':'#1e293b', border:`1px solid ${optimusMode?'#a855f7':'#334155'}`, position:'relative', transition:'all 0.25s', boxShadow:optimusMode?'0 0 8px rgba(168,85,247,0.45)':'none', flexShrink:0 }}>
            <div style={{ position:'absolute', top:2, left:optimusMode?13:2, width:10, height:10, borderRadius:'50%', background:optimusMode?'#020817':'#475569', transition:'left 0.25s' }}/>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:optimusMode?'#a855f7':'#475569', letterSpacing:'0.04em' }}>
              {optimusMode ? 'OPTIMUS ON' : 'Optimus Mode'}
            </div>
            {optimusMode && <div style={{ fontSize:9, color:'#6b21a8', marginTop:1 }}>O&O sites colored by Optimus quality tier</div>}
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      <div style={{ background:'rgba(2,8,23,0.92)', border:`1px solid ${hasActiveFilters?'rgba(245,158,11,0.45)':'rgba(96,165,250,0.18)'}`, borderRadius:12, backdropFilter:'blur(12px)', fontFamily:FONT, boxShadow:'0 4px 24px rgba(0,0,0,0.5)', overflow:'hidden', flexShrink:0 }}>
        <div onClick={()=>setFilterPanelOpen(o=>!o)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', cursor:'pointer', userSelect:'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11 }}>⚡</span>
            <span style={{ fontSize:10, fontWeight:700, color:'#94a3b8', letterSpacing:'0.1em' }}>FILTERS</span>
            {hasActiveFilters && <div style={{ width:6, height:6, borderRadius:'50%', background:'#f59e0b', boxShadow:'0 0 5px #f59e0b', flexShrink:0 }}/>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {hasActiveFilters && <span onClick={e=>{e.stopPropagation();setFilterStates(null);setFilterPerfTiers(null);setFilterOptusTiers(null)}} style={{ fontSize:9, color:'#f59e0b', cursor:'pointer', padding:'2px 6px', borderRadius:3, background:'rgba(245,158,11,0.12)' }}>Clear All</span>}
            <span style={{ fontSize:9, color:'#475569' }}>{filterPanelOpen?'▼':'▶'}</span>
          </div>
        </div>

        {filterPanelOpen && (
          <div style={{ padding:'0 14px 14px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>

            {/* Filter 1: State */}
            <div style={{ marginTop:12, marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#64748b', letterSpacing:'0.08em', marginBottom:6 }}>STATE</div>
              <div onClick={()=>setStateDropOpen(o=>!o)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 10px', background:'rgba(255,255,255,0.05)', borderRadius:6, border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', userSelect:'none' }}>
                <span style={{ fontSize:11, color:'#94a3b8' }}>{filterStates===null?'All states':`${filterStates.size} state${filterStates.size!==1?'s':''} selected`}</span>
                <span style={{ fontSize:9, color:'#475569' }}>{stateDropOpen?'▲':'▼'}</span>
              </div>
              {stateDropOpen && (
                <div style={{ maxHeight:150, overflowY:'auto', marginTop:4, background:'rgba(2,8,23,0.98)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:6 }}>
                  <div onClick={()=>setFilterStates(null)} style={{ padding:'5px 10px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.06)', userSelect:'none' }}>
                    <span style={{ fontSize:10, color:'#60a5fa' }}>Select all</span>
                  </div>
                  {availableStates.map(state => {
                    const checked = filterStates===null || filterStates.has(state)
                    return (
                      <div key={state} onClick={()=>setFilterStates(prev=>{
                        if(prev===null) return new Set(availableStates.filter(s=>s!==state))
                        const ns=new Set(prev); checked?ns.delete(state):ns.add(state)
                        return ns.size===availableStates.length?null:ns
                      })} style={{ display:'flex', alignItems:'center', gap:7, padding:'4px 10px', cursor:'pointer', userSelect:'none', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ width:11, height:11, borderRadius:2, border:`1.5px solid ${checked?'#60a5fa':'#334155'}`, background:checked?'#60a5fa':'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {checked && <span style={{ fontSize:7, color:'#020817', fontWeight:900 }}>✓</span>}
                        </div>
                        <span style={{ fontSize:11, color:checked?'#94a3b8':'#475569' }}>{state}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Filter 2: Performance Tier */}
            <div style={{ marginBottom:14, opacity:performanceMode?1:0.4 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#64748b', letterSpacing:'0.08em', marginBottom:6 }}>PERFORMANCE TIER</div>
              {!performanceMode ? (
                <div style={{ fontSize:9, color:'#334155', fontStyle:'italic' }}>Enable Performance Mode to filter by tier</div>
              ) : (
                <div>
                  {[[5,'Top Performer',56],[4,'Strong',167],[3,'Average',169],[2,'Watch List',119],[1,'At Risk',13],['no-data','No Data',null]].map(([val,label,count]) => {
                    const k=String(val), checked=filterPerfTiers===null||filterPerfTiers.has(k)
                    return (
                      <div key={k} onClick={()=>setFilterPerfTiers(prev=>{
                        const ALL=['5','4','3','2','1','no-data']
                        if(prev===null) return new Set(ALL.filter(x=>x!==k))
                        const ns=new Set(prev); checked?ns.delete(k):ns.add(k)
                        return ns.size===ALL.length?null:ns
                      })} style={{ display:'flex', alignItems:'center', gap:7, padding:'3px 0', cursor:'pointer', userSelect:'none' }}>
                        <div style={{ width:11, height:11, borderRadius:2, border:`1.5px solid ${checked?'#60a5fa':'#334155'}`, background:checked?'#60a5fa':'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {checked && <span style={{ fontSize:7, color:'#020817', fontWeight:900 }}>✓</span>}
                        </div>
                        <span style={{ fontSize:11, color:checked?'#94a3b8':'#475569' }}>
                          {label}{count!==null&&<span style={{ fontSize:9, color:'#334155', marginLeft:4 }}>({count})</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Filter 3: Optimus Tier */}
            <div style={{ opacity:optimusMode?1:0.4 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#64748b', letterSpacing:'0.08em', marginBottom:6 }}>OPTIMUS QUALITY TIER</div>
              {!optimusMode ? (
                <div style={{ fontSize:9, color:'#334155', fontStyle:'italic' }}>Enable Optimus Mode to filter by quality tier</div>
              ) : (
                <div>
                  {[['A','Top Quality',0],['B','Good',49],['C','Needs Improvement',77],['no-score','No Score',null]].map(([val,label,count]) => {
                    const checked=filterOptusTiers===null||filterOptusTiers.has(val)
                    return (
                      <div key={val} onClick={()=>setFilterOptusTiers(prev=>{
                        const ALL=['A','B','C','no-score']
                        if(prev===null) return new Set(ALL.filter(x=>x!==val))
                        const ns=new Set(prev); checked?ns.delete(val):ns.add(val)
                        return ns.size===ALL.length?null:ns
                      })} style={{ display:'flex', alignItems:'center', gap:7, padding:'3px 0', cursor:'pointer', userSelect:'none' }}>
                        <div style={{ width:11, height:11, borderRadius:2, border:`1.5px solid ${checked?'#a855f7':'#334155'}`, background:checked?'#a855f7':'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {checked && <span style={{ fontSize:7, color:'#020817', fontWeight:900 }}>✓</span>}
                        </div>
                        <span style={{ fontSize:11, color:checked?'#94a3b8':'#475569' }}>
                          {label}{count!==null&&<span style={{ fontSize:9, color:'#334155', marginLeft:4 }}>({count})</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
      </div>{/* closes left column */}

      {/* Layer Panel */}
      <div style={{ position:'absolute', top:20, right:20, background:'rgba(2,8,23,0.92)', border:'1px solid rgba(96,165,250,0.18)', borderRadius:12, padding:'14px 0', width:230, backdropFilter:'blur(12px)', fontFamily:FONT, boxShadow:'0 4px 24px rgba(0,0,0,0.5)', maxHeight:'calc(100vh - 80px)', overflowY:'auto' }}>
        <div style={{ fontSize:9, fontWeight:700, color:'#475569', letterSpacing:'0.14em', textTransform:'uppercase', padding:'0 16px 10px' }}>Map Layers</div>

        {LAYER_GROUPS.map(group => (
          <div key={group.label}>
            <div onClick={() => toggleGroup(group.label)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 16px', cursor:'pointer', background:'rgba(255,255,255,0.03)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8', letterSpacing:'0.04em' }}>{group.label.toUpperCase()}</span>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <span onClick={e => {e.stopPropagation(); toggleGroupAll(group)}} style={{ fontSize:9, color:'#475569', cursor:'pointer', padding:'2px 5px', borderRadius:3, background:'rgba(255,255,255,0.05)' }}>
                  {allInGroup(group) ? 'ALL OFF' : 'ALL ON'}
                </span>
                <span style={{ color:'#475569', fontSize:10 }}>{collapsed[group.label] ? '▶' : '▼'}</span>
              </div>
            </div>
            {!collapsed[group.label] && group.layers.map(({key, label, color, count}) => {
              const q = DATA_QUALITY[key]
              const qColor = q ? QUALITY_COLORS[q.classification] : '#475569'
              return (
                <div key={key} onClick={() => toggle(key)} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 16px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.03)', userSelect:'none' }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background:layers[key]?color:'#1e293b', border:`1.5px solid ${layers[key]?color:'#334155'}`, boxShadow:layers[key]?`0 0 5px ${color}88`:'none', transition:'all 0.2s' }}/>
                  <div style={{ width:26, height:15, borderRadius:8, flexShrink:0, background:layers[key]?color:'#1e293b', border:`1px solid ${layers[key]?color:'#334155'}`, position:'relative', transition:'all 0.2s', boxShadow:layers[key]?`0 0 5px ${color}55`:'none' }}>
                    <div style={{ position:'absolute', top:2, width:9, height:9, borderRadius:'50%', left:layers[key]?13:2, background:layers[key]?'#020817':'#475569', transition:'left 0.2s' }}/>
                  </div>
                  <span style={{ fontSize:12, fontWeight:500, color:layers[key]?'#e2e8f0':'#475569', transition:'color 0.2s', flex:1 }}>
                    {label}{count ? <span style={{ fontSize:9, fontWeight:400, color:'#334155', marginLeft:4 }}>({count.toLocaleString()})</span> : null}
                  </span>
                  {qualityMode && q && (
                    <div title={`${QUALITY_LABELS[q.classification]} — ${q.confidence} confidence`} style={{ width:7, height:7, borderRadius:'50%', background:qColor, flexShrink:0, boxShadow:`0 0 4px ${qColor}99` }}/>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        {/* ── PSI Test Centers ── */}
        <div>
          {/* Section header */}
          <div onClick={() => setPsiCollapsed(p=>({...p,group:!p.group}))} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 16px', cursor:'pointer', background:'rgba(245,158,11,0.07)', borderTop:'1px solid rgba(245,158,11,0.25)' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#f59e0b', letterSpacing:'0.04em' }}>PSI TEST CENTERS</span>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span onClick={e=>{e.stopPropagation();toggleAllPsi()}} style={{ fontSize:9, color:'#78350f', cursor:'pointer', padding:'2px 5px', borderRadius:3, background:'rgba(245,158,11,0.15)' }}>
                {allPsiOn ? 'ALL OFF' : 'ALL ON'}
              </span>
              <span style={{ color:'#f59e0b', fontSize:10 }}>{psiCollapsed.group ? '▶' : '▼'}</span>
            </div>
          </div>

          {!psiCollapsed.group && (<>
            {/* O&O toggle */}
            <div onClick={()=>togglePsi('oo')} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 16px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.03)', userSelect:'none' }}>
              <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background:psiLayers.oo?PSI_COLORS.oo:'#1e293b', border:`1.5px solid ${psiLayers.oo?PSI_COLORS.oo:'#334155'}`, boxShadow:psiLayers.oo?`0 0 6px ${PSI_COLORS.oo}99`:'none', transition:'all 0.2s' }}/>
              <div style={{ width:26, height:15, borderRadius:8, flexShrink:0, background:psiLayers.oo?PSI_COLORS.oo:'#1e293b', border:`1px solid ${psiLayers.oo?PSI_COLORS.oo:'#334155'}`, position:'relative', transition:'all 0.2s', boxShadow:psiLayers.oo?`0 0 5px ${PSI_COLORS.oo}55`:'none' }}>
                <div style={{ position:'absolute', top:2, width:9, height:9, borderRadius:'50%', left:psiLayers.oo?13:2, background:psiLayers.oo?'#020817':'#475569', transition:'left 0.2s' }}/>
              </div>
              <div style={{ flex:1 }}>
                <span style={{ fontSize:12, fontWeight:700, color:psiLayers.oo?'#f1f5f9':'#475569', transition:'color 0.2s' }}>O&O Sites <span style={{ fontWeight:400, color:'#78350f' }}>({PSI_COUNTS.oo})</span></span>
              </div>
            </div>

            {/* 3P master toggle + expand */}
            <div style={{ borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ display:'flex', alignItems:'center', padding:'7px 16px', userSelect:'none' }}>
                <div onClick={toggle3pAll} style={{ display:'flex', alignItems:'center', gap:8, flex:1, cursor:'pointer' }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background:any3pOn?PSI_COLORS.authorized:'#1e293b', border:`1.5px solid ${any3pOn?PSI_COLORS.authorized:'#334155'}`, boxShadow:any3pOn?`0 0 5px ${PSI_COLORS.authorized}88`:'none', transition:'all 0.2s' }}/>
                  <div style={{ width:26, height:15, borderRadius:8, flexShrink:0, background:all3pOn?PSI_COLORS.authorized:'#1e293b', border:`1px solid ${any3pOn?PSI_COLORS.authorized:'#334155'}`, position:'relative', transition:'all 0.2s' }}>
                    <div style={{ position:'absolute', top:2, width:9, height:9, borderRadius:'50%', left:all3pOn?13:2, background:all3pOn?'#020817':'#475569', transition:'left 0.2s' }}/>
                  </div>
                  <span style={{ fontSize:12, fontWeight:600, color:any3pOn?'#e2e8f0':'#475569', transition:'color 0.2s' }}>3P Sites <span style={{ fontWeight:400, color:'#334155' }}>({PSI_3P_TOTAL})</span></span>
                </div>
                <span onClick={()=>setPsiCollapsed(p=>({...p,thirdParty:!p.thirdParty}))} style={{ cursor:'pointer', color:'#475569', fontSize:10, padding:'2px 6px' }}>
                  {psiCollapsed.thirdParty ? '▶' : '▼'}
                </span>
              </div>

              {!psiCollapsed.thirdParty && (
                <div style={{ paddingBottom:4, background:'rgba(255,255,255,0.01)', borderTop:'1px solid rgba(255,255,255,0.03)' }}>
                  {[['authorized','PSI Authorized',397],['mg','MG Testing',33],['td','TD Testing',20],['amp','AMP Authorized',1]].map(([key,label,cnt])=>(
                    <div key={key} onClick={()=>togglePsi(key)} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 16px 5px 28px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.02)', userSelect:'none' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background:psiLayers[key]?PSI_COLORS[key]:'#1e293b', border:`1.5px solid ${psiLayers[key]?PSI_COLORS[key]:'#334155'}`, boxShadow:psiLayers[key]?`0 0 4px ${PSI_COLORS[key]}88`:'none', transition:'all 0.2s' }}/>
                      <div style={{ width:22, height:12, borderRadius:6, flexShrink:0, background:psiLayers[key]?PSI_COLORS[key]:'#1e293b', border:`1px solid ${psiLayers[key]?PSI_COLORS[key]:'#334155'}`, position:'relative', transition:'all 0.2s' }}>
                        <div style={{ position:'absolute', top:1.5, width:7, height:7, borderRadius:'50%', left:psiLayers[key]?11:2, background:psiLayers[key]?'#020817':'#475569', transition:'left 0.2s' }}/>
                      </div>
                      <span style={{ fontSize:11, fontWeight:500, color:psiLayers[key]?'#94a3b8':'#334155', transition:'color 0.2s' }}>{label} <span style={{ fontSize:9, fontWeight:400, color:'#334155' }}>({cnt})</span></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 50-mile radius master toggle */}
            <div onClick={()=>setShowRadii(r=>!r)} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 16px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.03)', userSelect:'none' }}>
              <div style={{ width:10, height:10, borderRadius:2, flexShrink:0, border:`1.5px solid ${showRadii?'#64748b':'#334155'}`, background:showRadii?'rgba(100,116,139,0.25)':'transparent', transition:'all 0.2s' }}/>
              <div style={{ width:26, height:15, borderRadius:8, flexShrink:0, background:showRadii?'#64748b':'#1e293b', border:`1px solid ${showRadii?'#64748b':'#334155'}`, position:'relative', transition:'all 0.2s', boxShadow:showRadii?'0 0 5px rgba(100,116,139,0.4)':'none' }}>
                <div style={{ position:'absolute', top:2, width:9, height:9, borderRadius:'50%', left:showRadii?13:2, background:showRadii?'#020817':'#475569', transition:'left 0.2s' }}/>
              </div>
              <div>
                <span style={{ fontSize:12, fontWeight:500, color:showRadii?'#94a3b8':'#475569', transition:'color 0.2s' }}>50-Mile Radius</span>
                <span style={{ fontSize:9, color:'#334155', marginLeft:6 }}>all sites</span>
              </div>
            </div>

            {/* Lease Intelligence toggle */}
            <div onClick={()=>setShowLeaseIntel(l=>!l)} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 16px', cursor:'pointer', userSelect:'none' }}>
              <div style={{ width:10, height:10, borderRadius:2, flexShrink:0, border:`1.5px solid ${showLeaseIntel?'#f97316':'#334155'}`, background:showLeaseIntel?'rgba(249,115,22,0.2)':'transparent', transition:'all 0.2s' }}/>
              <div style={{ width:26, height:15, borderRadius:8, flexShrink:0, background:showLeaseIntel?'#f97316':'#1e293b', border:`1px solid ${showLeaseIntel?'#f97316':'#334155'}`, position:'relative', transition:'all 0.2s', boxShadow:showLeaseIntel?'0 0 5px rgba(249,115,22,0.4)':'none' }}>
                <div style={{ position:'absolute', top:2, width:9, height:9, borderRadius:'50%', left:showLeaseIntel?13:2, background:showLeaseIntel?'#020817':'#475569', transition:'left 0.2s' }}/>
              </div>
              <div>
                <span style={{ fontSize:12, fontWeight:500, color:showLeaseIntel?'#e2e8f0':'#475569', transition:'color 0.2s' }}>Lease Intelligence</span>
                <span style={{ fontSize:9, color:'#334155', marginLeft:4 }}>(57 sites)</span>
                {showLeaseIntel && <div style={{ fontSize:9, color:'#92400e', marginTop:1 }}>32 expired · 7 contract flags</div>}
              </div>
            </div>
          </>)}
        </div>
      </div>

      {/* Legend */}
      <Legend layers={layers} psiLayers={psiLayers} showRadii={showRadii} qualityMode={qualityMode} performanceMode={performanceMode} optimusMode={optimusMode} showLeaseIntel={showLeaseIntel} />

      {/* Info Card */}
      <InfoCard info={clickInfo} onClose={() => setClickInfo(null)} qualityMode={qualityMode} optimusMode={optimusMode} showLeaseIntel={showLeaseIntel} />

      {/* Status Bar */}
      <div style={{ position:'absolute', bottom:32, left:'50%', transform:'translateX(-50%)', background:'rgba(2,8,23,0.9)', border:'1px solid rgba(96,165,250,0.2)', borderRadius:8, padding:'8px 20px', backdropFilter:'blur(8px)', fontFamily:FONT, display:'flex', gap:20, alignItems:'center', boxShadow:'0 4px 16px rgba(0,0,0,0.4)' }}>
        <span style={{ fontSize:11, fontWeight:600, color:'#22d3ee', letterSpacing:'0.06em' }}>PROJECT BIG FOOT</span>
        <span style={{ color:'#334155', fontSize:10 }}>|</span>
        <span style={{ fontSize:11, color:'#64748b' }}>{Object.values(layers).filter(Boolean).length + Object.values(psiLayers).filter(Boolean).length} layers active</span>
        <span style={{ color:'#334155', fontSize:10 }}>|</span>
        <span style={{ fontSize:11, color:'#64748b' }}>US Network Intelligence Platform</span>
        {qualityMode && <>
          <span style={{ color:'#334155', fontSize:10 }}>|</span>
          <span style={{ fontSize:11, color:'#eab308', fontWeight:600 }}>⬤ Data Quality Mode</span>
        </>}
      </div>
    </div>
  )
}
