import { Fragment } from 'react';
import { DIFF_PREVIEW_LIMITS, type ContentDiff } from '../../lib/content-diff';
import { useAdminLanguage } from './AdminLanguage';

export default function ContentDifference({ diff }: { diff: ContentDiff }) {
  const { t } = useAdminLanguage();
  const { body } = diff;
  const comparable = body.status === 'complete';
  const lastHunk = body.hunks.at(-1);
  const oldRangeEnd = (hunk: ContentDiff['body']['hunks'][number]) =>
    hunk.oldLines > 0 ? hunk.oldStart + hunk.oldLines - 1 : hunk.oldStart;
  const trailingUnchanged =
    comparable && !body.truncated && lastHunk
      ? Math.max(0, body.oldLineCount - oldRangeEnd(lastHunk))
      : 0;
  const omitted = (lines: number) =>
    lines > 0 && (
      <p className="admin-diff-omitted" data-diff-omitted={lines}>
        <span aria-hidden="true">⋯</span> {t('{lines} unchanged lines omitted', { lines })}
      </p>
    );
  return (
    <div className="admin-content-difference" data-content-diff>
      <p>
        {diff.fields.length
          ? t('Changed fields: {fields}', {
              fields: diff.fields.map((field) => t(field)).join(', '),
            })
          : t('No metadata changes')}
      </p>
      {diff.metadata.length > 0 && (
        <details open>
          <summary>{t('Compare changed fields')}</summary>
          <dl className="admin-metadata-diff">
            {diff.metadata.map((field) => (
              <div key={field.label} data-metadata-field={field.label}>
                <dt>{t(field.label)}</dt>
                <dd className="admin-diff-remove" data-metadata-side="before">
                  <span className="admin-diff-sign" aria-hidden="true">
                    -
                  </span>
                  <span className="sr-only">{t('Previous value')}: </span>
                  <span className="admin-metadata-value" translate="no">
                    {field.label === 'Featured' || field.beforeEmpty
                      ? t(field.before)
                      : field.before}
                  </span>
                </dd>
                <dd className="admin-diff-add" data-metadata-side="after">
                  <span className="admin-diff-sign" aria-hidden="true">
                    +
                  </span>
                  <span className="sr-only">{t('New value')}: </span>
                  <span className="admin-metadata-value" translate="no">
                    {field.label === 'Featured' || field.afterEmpty ? t(field.after) : field.after}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {body.changed ? (
        <details open>
          <summary>
            {t('Body changes')}{' '}
            {comparable && (
              <span className="admin-diff-counts" data-diff-counts>
                {t('{removed} removed / {added} added lines', {
                  removed: body.removedCount ?? '',
                  added: body.addedCount ?? '',
                })}
              </span>
            )}
          </summary>
          {!comparable ? (
            <p className="admin-diff-limit" role="status" data-diff-limit={body.status}>
              {t(
                body.status === 'too-large'
                  ? 'The body is too large to compare here. The full diff and line counts are unavailable. Review both versions before continuing.'
                  : 'The changes are too complex to compare here. The full diff and line counts are unavailable. Review both versions before continuing.',
              )}
            </p>
          ) : (
            <>
              <p className="admin-diff-note">
                {t('Only changed sections and up to 3 surrounding lines are shown')}
              </p>
              {body.truncated && (
                <p className="admin-diff-limit" role="status" data-diff-limit="truncated">
                  {t(
                    'Diff preview is shortened to {lines} lines and {characters} characters per line. Some content is not shown.',
                    {
                      lines: DIFF_PREVIEW_LIMITS.lines,
                      characters: DIFF_PREVIEW_LIMITS.lineLength,
                    },
                  )}
                  {body.totalHunks !== null && body.hunks.length < body.totalHunks && (
                    <>
                      {' '}
                      {t('Showing {shown} of {total} change sections', {
                        shown: body.hunks.length,
                        total: body.totalHunks,
                      })}
                    </>
                  )}
                </p>
              )}
              <div
                className="admin-unified-diff"
                role="region"
                tabIndex={0}
                aria-label={t('Unified body diff')}
                data-body-diff
              >
                {body.hunks.map((hunk, hunkIndex) => {
                  const previous = body.hunks[hunkIndex - 1];
                  const oldBeforeStart = hunk.oldLines > 0 ? hunk.oldStart - 1 : hunk.oldStart;
                  const omittedBefore = Math.max(
                    0,
                    oldBeforeStart - (previous ? oldRangeEnd(previous) : 0),
                  );
                  return (
                    <Fragment key={`${hunk.oldStart}-${hunk.newStart}-${hunkIndex}`}>
                      {omitted(omittedBefore)}
                      <section
                        className="admin-diff-hunk"
                        data-diff-hunk
                        data-old-start={hunk.oldStart}
                        data-new-start={hunk.newStart}
                      >
                        <h3 className="admin-diff-range" data-diff-range>
                          <span className="sr-only">
                            {t('Change section {number}', { number: hunkIndex + 1 })}:{' '}
                          </span>
                          <code>{`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}</code>
                        </h3>
                        <table className="admin-diff-table">
                          <caption className="sr-only">
                            {t('Old and new line numbers with removed, added and unchanged text')}
                          </caption>
                          <colgroup>
                            <col className="admin-diff-number-column" />
                            <col className="admin-diff-number-column" />
                            <col className="admin-diff-sign-column" />
                            <col />
                          </colgroup>
                          <thead>
                            <tr>
                              <th scope="col">{t('Old')}</th>
                              <th scope="col">{t('New')}</th>
                              <th scope="col">
                                <span className="sr-only">{t('Change')}</span>
                              </th>
                              <th scope="col">{t('Text')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hunk.lines.map((line, lineIndex) => {
                              const note = line.kind === 'note';
                              const trailingCR = !note && line.text.endsWith('\r');
                              const label =
                                line.kind === 'remove'
                                  ? 'Removed line'
                                  : line.kind === 'add'
                                    ? 'Added line'
                                    : note
                                      ? 'Diff note'
                                      : 'Unchanged line';
                              return (
                                <tr
                                  key={lineIndex}
                                  className={`admin-diff-${line.kind}`}
                                  data-diff-kind={line.kind}
                                  data-old-line={line.oldNumber ?? undefined}
                                  data-new-line={line.newNumber ?? undefined}
                                >
                                  <td className="admin-diff-line-number">{line.oldNumber}</td>
                                  <td className="admin-diff-line-number">{line.newNumber}</td>
                                  <td
                                    className="admin-diff-sign"
                                    aria-label={t(label)}
                                    data-diff-marker
                                  >
                                    {line.kind === 'remove'
                                      ? '-'
                                      : line.kind === 'add'
                                        ? '+'
                                        : note
                                          ? '\\'
                                          : ' '}
                                  </td>
                                  <td className="admin-diff-line-text">
                                    <pre translate={note ? undefined : 'no'}>
                                      <span data-diff-text>
                                        {note
                                          ? t(line.text)
                                          : trailingCR
                                            ? line.text.slice(0, -1)
                                            : line.text}
                                      </span>
                                      {trailingCR && (
                                        <abbr
                                          className="admin-diff-cr"
                                          title={t('Carriage return (CR)')}
                                          aria-label={t('Carriage return (CR)')}
                                          data-diff-cr
                                        >
                                          CR
                                        </abbr>
                                      )}
                                    </pre>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </section>
                    </Fragment>
                  );
                })}
                {omitted(trailingUnchanged)}
              </div>
            </>
          )}
        </details>
      ) : (
        <p data-diff-unchanged>{t('Body unchanged')}</p>
      )}
    </div>
  );
}
