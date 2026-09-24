import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, PageTitle } from './AdminApp';
import { api, errorMessage } from './api';
import type { OperationRecord, SystemReport } from '../../lib/operations';

function operation(record: OperationRecord) {
  if (record.completedAt) return new Date(record.completedAt).toLocaleString();
  return {
    unconfigured: 'Not configured',
    missing: 'Not recorded',
    invalid: 'Record unavailable',
    recorded: 'Not recorded',
  }[record.status];
}

export default function SystemStatus() {
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
        label="Maintenance"
        title="System status"
        description="Check this instance and the configured maintenance records"
      >
        <button className="admin-button secondary" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw size={16} />
          {busy ? 'Checking…' : 'Refresh status'}
        </button>
      </PageTitle>
      <Alert message={error} />
      <div aria-live="polite" aria-busy={busy}>
        {report ? (
          <>
            <section className="admin-panel admin-system-panel">
              <h2>Application</h2>
              <dl className="admin-system-list">
                <div>
                  <dt>Deployed revision</dt>
                  <dd>
                    <code>{report.revision}</code>
                  </dd>
                </div>
                <div>
                  <dt>Node.js</dt>
                  <dd>{report.runtime}</dd>
                </div>
                <div>
                  <dt>Database</dt>
                  <dd>
                    {report.database.available
                      ? `Connected · ${report.database.latencyMs} ms`
                      : 'Connection failed'}
                  </dd>
                </div>
                <div>
                  <dt>Image storage</dt>
                  <dd>{report.storage.writable ? 'Writable' : 'Write check failed'}</dd>
                </div>
                <div>
                  <dt>Registered images</dt>
                  <dd>
                    {report.storage.images === null
                      ? 'Unavailable'
                      : `${report.storage.images} items · ${((report.storage.bytes || 0) / 1024 / 1024).toFixed(1)} MB`}
                  </dd>
                </div>
                <div>
                  <dt>Checked</dt>
                  <dd>{new Date(report.checkedAt).toLocaleString()}</dd>
                </div>
              </dl>
            </section>
            <section className="admin-panel admin-system-panel">
              <h2>Maintenance records</h2>
              <dl className="admin-system-list">
                <div>
                  <dt>Last completed backup</dt>
                  <dd>{operation(report.backup)}</dd>
                </div>
                <div>
                  <dt>Last verified restore</dt>
                  <dd>{operation(report.restore)}</dd>
                </div>
              </dl>
              <p className="admin-help">
                Records come from the backup and restore verification scripts. No record means the
                operation has not been recorded in the configured directory. Image totals come from
                the database and do not verify individual files.
              </p>
              <p className="admin-help">
                External uptime checks run separately in GitHub Actions. See the repository
                maintenance guide for backup, recovery and notification settings.
              </p>
            </section>
          </>
        ) : (
          !error && <p className="admin-help">Checking system status…</p>
        )}
      </div>
    </>
  );
}
