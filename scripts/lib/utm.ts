/** WGS84 <-> UTM 43N (central meridian 75°E), Snyder series (mm-level accuracy this close to the meridian). */
const a = 6378137;
const f = 1 / 298.257223563;
const e2 = f * (2 - f);
const ep2 = e2 / (1 - e2);
const k0 = 0.9996;
const L0 = (75 * Math.PI) / 180;
const rad = (d: number) => (d * Math.PI) / 180;
const m0 = 1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256;

const meridian = (p: number) =>
  a *
  (m0 * p -
    ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p) +
    ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p) -
    ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));

/** lng/lat (deg) -> [easting, northing] in UTM 43N metres. */
export function toUtm(lng: number, lat: number): [number, number] {
  const p = rad(lat);
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const T = Math.tan(p) ** 2;
  const C = ep2 * Math.cos(p) ** 2;
  const A = (rad(lng) - L0) * Math.cos(p);
  const x =
    k0 *
      N *
      (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) +
    500000;
  const y =
    k0 *
    (meridian(p) +
      N *
        Math.tan(p) *
        (A ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [x, y];
}

/** [easting, northing] -> [lng, lat] in degrees. */
export function fromUtm(x: number, y: number): [number, number] {
  const M = y / k0;
  const mu = M / (a * m0);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(p1) ** 2;
  const T1 = Math.tan(p1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2);
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5;
  const D = (x - 500000) / (N1 * k0);
  const lat =
    p1 -
    ((N1 * Math.tan(p1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lng =
    L0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      Math.cos(p1);
  return [(lng * 180) / Math.PI, (lat * 180) / Math.PI];
}
