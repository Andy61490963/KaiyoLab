import { useEffect, useRef, useState } from 'react';
import { useLabEnvironment } from './useLabEnvironment';

export default function ToolExport({
  code,
  filename,
  mime = 'text/plain;charset=utf-8',
  label,
}: {
  code: string;
  filename: string;
  mime?: string;
  label: { zh: string; en: string };
}) {
  const { t } = useLabEnvironment();
  const [status, setStatus] = useState<'idle' | 'copied' | 'downloaded' | 'failed'>('idle');
  const alive = useRef(true);
  const revision = useRef(0);
  const urls = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      urls.current.forEach((timer, url) => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      });
      urls.current.clear();
    };
  }, []);
  useEffect(() => {
    revision.current++;
    setStatus('idle');
  }, [code]);
  return (
    <section className="lab-export" aria-label={t(label.zh, label.en)}>
      <div className="lab-controls">
        <h3>{t(label.zh, label.en)}</h3>
        <button
          className="lab-button"
          onClick={async () => {
            const request = ++revision.current;
            try {
              await navigator.clipboard.writeText(code);
              if (alive.current && request === revision.current) setStatus('copied');
            } catch {
              if (alive.current && request === revision.current) setStatus('failed');
            }
          }}
        >
          {t('複製原始碼', 'Copy code')}
        </button>
        <button
          className="lab-button"
          onClick={() => {
            try {
              const url = URL.createObjectURL(new Blob([code], { type: mime }));
              const link = document.createElement('a');
              link.href = url;
              link.download = filename;
              link.click();
              urls.current.set(
                url,
                setTimeout(() => {
                  URL.revokeObjectURL(url);
                  urls.current.delete(url);
                }, 1000),
              );
              setStatus('downloaded');
            } catch {
              setStatus('failed');
            }
          }}
        >
          {t('下載檔案', 'Download file')}
        </button>
      </div>
      <textarea
        readOnly
        value={code}
        aria-label={t(`${label.zh}原始碼`, `${label.en} source`)}
        spellCheck={false}
        rows={9}
      />
      <p className="lab-note" role="status">
        {status === 'copied'
          ? t('已複製', 'Copied')
          : status === 'downloaded'
            ? t('已開始下載', 'Download started')
            : status === 'failed'
              ? t(
                  '無法完成，請選取上方原始碼手動複製或重試',
                  'Could not complete — select the source to copy manually or retry',
                )
              : t('調整參數後，原始碼會同步更新', 'Source updates as you change the controls')}
      </p>
    </section>
  );
}
