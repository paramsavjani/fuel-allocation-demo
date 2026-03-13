import type { RouteSegment, StationOnRoute, RefuelStop } from './types'
import { fuelBetweenPositions } from './lib/optimizeRefuelPlan'

export interface FuelAllocationDiagramProps {
  segments: RouteSegment[]
  stations: StationOnRoute[]
  totalRouteKm: number
  initialFuel: number
  stops: RefuelStop[]
}

interface DiagramNode {
  key: string
  label: string
  positionKm: number
  type: 'start' | 'station' | 'end'
  station?: StationOnRoute
  refuelLiters?: number
}

interface DiagramLeg {
  from: DiagramNode
  to: DiagramNode
  distanceKm: number
  fuelLiters: number
  consumptionPerKm: number
  stationAtEnd?: StationOnRoute
}

function buildDiagramData(
  segments: RouteSegment[],
  stations: StationOnRoute[],
  totalRouteKm: number,
  initialFuel: number,
  stops: RefuelStop[]
): { nodes: DiagramNode[]; legs: DiagramLeg[] } {
  const refuelByStation = new Map(stops.map((s) => [s.stationId, s.quantityLiters]))
  const points = [0, ...stations.map((s) => s.positionKm), totalRouteKm]

  const nodes: DiagramNode[] = []
  nodes.push({
    key: 'start',
    label: 'Start',
    positionKm: 0,
    type: 'start',
  })
  stations.forEach((st, i) => {
    nodes.push({
      key: st.id,
      label: st.name,
      positionKm: st.positionKm,
      type: 'station',
      station: st,
      refuelLiters: refuelByStation.get(st.id),
    })
  })
  nodes.push({
    key: 'end',
    label: 'End',
    positionKm: totalRouteKm,
    type: 'end',
  })

  const legs: DiagramLeg[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i]
    const to = nodes[i + 1]
    const distanceKm = to.positionKm - from.positionKm
    const fuelLiters = fuelBetweenPositions(segments, from.positionKm, to.positionKm)
    const consumptionPerKm = distanceKm > 0 ? fuelLiters / distanceKm : 0
    legs.push({
      from,
      to,
      distanceKm,
      fuelLiters,
      consumptionPerKm,
      stationAtEnd: to.station,
    })
  }
  return { nodes, legs }
}

export function FuelAllocationDiagram({
  segments,
  stations,
  totalRouteKm,
  initialFuel,
  stops,
}: FuelAllocationDiagramProps) {
  const sortedStations = [...stations].sort((a, b) => a.positionKm - b.positionKm)
  const { nodes, legs } = buildDiagramData(
    segments,
    sortedStations,
    totalRouteKm,
    initialFuel,
    stops
  )

  return (
    <div className="allocation-diagram">
      <h3 className="allocation-diagram-title">Route & refuel plan</h3>
      <p className="allocation-diagram-desc">
        Journey from start to end: segments show distance and fuel consumption (L/km). At each station you can refuel; the plan shows how much to add where.
      </p>
      <div className="allocation-diagram-flow">
        {nodes.map((node, idx) => (
          <div key={node.key} className="diagram-segment-block">
            {/* Node */}
            <div className={`diagram-node diagram-node--${node.type}`}>
              <span className="diagram-node-label">{node.label}</span>
              {node.type === 'start' && (
                <span className="diagram-node-meta">Started with {initialFuel}L in tank</span>
              )}
              {node.type === 'station' && node.refuelLiters != null && node.refuelLiters > 0 && (
                <span className="diagram-node-meta diagram-node-meta--refuel">
                  {node.refuelLiters}L fueled here
                </span>
              )}
            </div>
            {/* Leg to next (arrow + labels) */}
            {idx < legs.length && (
              <div className="diagram-leg">
                {legs[idx].stationAtEnd && (
                  <div className="diagram-leg-station">
                    <span className="diagram-leg-pump" title="Fuel station">⛽</span>
                    <span className="diagram-leg-station-name">{legs[idx].stationAtEnd.name}</span>
                    <span className="diagram-leg-station-dist">Dist. {legs[idx].distanceKm} km</span>
                    <span className="diagram-leg-station-rate">Rate: ₹{legs[idx].stationAtEnd.ratePerLiter}/L</span>
                  </div>
                )}
                {!legs[idx].stationAtEnd && (
                  <div className="diagram-leg-station diagram-leg-station--to-end">
                    <span className="diagram-leg-station-dist">To end · {legs[idx].distanceKm} km</span>
                  </div>
                )}
                <div className="diagram-leg-arrow">
                  <span className="diagram-leg-consumption">
                    {legs[idx].consumptionPerKm.toFixed(2)} L/km
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
