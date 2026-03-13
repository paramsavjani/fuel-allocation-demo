/**
 * DP-based optimizer: chooses refuel (station, quantity) to minimize total cost
 * subject to tank capacity and never running out of fuel.
 * Ported from fleetcore OptimizeRefuelPlan.kt
 */

import type { RefuelStop, RouteSegment, StationOnRoute } from '../types'

const INF = Number.MAX_SAFE_INTEGER / 2

function fuelBetweenPositions(
  segments: RouteSegment[],
  posA: number,
  posB: number
): number {
  if (posA >= posB) return 0
  let cumKm = 0
  let fuel = 0
  for (const seg of segments) {
    const segStart = cumKm
    const segEnd = cumKm + seg.distanceKm
    const overlapStart = Math.max(posA, segStart)
    const overlapEnd = Math.min(posB, segEnd)
    if (overlapStart < overlapEnd) {
      const fraction = (segEnd - segStart) > 0 ? (overlapEnd - overlapStart) / (segEnd - segStart) : 0
      fuel += seg.distanceKm * seg.fuelLitersPerKm * fraction
    }
    cumKm = segEnd
  }
  return fuel
}

function backtrack(
  n: number,
  stations: StationOnRoute[],
  consumptionLiters: number[],
  refuelLiters: number[][],
  initialFuelLiters: number,
  tankCapacityLiters: number
): RefuelStop[] {
  const result: RefuelStop[] = []
  let fuel = initialFuelLiters
  for (let i = 0; i <= n; i++) {
    const x = Math.max(0, refuelLiters[i][fuel] ?? 0)
    if (i >= 1 && i <= n && x > 0) {
      const station = stations[i - 1]
      result.push({
        stationId: station.id,
        stationName: station.name,
        quantityLiters: x,
        positionKm: station.positionKm,
        ratePerLiter: station.ratePerLiter,
        cost: x * station.ratePerLiter,
      })
    }
    const cons = Math.round(consumptionLiters[i] ?? 0)
    fuel = Math.max(0, Math.min(tankCapacityLiters, fuel + x - cons))
  }
  return result
}

export function execute(
  segments: RouteSegment[],
  stations: StationOnRoute[],
  tankCapacityLiters: number,
  initialFuelLiters: number
): { stops: RefuelStop[]; errors: string[] } {
  const errors: string[] = []
  const totalKm = segments.reduce((s, seg) => s + seg.distanceKm, 0)
  const totalFuelLiters = segments.reduce(
    (s, seg) => s + seg.distanceKm * seg.fuelLitersPerKm,
    0
  )

  if (stations.length === 0) {
    errors.push(
      'No filling stations on this route. Add filling stations so the optimizer can plan refuels.'
    )
    return { stops: [], errors }
  }

  const points: number[] = [0]
  for (const st of stations) points.push(st.positionKm)
  points.push(totalKm)

  const consumptionLiters = points.slice(0, -1).map((_, i) =>
    fuelBetweenPositions(segments, points[i], points[i + 1])
  )

  const fuelPerKm = totalKm > 0 ? totalFuelLiters / totalKm : 0
  const maxStretchKm = fuelPerKm > 0 ? tankCapacityLiters / fuelPerKm : 0
  for (let i = 0; i < consumptionLiters.length; i++) {
    const cons = Math.ceil(consumptionLiters[i])
    if (cons > tankCapacityLiters) {
      const fromKm = points[i]
      const toKm = points[i + 1]
      errors.push(
        `No filling station between ${fromKm} km and ${toKm} km: stretch requires ${cons} L but tank capacity is ${tankCapacityLiters} L. Add a station (max stretch ~${Math.floor(maxStretchKm)} km).`
      )
    }
  }
  if (errors.length > 0) return { stops: [], errors }

  const n = stations.length
  const dp: number[][] = Array(n + 2)
    .fill(0)
    .map(() => Array(tankCapacityLiters + 1).fill(INF))
  const refuelLiters: number[][] = Array(n + 2)
    .fill(0)
    .map(() => Array(tankCapacityLiters + 1).fill(-1))

  for (let f = 0; f <= tankCapacityLiters; f++) dp[n + 1][f] = 0

  for (let i = n; i >= 0; i--) {
    const cons = Math.ceil(consumptionLiters[i])
    if (i >= 1 && i <= n) {
      const station = stations[i - 1]
      const rate = station.ratePerLiter
      for (let f = 0; f <= tankCapacityLiters; f++) {
        let best = INF
        let bestX = -1
        const minX = Math.max(0, cons - f)
        const maxX = Math.min(tankCapacityLiters - f, tankCapacityLiters)
        for (let x = minX; x <= maxX; x++) {
          const afterDrive = f + x - cons
          if (afterDrive < 0 || afterDrive > tankCapacityLiters) continue
          const cost = x * rate + dp[i + 1][afterDrive]
          if (cost < best) {
            best = cost
            bestX = x
          }
        }
        dp[i][f] = best
        refuelLiters[i][f] = bestX
      }
    } else {
      for (let f = cons; f <= tankCapacityLiters; f++) {
        dp[i][f] = dp[i + 1][f - cons]
        refuelLiters[i][f] = 0
      }
    }
  }

  const invalidInitial = initialFuelLiters > tankCapacityLiters
  const infeasible =
    !invalidInitial && dp[0][initialFuelLiters] >= INF - 1

  if (invalidInitial) {
    errors.push(
      `Invalid: starting fuel (${initialFuelLiters} L) cannot exceed tank capacity (${tankCapacityLiters} L).`
    )
    return { stops: [], errors }
  }
  if (infeasible) {
    const needToFirst = stations.length ? Math.ceil(consumptionLiters[0]) : 0
    const firstStationKm = stations.length ? stations[0].positionKm : 0
    errors.push(
      `With ${initialFuelLiters} L starting fuel you cannot reach the first filling station at ${firstStationKm} km (need ${needToFirst} L). Use higher starting fuel or add a station closer to the start.`
    )
    return { stops: [], errors }
  }

  const stops = backtrack(
    n,
    stations,
    consumptionLiters,
    refuelLiters,
    initialFuelLiters,
    tankCapacityLiters
  )
  return { stops, errors }
}
