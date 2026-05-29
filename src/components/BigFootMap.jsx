import { useState, useCallback, useRef } from 'react'
import Map, { Layer, Source, NavigationControl, ScaleControl, Popup } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
const INITIAL_VIEW = { longitude: -96, latitude: 39, zoom: 4, pitch: 0, bearing: 0 }
const STATES_URL = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'

// ── State population lookup ──────────────────────────────
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

// ── Metro population lookup (millions) ──────────────────
const METRO_POPULATIONS = {
  'New York-Newark': 20.1, 'Los Angeles-Long Beach': 13.2, 'Chicago-Naperville': 9.5,
  'Dallas-Fort Worth': 7.8, 'Houston-The Woodlands': 7.4, 'Washington-Arlington': 6.4,
  'Miami-Fort Lauderdale': 6.3, 'Philadelphia-Camden': 6.2, 'Atlanta-Sandy Springs': 6.2,
  'Phoenix-Mesa': 5.1, 'Boston-Cambridge': 4.9, 'Riverside-San Bernardino': 4.6,
  'Seattle-Tacoma': 4.0, 'Minneapolis-St. Paul': 3.7, 'San Diego-Chula Vista': 3.3,
  'Tampa-St. Petersburg': 3.2, 'Denver-Aurora': 2.9, 'St. Louis': 2.8,
  'Baltimore-Columbia': 2.9, 'Orlando-Kissimmee': 2.7, 'San Antonio-New Braunfels': 2.7,
  'Portland-Vancouver': 2.5, 'Sacramento-Roseville': 2.4, 'Pittsburgh': 2.4,
  'Las Vegas-Henderson': 2.3, 'Cincinnati': 2.3, 'Austin-Round Rock': 2.3,
  'Kansas City': 2.2, 'Columbus': 2.1, 'Indianapolis-Carmel': 2.1,
  'Cleveland-Elyria': 2.0, 'San Jose-Sunnyvale': 2.0, 'Charlotte-Concord': 2.7,
  'Virginia Beach-Norfolk': 1.8, 'Nashville-Davidson': 2.1, 'Providence-Warwick': 1.7,
  'Jacksonville': 1.7, 'Milwaukee-Waukesha': 1.6, 'Oklahoma City': 1.4,
  'Raleigh-Cary': 1.4, 'Memphis': 1.3, 'Richmond': 1.4, 'Louisville-Jefferson': 1.4,
  'New Orleans-Metairie': 1.3, 'Salt Lake City': 1.3, 'Hartford-East Hartford': 1.2,
  'Buffalo-Cheektowaga': 1.2, 'Birmingham-Hoover': 1.1, 'Rochester': 1.1,
  'Tucson': 1.1, 'Fresno': 1.0, 'Grand Rapids-Kentwood': 1.1,
  'Omaha-Council Bluffs': 1.0, 'Albuquerque': 0.9, 'Bakersfield': 0.9,
  'Knoxville': 0.9, 'El Paso': 0.9, 'New Haven-Milford': 0.9,
  'Greenville-Anderson': 0.9, 'Baton Rouge': 0.9,
}

const LAYER_COLORS = {
  universities: '#fbbf24', airports: '#34d399', healthcare: '#f87171',
  financial: '#4ade80', government: '#60a5fa', technology: '#818cf8',
  manufacturing: '#fb923c', railway: '#e2e8f0', cultural: '#c084fc',
  agriculture: '#86efac',
}
const HUB_LABELS = {
  universities: 'Universities & Colleges', airports: 'Airports',
  healthcare: 'Healthcare', financial: 'Financial',
  government: 'Government', technology: 'Technology',
  manufacturing: 'Manufacturing', railway: 'Railway & Transit',
  cultural: 'Cultural', agriculture: 'Agriculture',
}
const HUB_ICONS_EMOJI = {
  airports: '✈', healthcare: '🏥', financial: '🏦', government: '🏛',
  technology: '💻', manufacturing: '🏭', railway: '🚉',
  cultural: '🎭', agriculture: '🌾', universities: '🎓',
}

