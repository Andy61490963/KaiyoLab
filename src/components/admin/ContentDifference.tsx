import type { ContentDiff } from '../../lib/content-diff';
import { useAdminLanguage } from './AdminLanguage';

export default function ContentDifference({ diff }: { diff: ContentDiff }) {
  const { t } = useAdminLanguage();
  const changed = diff.body.removedCount > 0 || diff.body.addedCount > 0;
  return (
    <div className="admin-content-difference">
      <p>
        {diff.fields.length
          ? t('Changed fields: {fields}', {
              fields: diff.fields.map((field) => t(field)).join(', '),
            })
          : t('No metadata changes')}
      </p>
      {diff.metadata.length > 0 && (
        <details>
          <summary>{t('Compare changed fields')}</summary>
          <dl className="admin-metadata-diff">
            {diff.metadata.map((field) => (
              <div key={field.label}>
                <dt>{t(field.label)}</dt>
                <dd>
                  <span>{t('Previous value')}</span>
                  {field.label === 'Featured' ? t(field.before) : field.before}
                </dd>
                <dd>
                  <span>{t('New value')}</span>
                  {field.label === 'Featured' ? t(field.after) : field.after}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {changed ? (
        <details open>
          <summary>
            {t('Body changes')}{' '}
            <span>
              {t('{previous} previous / {next} new lines in changed section', {
                previous: diff.body.removedCount,
                next: diff.body.addedCount,
              })}
            </span>
          </summary>
          <div className="admin-diff-columns">
            <section aria-label={t('Previous text')}>
              <h3>{t('Previous text')}</h3>
              <pre>{diff.body.removed.join('\n') || t('(empty)')}</pre>
            </section>
            <section aria-label={t('New text')}>
              <h3>{t('New text')}</h3>
              <pre>{diff.body.added.join('\n') || t('(empty)')}</pre>
            </section>
          </div>
          {diff.body.truncated && (
            <p className="admin-diff-note">
              {t(
                'Preview limited to the first 100 lines and 1,000 characters per line in each changed section',
              )}
            </p>
          )}
        </details>
      ) : (
        <p>{t('Body unchanged')}</p>
      )}
    </div>
  );
}
