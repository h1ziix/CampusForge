import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPdfText } from '../src/lib/pdf';

function syntheticPdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 36 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 150] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('maintained PDF parser loads its worker/font assets and extracts synthetic text', async () => {
  assert.match(
    await extractPdfText(syntheticPdf('R1 production parser regression')),
    /R1 production parser regression/,
  );
});

test('malformed PDF rejects and parser remains usable on the next document', async () => {
  await assert.rejects(() => extractPdfText(Buffer.from('not a PDF')));
  assert.match(await extractPdfText(syntheticPdf('R1 parser recovers')), /R1 parser recovers/);
});

test('cancelled PDF extraction destroys its runtime and later extraction remains usable', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => extractPdfText(syntheticPdf('Cancelled'), controller.signal));
  assert.match(
    await extractPdfText(syntheticPdf('R3 after cancellation')),
    /R3 after cancellation/,
  );
});