const ICON_PATHS = {
  airports: `<path fill="white" d="M20 8C18 8 17 9 17 11L17 17L10 21L10 23L17 21L17 26L14 28L14 30L20 28L26 30L26 28L23 26L23 21L30 23L30 21L23 17L23 11C23 9 22 8 20 8Z"/>`,
  healthcare: `<path fill="white" d="M24 17H28V23H24V27H16V23H12V17H16V13H24V17Z"/>`,
  universities: `<path fill="white" d="M20 11L31 17L20 23L9 17ZM13 19.5L13 25C13 25 16 27 20 27C24 27 27 25 27 25L27 19.5L20 23ZM29 18L29 24L31 25L31 18Z"/>`,
  financial: `<path fill="white" d="M11 28H29V30H11ZM12 16H16V28H12ZM18 16H22V28H18ZM24 16H28V28H24ZM11 14H29V16H11ZM17 11H23V14H17Z"/>`,
  government: `<path fill="white" d="M20 9C16 9 12 12.5 12 17H28C28 12.5 24 9 20 9ZM10 17H30V19H10ZM12 19H16V27H12ZM18 19H22V27H18ZM24 19H28V27H24ZM10 27H30V29H10Z"/>`,
  technology: `<path fill="white" d="M14 14H26V26H14V14ZM16 16V24H24V16ZM18 18V22H22V18ZM12 17H14V19H12ZM12 21H14V23H12ZM26 17H28V19H26ZM26 21H28V23H26ZM17 12V14H19V12ZM21 12V14H23V12ZM17 26V28H19V26ZM21 26V28H23V26Z"/>`,
  manufacturing: `<path fill="white" d="M20 15C17.2 15 15 17.2 15 20C15 22.8 17.2 25 20 25C22.8 25 25 22.8 25 20C25 17.2 22.8 15 20 15ZM20 17.5C21.4 17.5 22.5 18.6 22.5 20C22.5 21.4 21.4 22.5 20 22.5C18.6 22.5 17.5 21.4 17.5 20C17.5 18.6 18.6 17.5 20 17.5ZM18 10L17 12.5C16 13 15 13.7 14.2 14.5L11.5 14L10 16.5L12 18C11.9 18.6 11.8 19.3 11.8 20C11.8 20.7 11.9 21.4 12 22L10 23.5L11.5 26L14.2 25.5C15 26.3 16 27 17 27.5L18 30H22L23 27.5C24 27 25 26.3 25.8 25.5L28.5 26L30 23.5L28 22C28.1 21.4 28.2 20.7 28.2 20C28.2 19.3 28.1 18.6 28 18L30 16.5L28.5 14L25.8 14.5C25 13.7 24 13 23 12.5L22 10Z"/>`,
  railway: `<path fill="white" d="M14 10H26C27.1 10 28 10.9 28 12V24C28 25.1 27.1 26 26 26H14C12.9 26 12 25.1 12 24V12C12 10.9 12.9 10 14 10ZM14 12V19H26V12ZM17 16H23V18H17ZM15 22C15 22.6 14.6 23 14 23C13.4 23 13 22.6 13 22C13 21.4 13.4 21 14 21C14.6 21 15 21.4 15 22ZM27 22C27 22.6 26.6 23 26 23C25.4 23 25 22.6 25 22C25 21.4 25.4 21 26 21C26.6 21 27 21.4 27 22ZM11 26L13 28H27L29 26Z"/>`,
  cultural: `<path fill="white" d="M20 9L22.9 15.9L30.5 16.5L25 21.3L26.8 28.7L20 24.5L13.2 28.7L15 21.3L9.5 16.5L17.1 15.9Z"/>`,
  agriculture: `<path stroke="white" stroke-width="2" stroke-linecap="round" fill="none" d="M20 28L20 15M20 15C20 15 15 12 12 8C15.5 10 19 13 20 15ZM20 15C20 15 25 12 28 8C24.5 10 21 13 20 15ZM20 19C20 19 15 16 12 12C15.5 14 19 17 20 19ZM20 19C20 19 25 16 28 12C24.5 14 21 17 20 19ZM20 23C20 23 15 20 12 16C15.5 18 19 21 20 23ZM20 23C20 23 25 20 28 16C24.5 18 21 21 20 23"/>`,
}

