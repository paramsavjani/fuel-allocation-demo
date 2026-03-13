import { useState, useCallback } from 'react'
import type { RouteSegment, StationOnRoute, RefuelStop } from './types'

type OptimizerOutput =
  | { success: true; stops: RefuelStop[]; totalCost: number; totalLiters: number }
  | { success: false; errors: string[] }
import { execute } from './lib/optimizeRefuelPlan'
import { FuelAllocationDiagram } from './FuelAllocationDiagram'
import './App.css'

let segId = 0
let stationId = 0

function newSegment(name = 'Stop', distanceKm = 50, fuelLitersPerKm = 0.4): RouteSegment {
  return { id: `seg-${++segId}`, name, distanceKm, fuelLitersPerKm }
}

function newStation(name = 'Station', positionKm = 25, ratePerLiter = 2.5): StationOnRoute {
  return { id: `st-${++stationId}`, name, positionKm, ratePerLiter }
}

/** Initial route: 5 segments, ~500 km total. */
function getInitialSegments(): RouteSegment[] {
  const distances = [80, 120, 100, 110, 90]
  const rates = [0.38, 0.40, 0.39, 0.41, 0.38]
  const names = ['City A', 'City B', 'City C', 'City D', 'Destination']
  return distances.map((d, i) => newSegment(names[i], d, rates[i]))
}

/** Initial stations: max 8, spread along the route with varying prices. */
function getInitialStations(): StationOnRoute[] {
  const names = ['BP North', 'HP Sector 2', 'Shell Mid', 'Indian Oil', 'IOCL Highway', 'BP South', 'Shell Plaza', 'Indian Oil End']
  const positions = [40, 120, 200, 280, 350, 400, 450, 480]
  const rates = [2.2, 2.6, 2.8, 2.3, 2.5, 2.4, 2.7, 2.35]
  return names.map((name, i) => newStation(name, positions[i], rates[i]))
}

