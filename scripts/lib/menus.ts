/**
 * Pure parsing helpers for `npm run menus` (no network, unit tested in tests/menus.test.ts).
 *
 * nustcafe.vercel.app is a Vite single-page app. Each cafe's menu ships as a small public JS chunk
 * (`/assets/<id>-<hash>.js`) containing `JSON.parse('[...]')`. We read that text; we never run it.
 */

import type { Menu, MenuCategory, MenuItem, MenuVariant } from '../../src/lib/menu';
export type { Menu, MenuCategory, MenuItem, MenuVariant };

export interface CafeRef {
  id: string;
  name: string;
  description: string;
  chunk: string | null;
}

/** Decode the body of a single-quoted JS string literal (as minifiers emit around JSON.parse). */
export function unescapeJsString(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_m, c: string) => {
    if (c[0] === 'u' || c[0] === 'x') return String.fromCharCode(parseInt(c.slice(1), 16));
    switch (c) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case '0':
        return '\0';
      default:
        return c; // \' \" \\ \/
    }
  });
}

/** Cafes listed in the site's main bundle, with the lazy chunk that holds each menu. */
export function parseCafeList(bundle: string): CafeRef[] {
  const chunks = new Map<string, string>();
  for (const m of bundle.matchAll(/import\("(\.\/([a-z0-9-]+)-[A-Za-z0-9_-]+\.js)"\)/g)) {
    chunks.set(m[2], m[1].slice(2));
  }
  const out: CafeRef[] = [];
  const re =
    /\{id:"([^"]+)",name:"((?:[^"\\]|\\.)*)",description:"((?:[^"\\]|\\.)*)",location:"[^"]*",dataFile:"[^"]+"/g;
  for (const m of bundle.matchAll(re)) {
    out.push({
      id: m[1],
      name: unescapeJsString(m[2]),
      description: unescapeJsString(m[3]),
      chunk: chunks.get(m[1]) ?? null,
    });
  }
  return out;
}

export interface RawItem {
  id: number | string;
  name: string;
  price: number;
  category: string;
  rating?: number;
  description?: string;
  variants?: MenuVariant[];
  available?: boolean;
  tags?: string[];
}

/**
 * Turn a minified JS array/object literal (unquoted keys, "double-quoted" strings) into JSON text.
 * Only quotes bare keys; strings are copied untouched. No eval. Throws on anything but plain data.
 */
export function literalToJson(src: string): string {
  let out = '';
  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (/[\d.]/.test(ch)) {
      // minified numbers: 1e3, .5 (same value, JSON spelling)
      const num = /^\d*\.?\d+(?:[eE][+-]?\d+)?|^\d+\./.exec(src.slice(i))![0];
      out += num.startsWith('.') ? `0${num}` : num.endsWith('.') ? `${num}0` : num;
      i += num.length;
    } else if (ch === '!' && (src[i + 1] === '0' || src[i + 1] === '1')) {
      out += src[i + 1] === '0' ? 'true' : 'false'; // minified booleans
      i += 2;
    } else if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))![0];
      const next = src[i + m.length];
      if (next === ':') out += `"${m}"`;
      else if (m === 'true' || m === 'false' || m === 'null') out += m;
      else throw new Error(`unexpected identifier "${m}" in menu literal`);
      i += m.length;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Slice the first top-level `[ ... ]` that follows an `=` in the chunk (strings respected). */
function firstArrayAfterAssign(js: string): string {
  const start = js.search(/=\s*\[/);
  if (start < 0) throw new Error('no array literal found in chunk');
  const open = js.indexOf('[', start);
  let depth = 0;
  for (let i = open; i < js.length; i++) {
    const ch = js[i];
    if (ch === '"') {
      i++;
      while (i < js.length && js[i] !== '"') i += js[i] === '\\' ? 2 : 1;
    } else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return js.slice(open, i + 1);
  }
  throw new Error('unterminated array literal in chunk');
}

/** The item array inside a cafe chunk (`JSON.parse('...')` or a plain literal). Throws on any other shape. */
export function parseCafeChunk(js: string): RawItem[] {
  const m = js.match(/JSON\.parse\('((?:[^'\\]|\\[\s\S])*)'\)/);
  const items: unknown = m
    ? JSON.parse(unescapeJsString(m[1]))
    : JSON.parse(literalToJson(firstArrayAfterAssign(js)));
  if (!Array.isArray(items)) throw new Error('chunk payload is not an array');
  return items as RawItem[];
}

