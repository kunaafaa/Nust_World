// Prints initial-load JS (gzip + brotli) from the built index.html, plus total of all chunks. Run after `next build`.
const fs = require('fs'), zlib = require('zlib');
const html = fs.readFileSync('.next/server/app/index.html', 'utf8');
const srcs = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]))];
const size = (f) => { const b = fs.readFileSync('.next/' + f.replace('/_next/', '')); return [b.length, zlib.gzipSync(b).length, zlib.brotliCompressSync(b).length]; };
const sum = (fs_) => fs_.map(size).reduce((a, s) => a.map((v, i) => v + s[i]), [0, 0, 0]);
const init = sum(srcs);
const all = fs.readdirSync('.next/static/chunks').filter((f) => f.endsWith('.js')).map((f) => '/_next/static/chunks/' + f);
const tot = sum(all);
const k = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`initial JS (${srcs.length} files): raw ${k(init[0])}, gzip ${k(init[1])}, brotli ${k(init[2])}`);
console.log(`all JS chunks (${all.length}): raw ${k(tot[0])}, gzip ${k(tot[1])}, brotli ${k(tot[2])}`);
