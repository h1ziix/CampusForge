// Fetch public advisory metadata, never load credentials or modify dependencies.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const dir = path.join(root, 'docs/audit-2026-10-04-independent/evidence');
async function main() {
  const audit = JSON.parse(fs.readFileSync(path.join(dir, 'dependency-audit.json'), 'utf8'));
  const ids = [...new Set(Object.values(audit.advisories).map(a => a.url.split('/').pop()))];
  const apiPath = path.join(dir, 'dependency-primary.json');
  let result = fs.existsSync(apiPath) ? JSON.parse(fs.readFileSync(apiPath, 'utf8')) : [];
  if (process.argv.includes('--refresh-api') || !result.length) {
    const previous = new Map(result.map(row => [row.id, row]));
    const next = [];
    for (let i = 0; i < ids.length; i += 6) {
      const chunk = await Promise.all(ids.slice(i, i + 6).map(async id => {
        const response = await fetch(`https://api.github.com/advisories/${id}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'CampusForge-independent-readonly-audit' } });
        const data = await response.json();
        // Never replace a successful primary record with a retry/rate-limit failure.
        if (response.status !== 200 && previous.get(id)?.status === 200) return { ...previous.get(id), lastRetryStatus: response.status };
        return { id, fetchedAt: new Date().toISOString(), status: response.status, data };
      }));
      next.push(...chunk);
    }
    result = next;
    fs.writeFileSync(apiPath, JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify({ advisories: result.length, statuses: result.reduce((acc, row) => (acc[row.status] = (acc[row.status] || 0) + 1, acc), {}) }));

  const missingPublisher = {
    'GHSA-28wg-ghj8-5hjv': 'https://github.com/ai/nanoid/commit/e835c9b71eab832bc6106944bdd26ea96cf2c66d',
    'GHSA-2v37-7h3g-55p8': 'https://github.com/ai/nanoid/commit/e10f8d40ce9d1ab47f66d65a16b48086432730d0',
    'GHSA-w9m9-85wc-3x92': 'https://github.com/postcss/postcss-selector-parser/commit/5bc698cef66f8abd12610dc623e5d67cbc0f869d',
    'GHSA-w5vr-8v7q-w6rv': 'https://github.com/web-platform-dx/baseline-browser-mapping/commit/de733e2d8959559f7bb255d5927f3afcb6f31589',
    'GHSA-vfj7-8cjw-p6xm': 'https://github.com/micromatch/braces/issues/70',
  };
  const upstream = [];
  for (let i = 0; i < result.length; i += 6) {
    upstream.push(...await Promise.all(result.slice(i, i + 6).map(async row => {
      const registry = Object.values(audit.advisories).find(a => a.url.endsWith(row.id));
      const references = row.data.references || (registry.references.match(/https:\/\/[^\s]+/g) || []);
      const url = references.find(url => url.includes('/security/advisories/') && url.endsWith(row.id)) || missingPublisher[row.id];
      if (!url) return { id: row.id, status: 'no publisher reference' };
      const response = await fetch(url, { headers: { 'user-agent': 'CampusForge-independent-readonly-audit' } });
      const html = await response.text();
      const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const patchedVersions = [...new Set(Object.values(audit.advisories).filter(a => a.url.endsWith(row.id)).map(a => a.patched_versions))];
      return { id: row.id, url, status: response.status, fetchedAt: new Date().toISOString(), title, contentSHA256: crypto.createHash('sha256').update(html).digest('hex'), containsGHSA: html.includes(row.id), patchedVersionMentions: patchedVersions.map(range => ({ range, versionMentioned: text.includes(range.match(/[0-9]+\.[0-9]+\.[0-9]+(?:-beta\.[0-9]+)?/)?.[0] || 'NO_PATCH') })), sourceType: missingPublisher[row.id] ? 'publisher commit/issue' : 'publisher security advisory' };
    })));
  }
  fs.writeFileSync(path.join(dir, 'dependency-publisher-fetch.json'), JSON.stringify(upstream, null, 2) + '\n');
  console.log(JSON.stringify({ publisherSources: upstream.length, statuses: upstream.reduce((acc, row) => (acc[row.status] = (acc[row.status] || 0) + 1, acc), {}) }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
