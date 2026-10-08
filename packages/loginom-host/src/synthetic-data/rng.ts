// Numerical Recipes LCG. One seed must replay the same stream, including Box-Muller pairs.
export type Rng = {
  next(): number
  int(min: number, max: number): number
  chance(rate: number): boolean
  normal(): number
  pick<T>(values: readonly T[]): T
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  if (state === 0) state = 1
  const rng: Rng = {
    next() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 4294967296
    },
    int(min, max) {
      return min + Math.floor(rng.next() * (max - min + 1))
    },
    chance(rate) {
      return rng.next() < rate
    },
    normal() {
      const u = Math.max(rng.next(), Number.EPSILON)
      const v = rng.next()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    pick(values) {
      return values[rng.int(0, values.length - 1)]
    },
  }
  return rng
}

export function poisson(rng: Rng, lambda: number) {
  const limit = Math.exp(-Math.min(lambda, 50))
  let count = 0
  let product = 1
  do {
    count += 1
    product *= rng.next()
  } while (product > limit && count < 1000)
  return count - 1
}
