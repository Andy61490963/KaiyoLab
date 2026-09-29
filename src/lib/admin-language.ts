import { shellMessages } from './admin-messages-shell';
import { editorMessages, editorMessage } from './admin-messages-editor';
import { toolsMessages, toolsMessage } from './admin-messages-tools';
import { errorMessages, adminErrorMessage } from './admin-messages-errors';
import { orderMessages } from './admin-messages-order';

export const ADMIN_LANGUAGE_KEY = 'kaiyo-admin-language';
export type AdminLanguage = 'zh-TW' | 'en';
export type AdminValues = Record<string, string | number>;
export const normalizeAdminLanguage = (value: unknown): AdminLanguage =>
  value === 'en' ? 'en' : 'zh-TW';

export function mediaUsageLabel(value: string, language: AdminLanguage): string {
  if (language === 'en') return value;
  if (value === 'Site settings / About me') return '網站設定／關於我';
  const match = /^(.*) \((draft(?: \/ trash)?|published|version history)\)$/s.exec(value);
  if (!match) return value;
  const suffixes: Record<string, string> = {
    draft: '草稿',
    'draft / trash': '草稿／垃圾桶',
    published: '已發布',
    'version history': '版本紀錄',
  };
  return `${match[1]}（${suffixes[match[2]]}）`;
}

const messages: Record<string, string> = {
  ...shellMessages,
  ...editorMessages,
  ...toolsMessages,
  ...errorMessages,
  ...orderMessages,
  Admin: '管理後台',
  Yes: '是',
  No: '否',
  'Admin interface language': '後台介面語言',
  'Admin interface language: Traditional Chinese': '後台介面已切換為繁體中文',
  'Admin interface language: English': '後台介面已切換為英文',
  'Opening sign-in…': '正在開啟登入頁…',
  'Opening first-time setup…': '正在開啟首次設定…',
  'Loading your workspace…': '正在載入管理後台…',
  'First-time setup': '首次設定',
};

// 僅在介面文字呼叫，不掃描 DOM，也不處理文章或表單輸入內容
export function adminText(
  key: string,
  language: AdminLanguage = 'zh-TW',
  values: AdminValues = {},
): string {
  const template =
    (language === 'zh-TW' && Object.hasOwn(messages, key) ? messages[key] : undefined) ??
    editorMessage(key, language) ??
    toolsMessage(key, language) ??
    adminErrorMessage(key, language) ??
    key;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
