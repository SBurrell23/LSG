// rng.js — small seeded PRNG (mulberry32) so any sheet can be recreated from its seed.

function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: p => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    // arr of [value, weight]
    weighted: arr => {
      let total = 0;
      for (const [, w] of arr) total += w;
      let r = next() * total;
      for (const [v, w] of arr) { r -= w; if (r <= 0) return v; }
      return arr[arr.length - 1][0];
    },
  };
}
