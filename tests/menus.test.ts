import { describe, expect, it } from 'vitest';
import {
  buildMenu,
  literalToJson,
  menuNotes,
  parseCafeChunk,
  parseCafeList,
  rawFromApi,
  unescapeJsString,
} from '../scripts/lib/menus';

const JSON_CHUNK = `const r="c1",e="C1 Cafe",a="desc",i=JSON.parse('[{"id":1,"name":"Chicken Tikka","price":350,"rating":0,"category":"BBQ"},{"id":2,"name":"Zinger \\'Hot\\' & Co","price":1200,"rating":0,"category":"Burger"},{"id":3,"name":"Boti","price":380,"rating":0,"category":"BBQ"}]'),c={id:"c1",name:e,description:a,items:i};export{c as default};`;
const LIT_CHUNK = `const r="c2",a="C2 Cafe",e="x, y: z",i=[{id:1,name:"Donuts, plain: 2",price:150,rating:0,category:"Dessert"},{id:87,name:"Pizza Medium",price:1e3,rating:0,category:"Pizza"},{id:88,name:"Off",price:.5,rating:0,category:"Pizza",available:!1}],c={id:"c2",name:a,description:e,items:i};export{c as default};`;

describe('chunk parsing', () => {
  it('reads the JSON.parse form, unescaping the JS string', () => {
    const items = parseCafeChunk(JSON_CHUNK);
    expect(items).toHaveLength(3);
    expect(items[1].name).toBe("Zinger 'Hot' & Co");
    expect(items[1].price).toBe(1200);
  });
  it('reads the plain-literal form (bare keys, 1e3, .5, !1) without eval', () => {
    const items = parseCafeChunk(LIT_CHUNK);
    expect(items.map((i) => i.price)).toEqual([150, 1000, 0.5]);
    expect(items[0].name).toBe('Donuts, plain: 2'); // colon and comma inside a string are untouched
    expect(items[2].available).toBe(false);
  });
  it('refuses code it does not understand', () => {
    expect(() => literalToJson('[{a:alert(1)}]')).toThrow(/unexpected identifier/);
    expect(() => parseCafeChunk('export default 1')).toThrow();
  });
  it('unescapes common JS escapes', () => {
    expect(unescapeJsString("a\\'b\\\\c\\u00e9\\n")).toBe("a'b\\cé\n");
  });
});

describe('cafe list', () => {
  const bundle = `x={id:"c1",name:"C1 Cafe",description:"One of NUST's best",location:"NUST H-12 campus",dataFile:"./c1.json"},{id:"coffee-lounge",name:"Coffee Lounge",description:"d",location:"l",dataFile:"./coffee-lounge.json"}];
    "../data/c1.json":()=>Le(()=>import("./c1-Dkafdy_F.js"),[]),"../data/coffee-lounge.json":()=>Le(()=>import("./coffee-lounge-BlmRQGk4.js"),[])`;
  it('finds cafes and their chunks', () => {
    expect(parseCafeList(bundle)).toEqual([
      { id: 'c1', name: 'C1 Cafe', description: "One of NUST's best", chunk: 'c1-Dkafdy_F.js' },
      {
        id: 'coffee-lounge',
        name: 'Coffee Lounge',
        description: 'd',
        chunk: 'coffee-lounge-BlmRQGk4.js',
      },
    ]);
  });
});

describe('buildMenu', () => {
  const meta = {
    cafeId: 'c1',
    name: 'C1 Cafe',
    source: 'test',
    updatedAt: '2026-11-14T00:00:00.000Z',
  };
  it('groups by category in order of first appearance and copies values exactly', () => {
    const m = buildMenu(meta, parseCafeChunk(JSON_CHUNK));
    expect(m.currency).toBe('PKR');
    expect(m.categories.map((c) => [c.name, c.items.length])).toEqual([
      ['BBQ', 2],
      ['Burger', 1],
    ]);
    expect(m.categories[0].items[0]).toEqual({
      id: '1',
      name: 'Chicken Tikka',
      price: 350,
      available: true,
    });
  });
  it('rejects items without a numeric price rather than guessing', () => {
    expect(() => buildMenu(meta, [{ id: 1, name: 'x', price: NaN, category: 'a' }])).toThrow();
  });
  it('flags duplicates without changing them', () => {
    const m = buildMenu(meta, [
      { id: 1, name: 'Tea', price: 50, category: 'Hot' },
      { id: 2, name: 'Tea', price: 60, category: 'Hot' },
    ]);
    expect(m.categories[0].items).toHaveLength(2);
    expect(menuNotes(m).join()).toMatch(/Duplicate entry "tea"/);
  });
});

describe('public API payloads', () => {
  it('accepts items arrays and category trees, nothing else', () => {
    expect(rawFromApi({ items: [{ id: 1, name: 'a', price: 1, category: 'x' }] })).toHaveLength(1);
    const tree = rawFromApi({
      categories: [{ name: 'Hot', items: [{ id: 1, name: 'Tea', price: 50 }] }],
    });
    expect(tree?.[0].category).toBe('Hot');
    expect(rawFromApi('<!doctype html>')).toBeNull();
    expect(rawFromApi({ items: [{ name: 'a' }] })).toBeNull();
  });
});
