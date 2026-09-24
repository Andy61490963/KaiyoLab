import { useRef, useState } from 'react';
import { Check, CircleHelp, Download, FileArchive, Upload } from 'lucide-react';
import { errorMessage } from './api';
import type { TransferPreview } from '../../lib/portability';
import '../../styles/content-transfer.css';

export default function ContentTransfer() {
  const [file, setFile] = useState<File | null>(null);
  const [applySettings, setApplySettings] = useState(false);
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);

  async function responseError(response: Response) {
    const data = await response.json().catch(() => null);
    throw new Error(
      response.status === 401
        ? 'Your session expired. Sign in in another tab, then retry.'
        : data?.error || 'The transfer failed. Please try again.',
    );
  }
  async function exportContent() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy('export');
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/admin/transfer', { credentials: 'same-origin' });
      if (!response.ok) await responseError(response);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `kaiyolab-${new Date().toISOString().slice(0, 10)}.kaiyo.json.gz`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setSuccess('Archive downloaded. Keep it private: it includes drafts and unpublished images.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy('');
      inFlight.current = false;
    }
  }
  async function transfer(action: 'preview' | 'import') {
    if (!file || inFlight.current) return;
    inFlight.current = true;
    setBusy(action);
    setError('');
    setSuccess('');
    try {
      const query = new URLSearchParams({ action, settings: applySettings ? '1' : '0' });
      if (preview && action === 'import') query.set('review', preview.review);
      const response = await fetch(`/api/admin/transfer?${query}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/gzip' },
        body: file,
      });
      if (!response.ok) {
        if (response.status === 409) setPreview(null);
        await responseError(response);
      }
      const result = (await response.json()) as TransferPreview;
      if (action === 'preview') {
        setPreview(result);
        requestAnimationFrame(() => reviewHeading.current?.focus());
      } else {
        setPreview(null);
        setFile(null);
        if (fileInput.current) fileInput.current.value = '';
        setSuccess(
          `Imported ${result.counts.articles} articles and ${result.counts.projects} projects as private drafts, with ${result.counts.images} images. Review and publish each item when ready.${applySettings ? ' Site settings have been applied.' : ''}`,
        );
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy('');
      inFlight.current = false;
    }
  }

  return (
    <>
      <header className="admin-page-title">
        <div>
          <div className="admin-eyebrow">Workspace</div>
          <h1>Content transfer</h1>
          <p>
            Move your articles, projects, images, and site settings between KaiyoLab installations.
          </p>
        </div>
      </header>
      {error && (
        <div className="admin-alert" role="alert">
          <CircleHelp size={17} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="admin-alert success" role="status">
          <Check size={17} />
          <span>
            {success} <a href="/admin/articles">View articles</a>
          </span>
        </div>
      )}
      <div className="content-transfer">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Export content</h2>
              <p>Download a portable .kaiyo.json.gz archive.</p>
            </div>
            <FileArchive size={20} aria-hidden="true" />
          </div>
          <div className="admin-form-body">
            <p>
              Includes drafts, published snapshots, revision history, categories, tags, site
              content, and the image library. Account credentials and deployment settings are
              excluded.
            </p>
            <p className="transfer-note">
              This archive contains private content. Store it securely. Use a database and volume
              backup for a complete disaster recovery copy.
            </p>
            <button className="admin-button" disabled={!!busy} onClick={exportContent}>
              <Download size={16} />
              {busy === 'export' ? 'Preparing archive…' : 'Download archive'}
            </button>
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Import content</h2>
              <p>Check an archive before adding content to this site.</p>
            </div>
          </div>
          <div className="admin-form-body">
            <label className="transfer-file">
              KaiyoLab archive
              <input
                ref={fileInput}
                type="file"
                accept=".gz,application/gzip"
                disabled={!!busy}
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null);
                  setPreview(null);
                  setError('');
                  setSuccess('');
                }}
              />
            </label>
            <p className="transfer-note">
              Up to 32 MB compressed / 64 MB expanded, 2,000 entries, and 500 images. Images must
              total 30 MB or less.
            </p>
            <label className="transfer-checkbox">
              <input
                type="checkbox"
                checked={applySettings}
                disabled={!!busy}
                onChange={(event) => {
                  setApplySettings(event.target.checked);
                  setPreview(null);
                }}
              />
              <span>
                Also apply site settings and About me content
                <small>
                  This replaces the current public introduction, branding, and social links
                  immediately. Your site URL and owner account stay unchanged.
                </small>
              </span>
            </label>
            <p>
              All imported articles and projects are added as <strong>private drafts</strong>,
              including items from the trash. Published snapshots remain available in revision
              history. Existing content is never overwritten or deleted.
            </p>
            <button
              className="admin-button"
              disabled={!file || !!busy}
              onClick={() => transfer('preview')}
            >
              <FileArchive size={16} />
              {busy === 'preview' ? 'Checking archive…' : 'Check archive'}
            </button>
          </div>
        </section>
        {preview && (
          <section
            className="admin-panel transfer-review"
            aria-labelledby="transfer-review-heading"
          >
            <div className="admin-panel-heading">
              <div>
                <h2 id="transfer-review-heading" tabIndex={-1} ref={reviewHeading}>
                  Review import
                </h2>
                <p>Archive created {new Date(preview.exportedAt).toLocaleString('en-US')}</p>
              </div>
            </div>
            <div className="admin-form-body">
              <dl className="transfer-counts">
                {Object.entries({
                  'Article drafts': preview.counts.articles,
                  'Project drafts': preview.counts.projects,
                  Images: preview.counts.images,
                  'New categories': preview.counts.categories,
                  'New tags': preview.counts.tags,
                  Revisions: preview.counts.revisions,
                }).map(([label, count]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
              {preview.counts.fromTrash > 0 && (
                <p>
                  {preview.counts.fromTrash} items from the archive trash will be restored as
                  private drafts.
                </p>
              )}
              {preview.counts.trimmedDraftRevisions > 0 && (
                <p>
                  {preview.counts.trimmedDraftRevisions} older draft versions will be omitted. Each
                  entry keeps its latest 99 draft versions and a snapshot of the imported draft;
                  published versions are kept.
                </p>
              )}
              {preview.adjustments.length > 0 && (
                <>
                  <h3>Names and URLs</h3>
                  <p>
                    Existing categories and tags with matching names are reused. Conflicting URLs
                    receive an import suffix, including URLs stored in imported version history.
                  </p>
                  <div className="transfer-adjustments">
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>In archive</th>
                          <th>After import</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.adjustments.map((item, index) => (
                          <tr key={index}>
                            <td>{item.type}</td>
                            <td>{item.from}</td>
                            <td>{item.to}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <p>
                {preview.applySettings
                  ? `Site settings and About me will be replaced with “${preview.settings.siteName}” by ${preview.settings.authorName} when you confirm.`
                  : 'Current site settings and About me will be kept.'}
              </p>
              <div className="transfer-actions">
                <button
                  className="admin-button primary"
                  disabled={!!busy}
                  onClick={() => transfer('import')}
                >
                  <Upload size={16} />
                  {busy === 'import' ? 'Importing…' : 'Import as private drafts'}
                </button>
                <button className="admin-button" disabled={!!busy} onClick={() => setPreview(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
