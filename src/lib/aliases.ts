/** Spelling variants people actually type. Each group is interchangeable inside a name. */
const GROUPS: string[][] = [
  ['zakariya', 'zakaria', 'zakarya', 'zakariyya'],
  ['rehmat', 'rahmat', 'rehmet'],
  ['saloon', 'salon'],
  ['ghazali', 'ghazzali', 'ghazal'],
  ['hajveri', 'hajvery', 'hajwari', 'hajweri'],
  ['masjid', 'mosque'],
];

/** All spelling variants of a name (lower-cased, de-duplicated, excluding the original). */
export function nameVariants(name: string): string[] {
  const lower = name.toLowerCase();
  const out = new Set<string>();
  for (const g of GROUPS) {
    for (const a of g) {
      if (!lower.includes(a)) continue;
      for (const b of g) if (a !== b) out.add(lower.replace(a, b));
    }
  }
  // "Ghazali 1" ⇄ "Ghazali-1" ⇄ "Ghazali I"
  const rom: Record<string, string> = { '1': 'i', '2': 'ii', '3': 'iii' };
  for (const v of [lower, ...out]) {
    const m = v.match(/^(.*?)[\s-]*(\d)$/);
    if (m && rom[m[2]]) {
      out.add(`${m[1]} ${rom[m[2]]}`);
      out.add(`${m[1]}-${m[2]}`);
      out.add(`${m[1]}${m[2]}`);
    }
  }
  out.delete(lower);
  return [...out];
}
