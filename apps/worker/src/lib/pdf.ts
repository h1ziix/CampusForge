/** Text-only PDF extraction. Runtime assets stay in the installed package. */
export async function extractPdfText(buffer: Buffer, signal?: AbortSignal): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  let destruction: Promise<void> | undefined;
  const destroy = () => (destruction ??= parser.destroy());
  const abort = () => {
    void destroy().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });

  try {
    signal?.throwIfAborted();
    const result = await parser.getText({ pageJoiner: '' });
    signal?.throwIfAborted();
    return result.text;
  } finally {
    signal?.removeEventListener('abort', abort);
    await destroy();
  }
}
