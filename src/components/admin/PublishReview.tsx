import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ContentReview } from '../../lib/content-review';
import ContentDifference from './ContentDifference';

export default function PublishReview({
  review,
  busy,
  error,
  onClose,
  onPublish,
  returnFocus,
}: {
  review: ContentReview | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onPublish: () => void;
  returnFocus: () => void;
}) {
  return (
    <Dialog.Root
      open={!!review}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="admin-dialog-overlay" />
        <Dialog.Content
          className="admin-dialog admin-app admin-review-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <div className="admin-dialog-heading">
            <div>
              <Dialog.Title>Review before publishing</Dialog.Title>
              <Dialog.Description>
                Review saved draft v{review?.version} against the public version
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="admin-icon-button"
              disabled={busy}
              aria-label="Close publish review"
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="admin-review-body">
            {error && (
              <div className="admin-alert" role="alert">
                {error}
              </div>
            )}
            {review && (
              <>
                {review.warnings.length > 0 ? (
                  <section className="admin-review-warnings" aria-label="Publication suggestions">
                    <h3>Suggestions</h3>
                    <ul>
                      {review.warnings.map((warning, index) => (
                        <li key={`${warning.code}-${index}`}>{warning.message}</li>
                      ))}
                    </ul>
                    <p>These suggestions do not block publishing</p>
                  </section>
                ) : (
                  <p className="admin-review-ready">
                    No missing summaries, image descriptions, or broken content links found
                  </p>
                )}
                <ContentDifference diff={review.diff} />
              </>
            )}
          </div>
          <div className="admin-review-actions">
            <Dialog.Close className="admin-button" disabled={busy}>
              Keep editing
            </Dialog.Close>
            <button className="admin-button primary" disabled={busy || !review} onClick={onPublish}>
              {busy ? 'Publishing…' : 'Confirm publication'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
