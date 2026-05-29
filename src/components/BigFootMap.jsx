import { useState } from 'react'
import Map, { Layer, Source, NavigationControl, ScaleControl } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import metrosData from './metros.geojson'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const INITIAL_VIEW = {
  longitude: -96,
  latitude: 39,
  zoom: 4,
  pitch: 0,
  bearing: 0,
}

const STATES_URL =
  'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'

const LAYER_CONFIG = [
  { key: 'states', label: 'State Boundaries', color: '#60a5fa' },
  { key: 'metros', label: 'Metro Areas', color: '#22d3ee' },
]

export default function BigFootMap() {
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const [layers, setLayers] = useState({ states: true, metros: true })

  const toggle = (key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#020817' }}>
      <Map
        {...viewState}
        onMove={(e) => setViewState(e.viewState)}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        minZoom={3}
        maxBounds={[[-175, 15], [-50, 75]]}
      >
        {/* State Boundaries */}
        {layers.states && (
          <Source id="states" type="geojson" data={STATES_URL}>
            <Layer
              id="states-fill"
              type="fill"
              paint={{ 'fill-color': '#1e40af', 'fill-opacity': 0.15 }}
            />
            <Layer
              id="states-line"
              type="line"
              paint={{ 'line-color': '#60a5fa', 'line-width': 0.9, 'line-opacity': 0.7 }}
            />
          </Source>
        )}

        {/* Metro Area Boundaries - local static data */}
        {layers.metros && (
          <Source id="metros" type="geojson" data={metrosData}>
            <Layer
              id="metros-fill"
              type="fill"
              paint={{ 'fill-color': '#0891b2', 'fill-opacity': 0.1 }}
            />
            <Layer
              id="metros-line"
              type="line"
              paint={{
                'line-color': '#22d3ee',
                'line-width': 1.2,
                'line-opacity': 0.7,
                'line-dasharray': [4, 3],
              }}
            />
          </Source>
        )}

        <NavigationControl position="bottom-right" />
        <ScaleControl position="bottom-left" unit="imperial" />
      </Map>

      {/* Header */}
      <div style={{
        position: 'absolute', top: 24, left: 24,
        background: 'rgba(2, 8, 23, 0.88)',
        border: '1px solid rgba(96, 165, 250, 0.25)',
        borderRadius: 12, padding: '16px 22px',
        backdropFilter: 'blur(12px)',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          Project Big Foot
        </div>
        <div style={{ fontSize: 10, color: '#22d3ee', marginTop: 5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          PSI / ETS &nbsp;·&nbsp; Network Intelligence
        </div>
      </div>

      {/* Layer Toggle Panel */}
      <div style={{
        position: 'absolute', top: 24, right: 24,
        background: 'rgba(2, 8, 23, 0.88)',
        border: '1px solid rgba(96, 165, 250, 0.2)',
        borderRadius: 12, padding: '16px 20px', minWidth: 200,
        backdropFilter: 'blur(12px)',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: '#475569', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>
          Map Layers
        </div>

        {LAYER_CONFIG.map(({ key, label, color }) => (
          <div
            key={key}
            onClick={() => toggle(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 0', cursor: 'pointer',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              userSelect: 'none',
            }}
          >
            <div style={{
              width: 32, height: 18, borderRadius: 9,
              background: layers[key] ? color : '#1e293b',
              border: `1px solid ${layers[key] ? color : '#334155'}`,
              position: 'relative', transition: 'all 0.25s', flexShrink: 0,
              boxShadow: layers[key] ? `0 0 8px ${color}55` : 'none',
            }}>
              <div style={{
                position: 'absolute', top: 2,
                left: layers[key] ? 15 : 2,
                width: 12, height: 12, borderRadius: '50%',
                background: layers[key] ? '#020817' : '#475569',
                transition: 'left 0.25s',
              }} />
            </div>
            <span style={{
              fontSize: 13, fontWeight: 500,
              color: layers[key] ? '#e2e8f0' : '#475569',
              transition: 'color 0.2s',
            }}>
              {label}
            </span>
          </div>
        ))}

        <div style={{ marginTop: 14, fontSize: 10, color: '#334155', letterSpacing: '0.04em' }}>
          More layers coming soon
        </div>
      </div>
    </div>
  )
}
