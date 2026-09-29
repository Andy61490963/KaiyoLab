import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, PageTitle } from './AdminApp';
import { api, errorMessage } from './api';
import type { OperationRecord, SystemReport } from '../../lib/operations';
import { useAdminLanguage } from './AdminLanguage';

function operation(record: OperationRecord, language: 'zh-TW' | 'en', t: (key: string) => string) {
  if (record.completedAt) return new Date(record.completedAt).toLocaleString(language);
  return t(operationStatus(record));
}

function operationStatus(record: OperationRecord) {
  return {
    unconfigured: 'Not configured',
    missing: 'Not recorded',
    invalid: 'Record unavailable',
    recorded: 'Not recorded',
  }[record.status];
}

export default function SystemStatus() {
  const { t, language } = useAdminLanguage();
  const [report, setReport] = useState<SystemReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      setReport(await api<SystemReport>('/api/admin/system'));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <>
      <PageTitle
        label={t('Maintenance')}
        title={t('System status')}
        description={t('Check this instance and the configured maintenance records')}
      >
        <button className="admin-button secondary" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw size={16} />
          {t(busy ? 'Checking…' : 'Refresh status')}
        </button>
      </PageTitle>
      <Alert message={t(error)} />
      <div aria-live="polite" aria-busy={busy}>
        {report ? (
          <>
            <section className="admin-panel admin-system-panel">
              <h2>{t('Application')}</h2>
              <dl className="admin-system-list">
                <div>
                  <dt>{t('Deployed revision')}</dt>
                  <dd>
                    <code>{report.revision}</code>
                  </dd>
                </div>
                <div>
                  <dt>Node.js</dt>
                  <dd>{report.runtime}</dd>
                </div>
                <div>
                  <dt>{t('Database')}</dt>
                  <dd>
                    {report.database.available
                      ? t('Connected · {latency} ms', { latency: report.database.latencyMs })
                      : t('Connection failed')}
                  </dd>
                </div>
                <div>
                  <dt>{t('Image storage')}</dt>
                  <dd>{t(report.storage.writable ? 'Writable' : 'Write check failed')}</dd>
                </div>
                <div>
                  <dt>{t('Registered images')}</dt>
                  <dd>
                    {report.storage.images === null
                      ? t('Unavailable')
                      : t('{count} items · {size} MB', {
                          count: report.storage.images,
                          size: ((report.storage.bytes || 0) / 1024 / 1024).toFixed(1),
                        })}
                  </dd>
                </div>
                <div>
                  <dt>{t('Checked')}</dt>
                  <dd>{new Date(report.checkedAt).toLocaleString(language)}</dd>
                </div>
              </dl>
            </section>
            <section className="admin-panel admin-system-panel">
              <h2>{t('Maintenance records')}</h2>
              <dl className="admin-system-list">
                <div>
                  <dt>{t('Local backup status')}</dt>
                  <dd
                    role={
                      report.backup.health === 'failed' || report.backup.health === 'overdue'
                        ? 'status'
                        : undefined
                    }
                  >
                    {t(
                      {
                        ok: 'Up to date',
                        overdue: 'Overdue',
                        failed: 'Last attempt failed',
                        unknown: 'Not verified',
                      }[report.backup.health || 'unknown'],
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t('Last completed backup')}</dt>
                  <dd>{operation(report.backup, language, t)}</dd>
                </div>
                {report.backup.dueAt && (
                  <div>
                    <dt>{t('Backup overdue after')}</dt>
                    <dd>{new Date(report.backup.dueAt).toLocaleString(language)}</dd>
                  </div>
                )}
                {report.backup.lastFailureAt && (
                  <div>
                    <dt>{t('Last failed attempt')}</dt>
                    <dd>{new Date(report.backup.lastFailureAt).toLocaleString(language)}</dd>
                  </div>
                )}
                <div>
                  <dt>{t('Last verified restore')}</dt>
                  <dd>{operation(report.restore, language, t)}</dd>
                </div>
              </dl>
              <p className="admin-help">
                {t(
                  'Records come from the backup and restore verification scripts. No record means the operation has not been recorded in the configured directory. Image totals come from the database and do not verify individual files.',
                )}
              </p>
              <p className="admin-help">
                {t(
                  'External uptime checks run separately in GitHub Actions. See the repository maintenance guide for backup, recovery and notification settings.',
                )}
              </p>
            </section>
          </>
        ) : (
          !error && <p className="admin-help">{t('Checking system status…')}</p>
        )}
      </div>
    </>
  );
}
