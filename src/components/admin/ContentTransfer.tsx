import { useRef, useState } from 'react';
import { Check, CircleHelp, Download, FileArchive, Upload } from 'lucide-react';
import { errorMessage } from './api';
import type { TransferPreview } from '../../lib/portability';
import '../../styles/content-transfer.css';
import { useAdminLanguage } from './AdminLanguage';

interface TransferSuccess {
  key: string;
  values?: Record<string, number>;
  settingsApplied?: boolean;
}

export default function ContentTransfer() {
  const { t, language } = useAdminLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [applySettings, setApplySettings] = useState(false);
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<TransferSuccess | null>(null);
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
    setSuccess(null);
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
      setSuccess({
        key: 'Archive downloaded. Keep it private: it includes drafts and unpublished images.',
      });
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
    setSuccess(null);
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
        setSuccess({
          key: 'Imported {articles} articles and {projects} projects as private drafts, with {images} images. Review and publish each item when ready.',
          values: {
            articles: result.counts.articles,
            projects: result.counts.projects,
            images: result.counts.images,
          },
          settingsApplied: applySettings,
        });
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
          <h1>{t('Content transfer')}</h1>
          <p>
            {t(
              'Move your articles, projects, images, and site settings between KaiyoLab installations.',
            )}
          </p>
        </div>
      </header>
      {error && (
        <div className="admin-alert" role="alert">
          <CircleHelp size={17} />
          <span>{t(error)}</span>
        </div>
      )}
      {success && (
        <div className="admin-alert success" role="status">
          <Check size={17} />
          <span>
            {t(success.key, success.values)}{' '}
            {success.settingsApplied && <>{t('Site settings have been applied.')} </>}
            <a href="/admin/articles">{t('View articles')}</a>
          </span>
        </div>
      )}
      <div className="content-transfer">
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>{t('Export content')}</h2>
              <p>{t('Download a portable .kaiyo.json.gz archive.')}</p>
            </div>
            <FileArchive size={20} aria-hidden="true" />
          </div>
          <div className="admin-form-body">
            <p>
              {t(
                'Includes drafts, published snapshots, revision history, categories, tags, site content, and the image library. Account credentials and deployment settings are excluded.',
              )}
            </p>
            <p className="transfer-note">
              {t(
                'This archive contains private content. Store it securely. Use a database and volume backup for a complete disaster recovery copy.',
              )}
            </p>
            <button className="admin-button" disabled={!!busy} onClick={exportContent}>
              <Download size={16} />
              {t(busy === 'export' ? 'Preparing archive…' : 'Download archive')}
            </button>
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>{t('Import content')}</h2>
              <p>{t('Check an archive before adding content to this site.')}</p>
            </div>
          </div>
          <div className="admin-form-body">
            <label className="transfer-file">
              {t('KaiyoLab archive')}
              <input
                ref={fileInput}
                type="file"
                accept=".gz,application/gzip"
                disabled={!!busy}
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null);
                  setPreview(null);
                  setError('');
                  setSuccess(null);
                }}
              />
            </label>
            <p className="transfer-note">
              {t(
                'Up to 32 MB compressed / 64 MB expanded, 2,000 entries, and 500 images. Images must total 30 MB or less.',
              )}
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
                {t('Also apply site settings and About me content')}
                <small>
                  {t(
                    'This replaces the current public introduction, branding, and social links immediately. Your site URL and owner account stay unchanged.',
                  )}
                </small>
              </span>
            </label>
            <p>
              {t('All imported articles and projects are added as')}{' '}
              <strong>{t('private drafts')}</strong>
              {t(
                ', including items from the trash. Published snapshots remain available in revision history. Existing content is never overwritten or deleted.',
              )}
            </p>
            <button
              className="admin-button"
              disabled={!file || !!busy}
              onClick={() => transfer('preview')}
            >
              <FileArchive size={16} />
              {t(busy === 'preview' ? 'Checking archive…' : 'Check archive')}
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
                  {t('Review import')}
                </h2>
                <p>
                  {t('Archive created {date}', {
                    date: new Date(preview.exportedAt).toLocaleString(language),
                  })}
                </p>
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
                  'Rewritten internal links': preview.counts.rewrittenLinks,
                }).map(([label, count]) => (
                  <div key={label}>
                    <dt>{t(label)}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
              {preview.counts.fromTrash > 0 && (
                <p>
                  {t('{count} items from the archive trash will be restored as private drafts.', {
                    count: preview.counts.fromTrash,
                  })}
                </p>
              )}
              {preview.counts.trimmedDraftRevisions > 0 && (
                <p>
                  {t(
                    '{count} older draft versions will be omitted. Each entry keeps its latest 99 draft versions and a snapshot of the imported draft; published versions are kept.',
                    { count: preview.counts.trimmedDraftRevisions },
                  )}
                </p>
              )}
              {preview.adjustments.length > 0 && (
                <>
                  <h3>{t('Names and URLs')}</h3>
                  <p>
                    {t(
                      'Existing categories and tags with matching names are reused. Conflicting URLs receive an import suffix, including URLs stored in imported version history.',
                    )}
                  </p>
                  <div className="transfer-adjustments">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('Type')}</th>
                          <th>{t('In archive')}</th>
                          <th>{t('After import')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.adjustments.map((item, index) => (
                          <tr key={index}>
                            <td>{t(item.type)}</td>
                            <td>{item.from}</td>
                            <td>
                              {item.to === 'Reuse existing name'
                                ? t('Reuse existing name')
                                : item.to}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {preview.linkChanges.length > 0 && (
                <>
                  <h3>{t('Internal link changes')}</h3>
                  <p>
                    {t(
                      'These links will point to the imported articles or projects, preserving query parameters and section anchors instead of linking to existing content with the same URL.',
                    )}
                  </p>
                  <div className="transfer-adjustments">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('Location')}</th>
                          <th>{t('Archive link')}</th>
                          <th>{t('Imported link')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.linkChanges.map((change, index) => (
                          <tr key={index}>
                            <td>{t(change.location)}</td>
                            <td>{change.from}</td>
                            <td>{change.to}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.omittedLinkChanges > 0 && (
                    <p>
                      {t('{count} additional link changes are not listed.', {
                        count: preview.omittedLinkChanges,
                      })}
                    </p>
                  )}
                </>
              )}
              <p>
                {preview.applySettings
                  ? t(
                      'Site settings and About me will be replaced with “{siteName}” by {authorName} when you confirm.',
                      {
                        siteName: preview.settings.siteName,
                        authorName: preview.settings.authorName,
                      },
                    )
                  : t('Current site settings and About me will be kept.')}
              </p>
              <div className="transfer-actions">
                <button
                  className="admin-button primary"
                  disabled={!!busy}
                  onClick={() => transfer('import')}
                >
                  <Upload size={16} />
                  {t(busy === 'import' ? 'Importing…' : 'Import as private drafts')}
                </button>
                <button className="admin-button" disabled={!!busy} onClick={() => setPreview(null)}>
                  {t('Cancel')}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
