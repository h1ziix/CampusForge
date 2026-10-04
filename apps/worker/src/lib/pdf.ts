/** Text-only PDF extraction. Runtime assets stay in the installed package. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  });

  try {
    const result = await parser.getText({ pageJoiner: '' });
    return result.text;
  } finally {
    await parser.destroy();
  }
}