function App() {
  const [tankCapacity, setTankCapacity] = useState(50)
  const [initialFuel, setInitialFuel] = useState(50)
  const [segments, setSegments] = useState<RouteSegment[]>(() => getInitialSegments())
  const [stations, setStations] = useState<StationOnRoute[]>(() => getInitialStations())
  const [result, setResult] = useState<OptimizerOutput | null>(null)

  const addSegment = useCallback(() => {
    const last = segments[segments.length - 1]
    setSegments((prev) => [...prev, newSegment(`Stop ${prev.length + 1}`, 50, last ? last.fuelLitersPerKm : 0.4)])
  }, [segments])

  const updateSegment = useCallback((id: string, field: keyof RouteSegment, value: string | number) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    )
  }, [])

  const removeSegment = useCallback((id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const addStation = useCallback(() => {
    const totalKm = segments.reduce((s, seg) => s + seg.distanceKm, 0)
    const last = stations[stations.length - 1]
    setStations((prev) => [
      ...prev,
      newStation('New Station', last ? Math.min(last.positionKm + 50, totalKm - 10) : 30, 2.5),
    ])
  }, [segments, stations])

  const updateStation = useCallback(
    (id: string, field: keyof StationOnRoute, value: string | number) => {
      setStations((prev) =>
        prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
      )
    },
    []
  )

  const removeStation = useCallback((id: string) => {
    setStations((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const runOptimizer = useCallback(() => {
    const sortedStations = [...stations].sort((a, b) => a.positionKm - b.positionKm)
    const { stops, errors } = execute(
      segments,
      sortedStations,
      tankCapacity,
      initialFuel
    )
    if (errors.length > 0) {
      setResult({ success: false, errors })
    } else {
      const totalCost = stops.reduce((s, r) => s + r.cost, 0)
      const totalLiters = stops.reduce((s, r) => s + r.quantityLiters, 0)
      setResult({ success: true, stops, totalCost, totalLiters })
    }
  }, [segments, stations, tankCapacity, initialFuel])

  const totalRouteKm = segments.reduce((s, seg) => s + seg.distanceKm, 0)
  const totalRouteFuel = segments.reduce(
    (s, seg) => s + seg.distanceKm * seg.fuelLitersPerKm,
    0
  )

  return (
    <div className="demo">
      <header className="demo-header">
        <h1>Fuel allocation optimizer</h1>
        <p>Minimize refuel cost along a route. Set truck, route, and stations, then run.</p>
      </header>

      <div className="demo-grid">
        <section className="card truck-card">
          <h2>Truck</h2>
          <div className="field">
            <label>Tank capacity (L)</label>
            <input
              type="number"
              min={1}
              max={2000}
              value={tankCapacity}
              onChange={(e) => setTankCapacity(Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label>Initial fuel (L)</label>
            <input
              type="number"
              min={0}
              max={tankCapacity}
              value={initialFuel}
              onChange={(e) => setInitialFuel(Number(e.target.value) || 0)}
            />
          </div>
        </section>

        <section className="card route-card">
          <h2>Route segments</h2>
          <p className="card-meta">
            Total: <strong>{totalRouteKm.toFixed(0)} km</strong> · Fuel needed: <strong>{totalRouteFuel.toFixed(1)} L</strong>
          </p>
          <p className="help-text">
            Each stretch has a destination stop. First box is <strong>stop name</strong>, second is <strong>distance in km</strong>, third is <strong>fuel used per km (L/km)</strong>.
          </p>
          <div className="segment-list">
            {segments.map((seg, idx) => (
              <div key={seg.id} className="segment-row">
                <span className="seg-num">{idx + 1}</span>
                <input
                  type="text"
                  placeholder="Stop name"
                  value={seg.name}
                  onChange={(e) =>
                    updateSegment(seg.id, 'name', e.target.value)
                  }
                />
                <input
                  type="number"
                  min={1}
                  placeholder="km"
                  value={seg.distanceKm}
                  onChange={(e) =>
                    updateSegment(seg.id, 'distanceKm', Number(e.target.value) || 0)
                  }
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="L/km"
                  value={seg.fuelLitersPerKm}
                  onChange={(e) =>
                    updateSegment(seg.id, 'fuelLitersPerKm', Number(e.target.value) || 0)
                  }
                />
                <button
                  type="button"
                  className="btn-remove"
                  onClick={() => removeSegment(seg.id)}
                  title="Remove segment"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-add" onClick={addSegment}>
            + Add segment
          </button>
        </section>

        <section className="card stations-card">
          <h2>Fuel stations</h2>
          <p className="card-meta">Position = km from route start. Sorted by position when running.</p>
          <p className="help-text">
            First box is the <strong>station name</strong>, second is <strong>km on route</strong>, third is <strong>diesel price (₹ per liter)</strong>.
          </p>
          <div className="station-list">
            {stations.map((st) => (
              <div key={st.id} className="station-row">
                <input
                  type="text"
                  placeholder="Name"
                  value={st.name}
                  onChange={(e) => updateStation(st.id, 'name', e.target.value)}
                />
                <input
                  type="number"
                  min={0}
                  placeholder="km"
                  value={st.positionKm}
                  onChange={(e) =>
                    updateStation(st.id, 'positionKm', Number(e.target.value) || 0)
                  }
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="₹/L"
                  value={st.ratePerLiter}
                  onChange={(e) =>
                    updateStation(st.id, 'ratePerLiter', Number(e.target.value) || 0)
                  }
                />
                <button
                  type="button"
                  className="btn-remove"
                  onClick={() => removeStation(st.id)}
                  title="Remove station"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-add" onClick={addStation}>
            + Add station
          </button>
        </section>
      </div>

      <div className="run-wrap">
        <button type="button" className="btn-run" onClick={runOptimizer}>
          Run optimization
        </button>
      </div>

      {result && (
        <section className={`card result-card ${result.success ? 'result-ok' : 'result-err'}`}>
          <h2>{result.success ? 'Refuel plan' : 'Cannot compute plan'}</h2>
          {result.success ? (
            <>
              <div className="result-summary">
                <span>Total cost: <strong>₹{result.totalCost.toFixed(2)}</strong></span>
                <span>Total fuel: <strong>{result.totalLiters.toFixed(0)} L</strong></span>
                <span>Stops: <strong>{result.stops.length}</strong></span>
              </div>
              <FuelAllocationDiagram
                segments={segments}
                stations={stations}
                totalRouteKm={totalRouteKm}
                initialFuel={initialFuel}
                stops={result.stops}
              />
              {result.stops.length === 0 ? (
                <p className="no-stops">No refuels needed — initial fuel is enough.</p>
              ) : (
                <div className="stops-table-wrap">
                  <table className="stops-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Station</th>
                        <th>Position (km)</th>
                        <th>Liters</th>
                        <th>Rate (₹/L)</th>
                        <th>Cost (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.stops.map((stop: RefuelStop, i: number) => (
                        <tr key={stop.stationId + i}>
                          <td>{i + 1}</td>
                          <td>{stop.stationName}</td>
                          <td>{stop.positionKm}</td>
                          <td>{stop.quantityLiters.toFixed(0)}</td>
                          <td>{stop.ratePerLiter.toFixed(2)}</td>
                          <td>{stop.cost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <ul className="error-list">
              {result.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

export default App
