import type { RouteSegment, StationOnRoute, RefuelStop } from './types'
import { fuelBetweenPositions } from './lib/optimizeRefuelPlan'

export interface FuelAllocationDiagramProps {
  segments: RouteSegment[]
  stations: StationOnRoute[]
  totalRouteKm: number
  initialFuel: number
  stops: RefuelStop[]
}

/** Node = route segment stop (position where one segment ends and next begins). */
interface DiagramNode {
  key: string
  label: string
  positionKm: number
  type: 'start' | 'segment_stop' | 'end'
  segmentIndex?: number
}

/** Station on a leg, with optional refuel amount from the plan. */
interface StationOnLeg extends StationOnRoute {
  refuelLiters?: number
}

/** Edge = stretch between two segment stops; contains route segment info + fuel stations on that stretch. */
interface DiagramLeg {
  from: DiagramNode
  to: DiagramNode
  segment: RouteSegment
  distanceKm: number
  consumptionPerKm: number
  fuelLiters: number
  stationsOnLeg: StationOnLeg[]
}

function buildDiagramData(
  segments: RouteSegment[],
  stations: StationOnRoute[],
  totalRouteKm: number,
  stops: RefuelStop[]
): { nodes: DiagramNode[]; legs: DiagramLeg[] } {
  const refuelByStation = new Map(stops.map((s) => [s.stationId, s.quantityLiters]))

  // Waypoints = segment boundaries: 0, end of seg0, end of seg0+seg1, ..., totalKm
  const waypoints: number[] = [0]
  let cum = 0
  for (const seg of segments) {
    cum += seg.distanceKm
    waypoints.push(cum)
  }
  if (waypoints[waypoints.length - 1] !== totalRouteKm) {
    waypoints[waypoints.length - 1] = totalRouteKm
  }

  const nodes: DiagramNode[] = waypoints.map((posKm, i) => {
    const isStart = i === 0
    const isEnd = i === waypoints.length - 1
    const seg = i > 0 ? segments[i - 1] : undefined
    return {
      key: `stop-${i}`,
      label: isStart ? 'Start' : (seg?.name || (isEnd ? 'End' : `Stop ${i}`)),
      positionKm: posKm,
      type: isStart ? 'start' : isEnd ? 'end' : 'segment_stop',
      segmentIndex: isStart ? undefined : i - 1,
    }
  })

  const legs: DiagramLeg[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i]
    const to = nodes[i + 1]
    const seg = segments[i]
    if (!seg) continue
    const distanceKm = to.positionKm - from.positionKm
    const fuelLiters = fuelBetweenPositions(segments, from.positionKm, to.positionKm)
    const consumptionPerKm = distanceKm > 0 ? fuelLiters / distanceKm : seg.fuelLitersPerKm

    // Stations on this leg: positionKm in (from.positionKm, to.positionKm]
    const stationsOnLeg: StationOnLeg[] = stations
      .filter((s) => s.positionKm > from.positionKm && s.positionKm <= to.positionKm)
      .map((s) => ({
        ...s,
        refuelLiters: refuelByStation.get(s.id),
      }))
      .sort((a, b) => a.positionKm - b.positionKm)

    legs.push({
      from,
      to,
      segment: seg,
      distanceKm,
      consumptionPerKm,
      fuelLiters,
      stationsOnLeg,
    })
  }

  return { nodes, legs }
}

function ConnectorArrow({ id }: { id: string }) {
  const gradId = `track-grad-${id}`
  return (
    <svg className="diagram-connector-svg diagram-connector-svg--vertical" viewBox="0 0 24 80" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--diagram-track-start)" />
          <stop offset="100%" stopColor="var(--diagram-track-end)" />
        </linearGradient>
      </defs>
      <line
        x1="12"
        y1="0"
        x2="12"
        y2="70"
        stroke={`url(#${gradId})`}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function FuelAllocationDiagram({
  segments,
  stations,
  totalRouteKm,
  initialFuel,
  stops,
}: FuelAllocationDiagramProps) {
  const { nodes, legs } = buildDiagramData(segments, stations, totalRouteKm, stops)

  return (
    <div className="allocation-diagram">
      <div className="allocation-diagram-header">
        <h3 className="allocation-diagram-title">Route & refuel plan</h3>
        <p className="allocation-diagram-desc">
          Nodes are route segment stops. Between them, the edge shows the segment distance and fuel use; fuel stations on that stretch are listed with details and refuel amounts.
        </p>
      </div>
      <div className="allocation-diagram-surface">
        <div className="allocation-diagram-flow">
          {nodes.map((node, idx) => (
            <div key={node.key} className="diagram-segment-block">
              <div className={`diagram-node diagram-node--${node.type}`}>
                <span className="diagram-node-dot" aria-hidden />
                <span className="diagram-node-label">{node.label}</span>
                <span className="diagram-node-pos">{node.positionKm} km</span>
                {node.type === 'start' && (
                  <span className="diagram-node-meta">{initialFuel}L in tank</span>
                )}
                {node.type === 'end' && (
                  <span className="diagram-node-meta">Destination</span>
                )}
              </div>
              {idx < legs.length && (
                <div className="diagram-leg">
                  <div className="diagram-leg-segment-info">
                    <span className="diagram-leg-dist">{legs[idx].distanceKm} km</span>
                    <span className="diagram-leg-consumption">
                      {legs[idx].consumptionPerKm.toFixed(2)} L/km
                    </span>
                    <span className="diagram-leg-fuel">
                      {legs[idx].fuelLiters.toFixed(0)} L
                    </span>
                  </div>
                  <div className="diagram-leg-stations">
                    {legs[idx].stationsOnLeg.length > 0 ? (
                      legs[idx].stationsOnLeg.map((st) => (
                        <div key={st.id} className="diagram-station-card">
                          <div className="diagram-station-card-top">
                            <div className="diagram-station-left">
                              <span className="diagram-station-icon" aria-hidden>⛽</span>
                              <span className="diagram-station-name">{st.name}</span>
                            </div>
                            <span className="diagram-station-pos">{st.positionKm} km</span>
                          </div>
                          <div className="diagram-station-card-bottom">
                            <span className="diagram-station-rate">₹{st.ratePerLiter}/L</span>
                            {st.refuelLiters != null && st.refuelLiters > 0 && (
                              <span className="diagram-station-refuel">+{st.refuelLiters}L</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="diagram-leg-no-stations">No stations</span>
                    )}
                  </div>
                  <div className="diagram-leg-track">
                    <ConnectorArrow id={`leg-${idx}`} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
