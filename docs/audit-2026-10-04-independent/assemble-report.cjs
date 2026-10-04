const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/\r\n/g, '\n');
const baseline = JSON.parse(read('evidence/clean-snapshot.json'));
const sources = baseline.inventory.map(x => x.path);
function sourceLinks(input) {
  return input.replace(/`([^`\n]+?):(\d+)([\d,\-]*)`/g, (whole, file, line, range) => {
    let found = sources.filter(p => p === file);
    if (!found.length) found = sources.filter(p => p.endsWith('/' + file));
    if (found.length !== 1) return whole;
    const absolute = path.join(root, found[0]).replace(/\\/g, '/');
    return `[${found[0]}:${line}${range}](<${absolute}:${line}>)`;
  });
}
function confirmed(name) {
  const src = read(name);
  const marker = '## Подтверждённые findings\n';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('Missing finding section in ' + name);
  const end = src.indexOf('\n## ', start + marker.length);
  return src.slice(start + marker.length, end < 0 ? undefined : end).trim().replace(/^### /gm, '#### ');
}
const rootReport = read('root-findings.md').replace(/^# [^\n]+\n+/, '');
const split = rootReport.indexOf('## Отличие дефекта приложения');
if (split < 0) throw new Error('Missing root qualifiers');
const rootFindings = rootReport.slice(0, split).trim().replace(/^## /gm, '#### ');
const qualifiers = rootReport.slice(split).trim().replace(/^## /gm, '#### ');
const appendix = read('dependency-triage.md').replace(/^# [^\n]+\n+/, '').replace(/^## /gm, '### ');
let report = [
  read('report-preface.md').trim(),
  '### 4.1. Архитектура, сборка и deployment', rootFindings,
  '### 4.2. Безопасность и приватность', confirmed('agent-security.md'),
  '### 4.3. Документы, очереди, сохранность данных и AI', confirmed('agent-pipeline.md'),
  '### 4.4. Интерфейс и пользовательские сценарии', confirmed('agent-frontend.md'),
  '### 4.5. Существенные уточнения и границы deployment проверки', qualifiers,
  read('report-closing.md').trim(),
  '## 7. Приложение: актуальные первоисточники advisories и фактическая достижимость', appendix.trim(),
].join('\n\n') + '\n';
report = sourceLinks(report);
report = report.replace(/`((?:evidence\/|probes\/|screenshots\/)?[\w.-]+\.(?:md|json|log|txt|cjs|js|ps1|png))`/g, (whole, file) => {
  const absolute = path.join(__dirname, file);
  if (!fs.existsSync(absolute)) return whole;
  return `[${file}](<${absolute.replace(/\\/g, '/')}>)`;
});
const output = path.join(root, 'docs/AUDIT-INDEPENDENT-2026-10-04.md');
fs.writeFileSync(output, report, 'utf8');
const findings = [...report.matchAll(/^#### ((?:RD|SEC|PF|FE)-\d+) — (P\d): (.+)$/gm)].map(m => ({ id:m[1], priority:m[2], title:m[3] }));
const duplicates = findings.filter((x, i) => findings.findIndex(y => y.id === x.id) !== i);
const invariants = baseline.inventory.map(item => ({path:item.path, unchanged:crypto.createHash('sha256').update(fs.readFileSync(path.join(root, item.path))).digest('hex') === item.sha256}));
const badLinks = [...report.matchAll(/\]\(<(C:\/[^>]+):(\d+)>\)/g)].map(m => ({file:m[1], line:Number(m[2])})).filter(x => !fs.existsSync(x.file) || x.line > fs.readFileSync(x.file,'utf8').split(/\r?\n/).length);
const result = { output, reportBytes:fs.statSync(output).size, findings:findings.length, priorities:findings.reduce((a,x) => ({...a,[x.priority]:(a[x.priority]||0)+1}),{}), duplicateIds:duplicates, sourceFiles:invariants.length, sourceChanged:invariants.filter(x=>!x.unchanged), invalidSourceLinks:badLinks, screenshots:fs.readdirSync(path.join(__dirname,'screenshots')).filter(x=>/\.png$/i.test(x)).length };
fs.writeFileSync(path.join(__dirname,'evidence/report-validation.json'), JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if (duplicates.length || result.sourceChanged.length || badLinks.length || findings.length !== 29) process.exitCode=1;