/** Group raw items into categories, keeping the order they appear in (first appearance wins). */
export function buildMenu(
  meta: { cafeId: string; name: string; source: string; updatedAt: string; currency?: string },
  raw: RawItem[],
): Menu {
  const cats = new Map<string, MenuItem[]>();
  for (const r of raw) {
    if (typeof r.name !== 'string' || typeof r.price !== 'number' || !Number.isFinite(r.price)) {
      throw new Error(`item ${JSON.stringify(r)} has no usable name/price`);
    }
    const item: MenuItem = {
      id: String(r.id),
      name: r.name,
      price: r.price,
      available: r.available ?? true,
    };
    if (r.description) item.description = r.description;
    if (r.variants?.length) item.variants = r.variants;
    if (r.tags?.length) item.tags = r.tags;
    const key = typeof r.category === 'string' && r.category ? r.category : 'Other';
    const list = cats.get(key) ?? [];
    list.push(item);
    cats.set(key, list);
  }
  return {
    cafeId: meta.cafeId,
    name: meta.name,
    currency: meta.currency ?? 'PKR',
    updatedAt: meta.updatedAt,
    source: meta.source,
    categories: [...cats].map(([name, items]) => ({ name, items })),
  };
}

/**
 * Accept a public API payload if (and only if) it looks like a menu: `{ items: [...] }`,
 * a bare array, or `{ categories: [{ name, items }] }`. Returns null for anything else.
 */
export function rawFromApi(json: unknown): RawItem[] | null {
  const isItem = (x: unknown): x is RawItem =>
    !!x &&
    typeof x === 'object' &&
    typeof (x as RawItem).name === 'string' &&
    typeof (x as RawItem).price === 'number';
  const arr = Array.isArray(json) ? json : (json as { items?: unknown })?.items;
  if (Array.isArray(arr) && arr.length && arr.every(isItem)) return arr;
  const cats = (json as { categories?: unknown })?.categories;
  if (Array.isArray(cats) && cats.length) {
    const out: RawItem[] = [];
    for (const c of cats as { name?: string; items?: unknown[] }[]) {
      if (!c || typeof c.name !== 'string' || !Array.isArray(c.items)) return null;
      for (const it of c.items) {
        if (!isItem(it)) return null;
        out.push({ ...it, category: c.name });
      }
    }
    return out;
  }
  return null;
}

/** Things worth a human look, for docs/menu-notes.md. Never changes the data. */
export function menuNotes(menu: Menu): string[] {
  const notes: string[] = [];
  const seen = new Map<string, number>();
  for (const c of menu.categories) {
    for (const i of c.items) {
      const k = `${c.name}|${i.name.trim().toLowerCase()}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
      if (i.name !== i.name.trim())
        notes.push(`"${i.name}" has leading/trailing spaces (kept as shown).`);
      if (i.price <= 0) notes.push(`"${i.name}" (${c.name}) has price ${i.price}.`);
      if (!Number.isInteger(i.price))
        notes.push(`"${i.name}" (${c.name}) has a non-integer price ${i.price}.`);
    }
  }
  for (const [k, n] of seen)
    if (n > 1)
      notes.push(`Duplicate entry "${k.split('|')[1]}" in ${k.split('|')[0]} (x${n}); both kept.`);
  const names = new Map<string, string[]>();
  for (const c of menu.categories)
    for (const i of c.items) {
      const k = i.name.trim().toLowerCase();
      names.set(k, [...(names.get(k) ?? []), `${c.name} ${i.price}`]);
    }
  for (const [k, where] of names) {
    if (where.length > 1 && new Set(where.map((w) => w.split(' ')[0])).size > 1) {
      notes.push(`"${k}" appears in several categories (${where.join(', ')}).`);
    }
  }
  return notes;
}
