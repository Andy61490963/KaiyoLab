import { useMemo, useSyncExternalStore } from 'react';
import {
  ADMIN_LANGUAGE_KEY,
  adminText,
  normalizeAdminLanguage,
  type AdminLanguage,
  type AdminValues,
} from '../../lib/admin-language';

let language: AdminLanguage | undefined;
const listeners = new Set<() => void>();

function snapshot(): AdminLanguage {
  if (typeof window === 'undefined') return 'zh-TW';
  if (!language) {
    try {
      language = normalizeAdminLanguage(localStorage.getItem(ADMIN_LANGUAGE_KEY));
    } catch {
      language = normalizeAdminLanguage(document.documentElement.dataset.adminLanguage);
    }
  }
  return language;
}

function updateDocument(value: AdminLanguage) {
  document.documentElement.dataset.adminLanguage = value;
  document.documentElement.lang = value;
}

function update(value: AdminLanguage) {
  language = value;
  updateDocument(value);
  for (const listener of listeners) listener();
}

function storageChanged(event: StorageEvent) {
  if (event.key === ADMIN_LANGUAGE_KEY || event.key === null)
    update(normalizeAdminLanguage(event.newValue));
}

function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener('storage', storageChanged);
  listeners.add(listener);
  updateDocument(snapshot());
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', storageChanged);
  };
}

function setLanguage(value: AdminLanguage) {
  try {
    localStorage.setItem(ADMIN_LANGUAGE_KEY, value);
  } catch {
    // 儲存空間被停用時，這個分頁仍可切換語言
  }
  update(value);
}

export function useAdminLanguage() {
  const current = useSyncExternalStore(subscribe, snapshot, () => 'zh-TW' as const);
  const t = useMemo(
    () => (key: string, values?: AdminValues) => adminText(key, current, values),
    [current],
  );
  return { language: current, setLanguage, t };
}

export default function AdminLanguageSwitch() {
  const { language, setLanguage, t } = useAdminLanguage();
  return (
    <>
      <div
        className="admin-language-switch"
        role="group"
        aria-label={t('Admin interface language')}
      >
        <button
          type="button"
          lang="zh-TW"
          aria-label="繁體中文"
          aria-pressed={language === 'zh-TW'}
          onClick={() => setLanguage('zh-TW')}
        >
          中文
        </button>
        <button
          type="button"
          lang="en"
          aria-label="English"
          aria-pressed={language === 'en'}
          onClick={() => setLanguage('en')}
        >
          EN
        </button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {t(
          language === 'en'
            ? 'Admin interface language: English'
            : 'Admin interface language: Traditional Chinese',
        )}
      </span>
    </>
  );
}