function makeIconSVG(key, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="18" fill="${color}"/>
  <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(2,8,23,0.7)" stroke-width="2.5"/>
  ${ICON_PATHS[key] || `<circle cx="20" cy="20" r="7" fill="white"/>`}
</svg>`
}

const LAYER_GROUPS = [
  { label: 'Base Layers', layers: [
    { key: 'states', label: 'State Boundaries', color: '#60a5fa' },
    { key: 'metros', label: 'Metro Areas', color: '#22d3ee' },
  ]},
  { label: 'Population', layers: [
    { key: 'population', label: 'Population Density', color: '#f472b6' },
    { key: 'urban_rural', label: 'Urban / Rural Zones', color: '#a78bfa' },
  ]},
  { label: 'Education', layers: [
    { key: 'universities', label: 'Universities & Colleges', color: '#fbbf24' },
  ]},
  { label: 'Industry Hubs', layers: [
    { key: 'airports', label: 'Airports', color: '#34d399' },
    { key: 'healthcare', label: 'Healthcare', color: '#f87171' },
    { key: 'financial', label: 'Financial', color: '#4ade80' },
    { key: 'government', label: 'Government', color: '#60a5fa' },
    { key: 'technology', label: 'Technology', color: '#818cf8' },
    { key: 'manufacturing', label: 'Manufacturing', color: '#fb923c' },
    { key: 'railway', label: 'Railway & Transit', color: '#e2e8f0' },
    { key: 'cultural', label: 'Cultural', color: '#c084fc' },
    { key: 'agriculture', label: 'Agriculture', color: '#86efac' },
  ]},
]

const DEFAULT_LAYERS = {
  states: true, metros: true, population: false, urban_rural: false,
  universities: false, airports: false, healthcare: false, financial: false,
  government: false, technology: false, manufacturing: false,
  railway: false, cultural: false, agriculture: false,
}

const POINT_LAYERS = ['universities','airports','healthcare','financial','government','technology','manufacturing','railway','cultural','agriculture']

const DENSITY_COLORS = { 'Very High': '#ec4899', 'High': '#a855f7', 'Medium': '#6366f1' }

function fmt(n) {
  if (!n) return 'N/A'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K'
  return n.toString()
}

// ── Legend Component ────────────────────────────────────
function Legend({ layers }) {
  const [open, setOpen] = useState(true)
  const active = Object.entries(layers).filter(([k, v]) => v)
  if (active.length === 0) return null

  const allLayerInfo = {}
  LAYER_GROUPS.forEach(g => g.layers.forEach(l => { allLayerInfo[l.key] = l }))

  return (
    <div style={{
      position: 'absolute', bottom: 70, left: 12,
      background: 'rgba(2,8,23,0.92)', border: '1px solid rgba(96,165,250,0.2)',
      borderRadius: 10, fontFamily: '"Segoe UI", system-ui, sans-serif',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
      minWidth: 180, maxWidth: 220,
    }}>
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '9px 13px', cursor: 'pointer',
        borderBottom: open ? '1px solid rgba(255,255,255,0.05)' : 'none',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Legend</span>
        <span style={{ color: '#475569', fontSize: 10 }}>{open ? '▼' : '▶'}</span>
      </div>

      {open && (
        <div style={{ padding: '8px 0 6px' }}>
          {active.map(([key]) => {
            const info = allLayerInfo[key]
            if (!info) return null

            // Population density -- show gradient scale
            if (key === 'population') return (
              <div key={key} style={{ padding: '4px 13px' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>Population Density</div>
                {Object.entries(DENSITY_COLORS).map(([label, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: color, opacity: 0.85 }} />
                    <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
                  </div>
                ))}
              </div>
            )

            // Metro areas -- dashed line
            if (key === 'metros') return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 13px' }}>
                <svg width="24" height="12" viewBox="0 0 24 12">
                  <line x1="0" y1="6" x2="24" y2="6" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.8"/>
                </svg>
                <span style={{ fontSize: 11, color: '#64748b' }}>Metro Areas</span>
              </div>
            )

            // State boundaries -- solid line
            if (key === 'states') return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 13px' }}>
                <svg width="24" height="12" viewBox="0 0 24 12">
                  <line x1="0" y1="6" x2="24" y2="6" stroke="#60a5fa" strokeWidth="1.5" opacity="0.8"/>
                </svg>
                <span style={{ fontSize: 11, color: '#64748b' }}>State Boundaries</span>
              </div>
            )

            // Urban/Rural -- two dots
            if (key === 'urban_rural') return (
              <div key={key} style={{ padding: '4px 13px' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>Urban / Rural</div>
                {[['Urban Core','#818cf8'],['Rural Hub','#86efac']].map(([label, color]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                    <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
                  </div>
                ))}
              </div>
            )

            // Hub/point layers -- colored circle + emoji
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 13px' }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: info.color, flexShrink: 0,
                  boxShadow: `0 0 4px ${info.color}88`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8,
                }}>
                </div>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  {HUB_ICONS_EMOJI[key]} {info.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Info Card (click-based) ─────────────────────────────
function InfoCard({ info, onClose }) {
  if (!info) return null
  const font = '"Segoe UI", system-ui, sans-serif'
  const accentColor = LAYER_COLORS[info.layerId] || '#60a5fa'

  return (
    <div style={{
      position: 'absolute', bottom: 70, right: 12,
      background: 'rgba(2,8,23,0.97)', border: `1px solid ${accentColor}44`,
      borderRadius: 12, padding: 0, width: 260,
      fontFamily: font, boxShadow: '0 6px 30px rgba(0,0,0,0.7)',
      backdropFilter: 'blur(12px)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px 10px',
        borderBottom: `1px solid ${accentColor}22`,
      }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accentColor, marginBottom: 3 }}>
            {HUB_ICONS_EMOJI[info.layerId] || '📍'} {info.type || info.layerId}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>{info.name}</div>
        </div>
        <div onClick={onClose} style={{
          cursor: 'pointer', color: '#475569', fontSize: 16, fontWeight: 300,
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
        }}>×</div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 16px 14px' }}>
        {/* Location */}
        {(info.city || info.state) && (
          <Row label="Location" value={[info.city, info.state].filter(Boolean).join(', ')} />
        )}

        {/* Airport IATA */}
        {info.iata && <Row label="IATA Code" value={info.iata} color="#34d399" />}

        {/* University enrollment */}
        {info.enrollment && <Row label="Enrollment" value={fmt(info.enrollment) + ' students'} color="#fbbf24" />}

        {/* Population zone data */}
        {info.layerId === 'population' && (
          <>
            <Row label="Density Tier" value={info.density} color={DENSITY_COLORS[info.density] || '#a855f7'} />
            <Row label="Population" value={fmt(info.population)} color="#f472b6" />
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(244,114,182,0.08)', borderRadius: 6, borderLeft: `2px solid ${DENSITY_COLORS[info.density] || '#a855f7'}` }}>
              <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>
                {info.density === 'Very High' && 'Core metro area. High candidate density. Priority market for test center coverage.'}
                {info.density === 'High' && 'Significant urban population. Strong candidate demand. Review test center capacity.'}
                {info.density === 'Medium' && 'Mid-density suburban zone. Moderate demand. Strategic gap analysis recommended.'}
              </div>
            </div>
          </>
        )}

        {/* Metro data */}
        {info.layerId === 'metros' && (
          <>
            {info.metroPop && <Row label="Metro Population" value={info.metroPop + 'M' + ' people'} color="#22d3ee" />}
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(34,211,238,0.06)', borderRadius: 6, borderLeft: '2px solid #22d3ee' }}>
              <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>
                Defined metro market zone. Use to assess test center density and coverage against candidate demand.
              </div>
            </div>
          </>
        )}

        {/* State data */}
        {info.layerId === 'states' && (
          <>
            {info.statePop && <Row label="State Population" value={info.statePop + 'M people'} color="#60a5fa" />}
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <span style={{ fontSize: 11, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || '#e2e8f0' }}>{value}</span>
    </div>
  )
}

export default function BigFootMap() {
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const [layers, setLayers] = useState(DEFAULT_LAYERS)
  const [collapsed, setCollapsed] = useState({})
  const [hoverInfo, setHoverInfo] = useState(null)
  const [clickInfo, setClickInfo] = useState(null)
  const [cursor, setCursor] = useState('grab')
  const [iconsLoaded, setIconsLoaded] = useState(false)
  const mapRef = useRef(null)

  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const loadPromises = Object.keys(ICON_PATHS).map(key => new Promise(resolve => {
      const svg = makeIconSVG(key, LAYER_COLORS[key])
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const img = new Image(40, 40)
      img.onload = () => { if (!map.hasImage(`icon-${key}`)) map.addImage(`icon-${key}`, img, { pixelRatio: 2 }); URL.revokeObjectURL(url); resolve() }
      img.onerror = () => { URL.revokeObjectURL(url); resolve() }
      img.src = url
    }))
    Promise.all(loadPromises).then(() => setIconsLoaded(true))
  }, [])

  const toggle = (key) => setLayers(prev => ({ ...prev, [key]: !prev[key] }))
  const toggleGroup = (label) => setCollapsed(prev => ({ ...prev, [label]: !prev[label] }))
  const allInGroup = (group) => group.layers.every(l => layers[l.key])
  const toggleGroupAll = (group) => {
    const allOn = allInGroup(group)
    const update = {}
    group.layers.forEach(l => { update[l.key] = !allOn })
    setLayers(prev => ({ ...prev, ...update }))
  }

  // Interactive layer IDs (for hover + click)
  const interactiveIds = [
    ...POINT_LAYERS.map(k => `${k}-symbol`),
    'urban-rural-circle', 'population-fill', 'metros-fill', 'states-fill',
  ]

  const extractInfo = useCallback((f) => {
    const props = f.properties
    const coords = f.geometry.type === 'Point' ? f.geometry.coordinates : null
    const layerId = f.layer.id
      .replace('-symbol','').replace('-circle','').replace('-fill','')
    
    let lon, lat
    if (coords) { lon = coords[0]; lat = coords[1] }

    return {
      lon: lon || null, lat: lat || null,
      name: props.name || props.NAME || 'Unknown',
      type: props.type || HUB_LABELS[layerId] || layerId,
      city: props.city || '', state: props.state || '',
      iata: props.iata || '', layerId,
      enrollment: props.enrollment || null,
      population: props.population || null,
      density: props.density || null,
      metroPop: METRO_POPULATIONS[props.name || props.NAME] || null,
      statePop: STATE_POPULATIONS[props.name || props.NAME] || null,
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
      // For polygon layers, use click coords
      if (!info.lon) { info.lon = e.lngLat.lng; info.lat = e.lngLat.lat }
      setClickInfo(info)
    } else {
      setClickInfo(null)
    }
  }, [extractInfo])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#020817' }}>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={e => setViewState(e.viewState)}
        onLoad={onMapLoad}
        onClick={onMapClick}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        minZoom={3}
        maxBounds={[[-175, 15], [-50, 75]]}
        cursor={cursor}
        interactiveLayerIds={interactiveIds}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {layers.states && (
          <Source id="states" type="geojson" data={STATES_URL}>
            <Layer id="states-fill" type="fill" paint={{ 'fill-color': '#1e40af', 'fill-opacity': 0.12 }} />
            <Layer id="states-line" type="line" paint={{ 'line-color': '#60a5fa', 'line-width': 0.9, 'line-opacity': 0.7 }} />
          </Source>
        )}

        {layers.metros && (
          <Source id="metros" type="geojson" data="/metros.geojson">
            <Layer id="metros-fill" type="fill" paint={{ 'fill-color': '#0891b2', 'fill-opacity': 0.07 }} />
            <Layer id="metros-line" type="line" paint={{ 'line-color': '#22d3ee', 'line-width': 1.1, 'line-opacity': 0.65, 'line-dasharray': [4, 3] }} />
          </Source>
        )}

        {layers.population && (
          <Source id="population" type="geojson" data="/data/data_population.geojson">
            <Layer id="population-fill" type="fill"
              paint={{
                'fill-color': ['match', ['get', 'density'], 'Very High', '#ec4899', 'High', '#a855f7', 'Medium', '#6366f1', '#334155'],
                'fill-opacity': 0.25
              }}
            />
            <Layer id="population-line" type="line" paint={{ 'line-color': '#f472b6', 'line-width': 0.5, 'line-opacity': 0.4 }} />
          </Source>
        )}

        {layers.urban_rural && (
          <Source id="urban_rural" type="geojson" data="/data/data_urban_rural.geojson">
            <Layer id="urban-rural-circle" type="circle"
              paint={{
                'circle-radius': 8,
                'circle-color': ['match', ['get', 'classification'], 'Urban Core', '#818cf8', '#86efac'],
                'circle-opacity': 0.75, 'circle-stroke-color': '#020817', 'circle-stroke-width': 1,
              }}
            />
          </Source>
        )}

        {iconsLoaded && POINT_LAYERS.map(layerKey => layers[layerKey] && (
          <Source key={layerKey} id={layerKey} type="geojson" data={`/data/data_${layerKey}.geojson`}>
            <Layer id={`${layerKey}-symbol`} type="symbol"
              layout={{
                'icon-image': `icon-${layerKey}`,
                'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.35, 6, 0.55, 10, 0.8, 14, 1.1],
                'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center',
              }}
            />
          </Source>
        ))}

        {/* Hover tooltip -- lightweight, follows cursor */}
        {hoverInfo && hoverInfo.lon && (
          <Popup longitude={hoverInfo.lon} latitude={hoverInfo.lat}
            closeButton={false} closeOnClick={false} anchor="bottom" offset={16}>
            <div style={{
              fontFamily: '"Segoe UI", system-ui, sans-serif',
              background: 'rgba(2,8,23,0.97)',
              border: `1px solid ${LAYER_COLORS[hoverInfo.layerId] || '#60a5fa'}44`,
              borderRadius: 7, padding: '8px 12px', maxWidth: 220,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: LAYER_COLORS[hoverInfo.layerId] || '#60a5fa', marginBottom: 4 }}>
                {HUB_ICONS_EMOJI[hoverInfo.layerId] || ''} {hoverInfo.type}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{hoverInfo.name}</div>
              {(hoverInfo.city || hoverInfo.state) && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {[hoverInfo.city, hoverInfo.state].filter(Boolean).join(', ')}
                </div>
              )}
              {hoverInfo.population && (
                <div style={{ fontSize: 11, color: '#f472b6', marginTop: 3, fontWeight: 600 }}>
                  Pop: {fmt(hoverInfo.population)}
                </div>
              )}
              <div style={{ fontSize: 9, color: '#334155', marginTop: 4 }}>Click for details</div>
            </div>
          </Popup>
        )}

        <NavigationControl position="bottom-right" />
        <ScaleControl position="bottom-left" unit="imperial" />
      </Map>

      {/* Header */}
      <div style={{
        position: 'absolute', top: 20, left: 20,
        background: 'rgba(2,8,23,0.9)', border: '1px solid rgba(96,165,250,0.25)',
        borderRadius: 12, padding: '14px 20px', backdropFilter: 'blur(12px)',
        fontFamily: '"Segoe UI", system-ui, sans-serif', boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>Project Big Foot</div>
        <div style={{ fontSize: 10, color: '#22d3ee', marginTop: 4, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          PSI / ETS &nbsp;·&nbsp; Network Intelligence
        </div>
      </div>

      {/* Layer Panel */}
      <div style={{
        position: 'absolute', top: 20, right: 20,
        background: 'rgba(2,8,23,0.92)', border: '1px solid rgba(96,165,250,0.18)',
        borderRadius: 12, padding: '14px 0', width: 220,
        backdropFilter: 'blur(12px)', fontFamily: '"Segoe UI", system-ui, sans-serif',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        maxHeight: 'calc(100vh - 160px)', overflowY: 'auto',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '0 16px 10px' }}>
          Map Layers
        </div>
        {LAYER_GROUPS.map(group => (
          <div key={group.label}>
            <div onClick={() => toggleGroup(group.label)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 16px', cursor: 'pointer',
              background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em' }}>
                {group.label.toUpperCase()}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span onClick={e => { e.stopPropagation(); toggleGroupAll(group) }}
                  style={{ fontSize: 9, color: '#475569', cursor: 'pointer', padding: '2px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.05)' }}>
                  {allInGroup(group) ? 'ALL OFF' : 'ALL ON'}
                </span>
                <span style={{ color: '#475569', fontSize: 10 }}>{collapsed[group.label] ? '▶' : '▼'}</span>
              </div>
            </div>
            {!collapsed[group.label] && group.layers.map(({ key, label, color }) => (
              <div key={key} onClick={() => toggle(key)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', userSelect: 'none',
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: layers[key] ? color : '#1e293b',
                  border: `1.5px solid ${layers[key] ? color : '#334155'}`,
                  boxShadow: layers[key] ? `0 0 5px ${color}88` : 'none',
                  transition: 'all 0.2s',
                }} />
                <div style={{
                  width: 26, height: 15, borderRadius: 8, flexShrink: 0,
                  background: layers[key] ? color : '#1e293b',
                  border: `1px solid ${layers[key] ? color : '#334155'}`,
                  position: 'relative', transition: 'all 0.2s',
                  boxShadow: layers[key] ? `0 0 5px ${color}55` : 'none',
                }}>
                  <div style={{
                    position: 'absolute', top: 2, width: 9, height: 9, borderRadius: '50%',
                    left: layers[key] ? 13 : 2,
                    background: layers[key] ? '#020817' : '#475569', transition: 'left 0.2s',
                  }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: layers[key] ? '#e2e8f0' : '#475569', transition: 'color 0.2s' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div style={{ padding: '10px 16px 2px', fontSize: 10, color: '#1e293b' }}>Test center layers coming soon</div>
      </div>

      {/* Dynamic Legend */}
      <Legend layers={layers} />

      {/* Click Info Card */}
      <InfoCard info={clickInfo} onClose={() => setClickInfo(null)} />

      {/* Status Bar */}
      <div style={{
        position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(2,8,23,0.9)', border: '1px solid rgba(96,165,250,0.2)',
        borderRadius: 8, padding: '8px 20px', backdropFilter: 'blur(8px)',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        display: 'flex', gap: 20, alignItems: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#22d3ee', letterSpacing: '0.06em' }}>PROJECT BIG FOOT</span>
        <span style={{ color: '#334155', fontSize: 10 }}>|</span>
        <span style={{ fontSize: 11, color: '#64748b' }}>{Object.values(layers).filter(Boolean).length} layers active</span>
        <span style={{ color: '#334155', fontSize: 10 }}>|</span>
        <span style={{ fontSize: 11, color: '#64748b' }}>US Network Intelligence Platform</span>
      </div>
    </div>
  )
}
