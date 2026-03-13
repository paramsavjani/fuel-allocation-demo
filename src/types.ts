/** One segment of the route: distance and fuel consumption rate. */
export interface RouteSegment {
  id: string
  name: string
  distanceKm: number
  fuelLitersPerKm: number
}

/** Fuel consumed on this segment (L). */
export function segmentFuelLiters(seg: RouteSegment): number {
  return seg.distanceKm * seg.fuelLitersPerKm
}

/** A filling station on the route: position (km from start) and price per liter. */
export interface StationOnRoute {
  id: string
  name: string
  positionKm: number
  ratePerLiter: number
}

/** One refuel stop from the optimizer: station and quantity in liters. */
export interface RefuelStop {
  stationId: string
  stationName: string
  quantityLiters: number
  positionKm: number
  ratePerLiter: number
  cost: number
}

export interface OptimizerResult {
  success: true
  stops: RefuelStop[]
  totalCost: number
  totalLiters: number
}

export interface OptimizerError {
  success: false
  errors: string[]
}

export type OptimizerOutput = OptimizerResult | OptimizerError
