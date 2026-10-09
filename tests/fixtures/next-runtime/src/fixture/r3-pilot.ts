import { generationSnapshot, generationState, resetGeneration } from './document-generation';

export const pilotWorkspace = 'r3-pilot-workspace';
const holder = globalThis as typeof globalThis & { __r3PilotFilename?: string };
export function resetPilot(mode: Parameters<typeof resetGeneration>[0] = 'pending') {
  delete holder.__r3PilotFilename;
  resetGeneration(mode);
}
export function savePilotUpload(filename: string) {
  holder.__r3PilotFilename = filename;
  generationState().parseStatuses.set('botany', 'PENDING');
}
export function pilotSnapshot() {
  const snapshot = generationSnapshot('botany');
  return {
    ...snapshot,
    document: {
      ...snapshot.document,
      filename: holder.__r3PilotFilename ?? 'Synthetic course notes.txt',
    },
  };
}
export function pilotDocuments() {
  return holder.__r3PilotFilename ? [pilotSnapshot().document] : [];
}
