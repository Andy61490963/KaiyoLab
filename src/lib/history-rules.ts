export const DRAFT_CHECKPOINT_MS = 5 * 60 * 1000;
export const DRAFT_REVISION_LIMIT = 100;
export const HISTORY_PAGE_SIZE = 20;

export function checkpointDue(previous: Date | null, now: Date) {
  return !previous || now.getTime() - previous.getTime() >= DRAFT_CHECKPOINT_MS;
}
