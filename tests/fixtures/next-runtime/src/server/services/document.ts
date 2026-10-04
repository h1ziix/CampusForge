import { fixtureState } from '@/fixture/state';

// Explicit mock: multipart handler is real; S3/DB/queue lifecycle is not invoked.
export async function createDocument(
  _input: unknown,
): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  void _input;
  fixtureState().counters.uploads++;
  return { ok: true as const, documentId: 'r2-synthetic-upload' };
}
