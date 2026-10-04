// Static vendor review only: no PDF input execution, eval, imports, credentials or application data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const vendor = 'node_modules/.pnpm/pdf-parse@1.1.4/node_modules/pdf-parse/lib';
const specifications = [
  ['apps/worker/src/jobs/parse-document.ts', [[65, 70]]],
  [`${vendor}/pdf-parse.js`, [[1, 17], [40, 48], [64, 71], [95, 103]]],
  [`${vendor}/pdf.js/v1.10.100/build/pdf.js`, [[3800, 3819], [14544, 14563], [15638, 15656]]],
  [`${vendor}/pdf.js/v1.10.100/build/pdf.worker.js`, [[25414, 25432], [32077, 32115]]],
];
async function main() {
  const sources = specifications.map(([file, ranges]) => {
    const contents = fs.readFileSync(path.join(root, file), 'utf8');
    const lines = contents.split(/\r?\n/);
    return { file, sha256: crypto.createHash('sha256').update(contents).digest('hex'), excerpts: ranges.map(([start, end]) => ({ start, end, lines: lines.slice(start - 1, end).map((text, index) => ({ line: start + index, text })) })) };
  });
  const publisher = [];
  for (const id of ['GHSA-wgrm-67xf-hhpq', 'GHSA-hq66-cqwq-w95j']) {
    const url = `https://github.com/mozilla/pdf.js/security/advisories/${id}`;
    const response = await fetch(url, { headers: { 'user-agent': 'CampusForge-readonly-vendor-review' } });
    const html = await response.text();
    publisher.push({ id, url, status: response.status, fetchedAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(html).digest('hex'), title: /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() });
  }
  fs.writeFileSync(path.join(root, 'docs/audit-2026-10-04-independent/evidence/pdf-vendor-source-review.json'), JSON.stringify({ method: 'static source excerpts; no PDF execution', sources, publisher }, null, 2) + '\n');
  console.log(JSON.stringify({ files: sources.length, publisherStatus: publisher.map(x => ({ id: x.id, status: x.status })) }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
