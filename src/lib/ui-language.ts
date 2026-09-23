export const UI_LANGUAGE_KEY = 'kaiyo-ui-language';
export type UiLanguage = 'en' | 'zh-TW';
export const normalizeUiLanguage = (value: unknown): UiLanguage =>
  value === 'zh-TW' ? 'zh-TW' : 'en';

// Only interface strings belong here; authored Markdown never enters this map.
export const uiLabels = {
  search: ['Search articles', '搜尋文章'],
  searchPlaceholder: ['Search titles or content…', '搜尋標題或內文…'],
  mainNavigation: ['Main navigation', '主要導覽'],
  mobileNavigation: ['Mobile navigation', '行動版導覽'],
  categories: ['Article categories', '文章分類'],
  articleTags: ['Article tags', '文章標籤'],
  technologies: ['Technologies used', '使用技術'],
  projectList: ['Project list', '專案列表'],
  pagination: ['Content pagination', '內容分頁'],
  previousPage: ['Previous page', '上一頁'],
  nextPage: ['Next page', '下一頁'],
  articleToc: ['Article table of contents', '文章目錄'],
  mobileToc: ['Mobile article table of contents', '行動版文章目錄'],
  projectToc: ['Project table of contents', '專案目錄'],
  openMenu: ['Open menu', '開啟選單'],
  closeMenu: ['Close menu', '關閉選單'],
  lightTheme: ['Switch to light theme', '切換淺色主題'],
  darkTheme: ['Switch to dark theme', '切換深色主題'],
  copyCode: ['Copy code', '複製程式碼'],
  copy: ['Copy', '複製'],
  copied: ['Copied', '已複製'],
  copyFailed: ['Copy failed', '複製失敗'],
  copiedStatus: ['Code copied to clipboard.', '已將程式碼複製到剪貼簿。'],
  copyFailedStatus: [
    'Unable to copy. Select the code and copy it manually.',
    '無法複製，請選取程式碼後手動複製。',
  ],
  languageHint: [
    'Interface only. Articles and profile content stay in their original language.',
    '只切換介面；文章與個人介紹保留原始語言。',
  ],
  languageChanged: [
    'Interface language: English. Content is unchanged.',
    '介面已切換為繁體中文，內容語言保持不變。',
  ],
} as const;
export type UiLabel = keyof typeof uiLabels;
export const uiLabel = (key: UiLabel, language: UiLanguage): string =>
  uiLabels[key][language === 'zh-TW' ? 1 : 0];
export const isUiLabel = (key: string | undefined): key is UiLabel =>
  !!key && Object.prototype.hasOwnProperty.call(uiLabels, key);
