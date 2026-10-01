import type { EntryContent } from './types';

export const bodyClearConfirmationMessage =
  'The draft body was cleared. Use Save draft and confirm before saving an empty body.';

export function needsBodyClearConfirmation(previousBody: string, nextBody: string): boolean {
  return previousBody.trim().length > 0 && nextBody.trim().length === 0;
}

/** Return a body-only recovery; never replace newer draft metadata or a non-empty body. */
export function recoverPublishedBody(
  draft: EntryContent,
  published: EntryContent | null,
): EntryContent | null {
  if (draft.body.trim() || !published?.body.trim()) return null;
  return { ...draft, body: published.body };
}
