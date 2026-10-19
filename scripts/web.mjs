import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { validateCity } = require('../src/fare-engine.cjs');
const read = file => readFileSync(path.join(root, file), 'utf8');
const data = JSON.parse(read('src/fares.json'));
data.cities.forEach(validateCity);
if (new Set(data.cities.map(city => city.id)).size !== data.cities.length) throw new Error('城市编号重复');
const replacements = {
  __STYLES__: read('src/styles.css'),
  __DATA__: 'const FARE_DATA = ' + JSON.stringify(data).replace(/</g, '\\u003c') + ';',
  __ENGINE__: read('src/fare-engine.cjs'),
  __APP__: read('src/app.js'),
};
// 用回调替换，源码里即使有 $& 等字符，也不会被当成替换语法。
const html = read('src/index.html').replace(/__(?:STYLES|DATA|ENGINE|APP)__/g, token => replacements[token]);
const out = path.join(root, 'release/web');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'index.html'), html);
console.log('已生成离线网页：release/web/index.html');

if (process.argv.includes('--serve')) {
  const port = Number(process.env.PORT || 4173);
  const server = createServer((request, response) => {
    if (!['/', '/index.html'].includes(request.url?.split('?')[0])) {
      response.writeHead(404); response.end('Not found'); return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(readFileSync(path.join(out, 'index.html')));
  });
  server.listen(port, '127.0.0.1', () => console.log('查询界面：http://127.0.0.1:' + port));
}
