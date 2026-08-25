import { DocumentProcessingStatus, Prisma } from '../database/prisma-client';

export type ProcessingHistoryEntry = {
  status: DocumentProcessingStatus;
  at: string;
};

export function appendProcessingHistory(
  current: Prisma.JsonValue | null | undefined,
  status: DocumentProcessingStatus,
  at = new Date(),
): ProcessingHistoryEntry[] {
  const prev = Array.isArray(current)
    ? (current as ProcessingHistoryEntry[])
    : [];
  return [...prev, { status, at: at.toISOString() }];
}
