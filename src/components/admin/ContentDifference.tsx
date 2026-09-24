import type { ContentDiff } from '../../lib/content-diff';

export default function ContentDifference({ diff }: { diff: ContentDiff }) {
  const changed = diff.body.removedCount > 0 || diff.body.addedCount > 0;
  return (
    <div className="admin-content-difference">
      <p>
        {diff.fields.length ? `Changed fields: ${diff.fields.join(', ')}` : 'No metadata changes'}
      </p>
      {diff.metadata.length > 0 && (
        <details>
          <summary>Compare changed fields</summary>
          <dl className="admin-metadata-diff">
            {diff.metadata.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>
                  <span>Previous</span>
                  {field.before}
                </dd>
                <dd>
                  <span>New</span>
                  {field.after}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {changed ? (
        <details open>
          <summary>
            Body changes{' '}
            <span>
              {diff.body.removedCount} previous / {diff.body.addedCount} new lines in changed
              section
            </span>
          </summary>
          <div className="admin-diff-columns">
            <section aria-label="Previous text">
              <h3>Previous text</h3>
              <pre>{diff.body.removed.join('\n') || '(empty)'}</pre>
            </section>
            <section aria-label="New text">
              <h3>New text</h3>
              <pre>{diff.body.added.join('\n') || '(empty)'}</pre>
            </section>
          </div>
          {diff.body.truncated && (
            <p className="admin-diff-note">
              Preview limited to the first 100 lines and 1,000 characters per line in each changed
              section
            </p>
          )}
        </details>
      ) : (
        <p>Body unchanged</p>
      )}
    </div>
  );
}
