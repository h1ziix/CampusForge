/** Prisma omits undefined filters. Reject malformed queue identities before queries. */
export function assertDocumentGenerationPayload(
  input: unknown,
): asserts input is { documentId: string; workspaceId: string; userId: string } {
  if (!input || typeof input !== 'object') throw new Error('Invalid document job payload');
  const fields = input as Record<string, unknown>;
  for (const name of ['documentId', 'workspaceId', 'userId']) {
    const value = fields[name];
    if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
      throw new Error('Invalid document job identity');
    }
  }
}
