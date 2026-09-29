import * as Dialog from '@radix-ui/react-dialog';
import { useAdminLanguage } from './AdminLanguage';
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
  const { t } = useAdminLanguage();
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
              <Dialog.Title>{t('Review before publishing')}</Dialog.Title>
              <Dialog.Description>
                {t('Review saved draft v{version} against the public version', {
                  version: review?.version ?? '',
                })}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="admin-icon-button"
              disabled={busy}
              aria-label={t('Close publish review')}
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          <div className="admin-review-body">
            {error && (
              <div className="admin-alert" role="alert">
                {t(error)}
              </div>
            )}
            {review && (
              <>
                {review.warnings.length > 0 ? (
                  <section
                    className="admin-review-warnings"
                    aria-label={t('Publication suggestions')}
                  >
                    <h3>{t('Suggestions')}</h3>
                    <ul>
                      {review.warnings.map((warning, index) => (
                        <li key={`${warning.code}-${index}`}>{t(warning.message)}</li>
                      ))}
                    </ul>
                    <p>{t('These suggestions do not block publishing')}</p>
                  </section>
                ) : (
                  <p className="admin-review-ready">
                    {t(
                      'No issues found with the summary, image alt text, internal links, section anchors or Mermaid diagrams',
                    )}
                  </p>
                )}
                <ContentDifference diff={review.diff} />
              </>
            )}
          </div>
          <div className="admin-review-actions">
            <Dialog.Close className="admin-button" disabled={busy}>
              {t('Keep editing')}
            </Dialog.Close>
            <button className="admin-button primary" disabled={busy || !review} onClick={onPublish}>
              {t(busy ? 'Publishing…' : 'Confirm publication')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
