import { orientedBox } from '@/lib/geo';
import type { Area, Vec2 } from '@/lib/types';

export interface Marking {
  lines: Vec2[][];
  /** sand-coloured strips (cricket pitch) */ strips: Vec2[][];
}

const circle = (c: Vec2, r: number, n = 40): Vec2[] =>
  Array.from(
    { length: n + 1 },
    (_, i) =>
      [
        c[0] + Math.cos((i / n) * Math.PI * 2) * r,
        c[1] + Math.sin((i / n) * Math.PI * 2) * r,
      ] as Vec2,
  );

/** Real-world markings for a pitch, fitted to its oriented bounding box. Sizes scale down for small pitches. */
export function pitchMarkings(a: Area): Marking {
  const b = orientedBox(a.points);
  const ca = Math.cos(b.angle),
    sa = Math.sin(b.angle);
  const W = (u: number, v: number): Vec2 => [b.cx + u * ca - v * sa, b.cz + u * sa + v * ca];
  const L = b.length,
    Wd = b.width,
    hl = L / 2,
    hw = Wd / 2;
  const rect = (u0: number, v0: number, u1: number, v1: number): Vec2[] => [
    W(u0, v0),
    W(u1, v0),
    W(u1, v1),
    W(u0, v1),
    W(u0, v0),
  ];
  const out: Marking = { lines: [], strips: [] };
  const outline = rect(-hl, -hw, hl, hw);
  const sport = a.sport ?? '';
  const k = Math.min(1, L / 100, Wd / 64); // shrink factor for football-sized furniture on small pitches

  if (sport === 'soccer') {
    out.lines.push(
      outline,
      [W(0, -hw), W(0, hw)],
      circle(W(0, 0), 9.15 * Math.max(0.5, k)).map((p) => p),
    );
    for (const s of [-1, 1]) {
      const pb = 16.5 * Math.max(0.5, k),
        pw = 20.16 * Math.max(0.5, k),
        gb = 5.5 * Math.max(0.5, k),
        gw = 9.16 * Math.max(0.5, k);
      out.lines.push(rect(s * hl, -pw, s * (hl - pb), pw), rect(s * hl, -gw, s * (hl - gb), gw));
    }
  } else if (sport === 'tennis') {
    const cw = Math.min(hw, 5.5),
      sl = Math.min(hl, 6.4);
    out.lines.push(
      outline,
      rect(-hl, -cw, hl, cw),
      [W(0, -hw), W(0, hw)],
      [W(-sl, -cw), W(-sl, cw)],
      [W(sl, -cw), W(sl, cw)],
      [W(-sl, 0), W(sl, 0)],
    );
  } else if (sport === 'basketball') {
    out.lines.push(
      outline,
      [W(0, -hw), W(0, hw)],
      circle(W(0, 0), Math.min(hw * 0.5, 1.8 + 0.2 * Wd)),
    );
    for (const s of [-1, 1])
      out.lines.push(
        rect(s * hl, -Math.min(hw, 2.45), s * (hl - Math.min(hl, 5.8)), Math.min(hw, 2.45)),
      );
  } else if (sport === 'volleyball') {
    out.lines.push(
      outline,
      [W(0, -hw), W(0, hw)],
      [W(-hl / 3, -hw), W(-hl / 3, hw)],
      [W(hl / 3, -hw), W(hl / 3, hw)],
    );
  } else if (sport === 'cricket') {
    // Oval boundary rope plus a 20 m strip with creases across the centre.
    const ring: Vec2[] = Array.from({ length: 49 }, (_, i) => {
      const t = (i / 48) * Math.PI * 2;
      return W(Math.cos(t) * hl * 0.92, Math.sin(t) * hw * 0.92);
    });
    out.lines.push(ring);
    const sl = Math.min(10.06, hl * 0.4);
    out.strips.push(rect(-sl, -1.52, sl, 1.52));
    out.lines.push(
      [W(-sl + 1.2, -1.32), W(-sl + 1.2, 1.32)],
      [W(sl - 1.2, -1.32), W(sl - 1.2, 1.32)],
    );
  } else {
    out.lines.push(outline);
  }
  return out;
}
