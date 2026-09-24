export const UI_LANGUAGE_KEY = 'kaiyo-ui-language';
export type UiLanguage = 'en' | 'zh-TW';

// Interface copy only. Never pass authored Markdown, titles, or taxonomy names here.
export const chinese = {
  Series: '文章系列',
  'Previous article': '上一篇',
  'Next article': '下一篇',
  'List options': '列表選項',
  'Sort by': '排序方式',
  'Per page': '每頁筆數',
  Apply: '套用',
  'Oldest first': '最舊優先',
  'Title A–Z': '標題升冪',
  'Title Z–A': '標題降冪',
  'Showing {from}–{to} of {total}': '顯示第 {from}–{to} 筆，共 {total} 筆',
  'Page {page}': '第 {page} 頁',
  'Search projects': '搜尋作品',
  '{count} project': '{count} 件作品',
  '{count} projects': '{count} 件作品',
  'No matching projects': '找不到符合的作品',
  'Try another keyword or clear the search.': '試試其他關鍵字，或清除搜尋條件。',
  Home: '首頁',
  Articles: '文章',
  Projects: '作品',
  'About Me': '關於我',
  'Skip to main content': '跳至主要內容',
  'Search articles': '搜尋文章',
  'Main navigation': '主要導覽',
  'Mobile navigation': '行動版導覽',
  'Open menu': '開啟選單',
  'Close menu': '關閉選單',
  'Toggle color theme': '切換色彩主題',
  'Switch to light theme': '切換淺色主題',
  'Switch to dark theme': '切換深色主題',
  'Interface language': '介面語言',
  'Only interface labels change. Your content stays in its original language.':
    '只切換介面文字，文章與自訂內容保留原始語言。',
  'Interface language: English. Content is unchanged.': '介面語言：繁體中文。內容未變更。',
  ' (opens in a new tab)': '（在新分頁開啟）',
  '{name} home': '{name} 首頁',
  "I'm": '我是',
  'RSS feed': 'RSS 訂閱',
  Admin: '後台',
  'Notes, projects, and things learned along the way.': '筆記、作品，以及一路上的學習紀錄。',
  'More about me': '更多關於我',
  'Latest Articles': '最新文章',
  'All articles': '所有文章',
  'Featured Articles': '精選文章',
  'Selected Projects': '精選作品',
  'All projects': '所有作品',
  'Browse by Topic': '依主題瀏覽',
  'Subscribe to new articles via RSS': '透過 RSS 訂閱新文章',
  'No published articles yet. New writing will appear here.':
    '尚無已發布文章，新文章會顯示在這裡。',
  'No published projects yet. Projects will appear here when they are ready to share.':
    '尚無已發布作品，準備好分享的作品會顯示在這裡。',
  'Development notes, practical guides, and things worth documenting.':
    '開發筆記、實作指南，以及值得記錄的事。',
  Categories: '分類',
  'Article categories': '文章分類',
  'All categories': '所有分類',
  Tags: '標籤',
  'Clear tag': '清除標籤',
  'Search titles or content…': '搜尋標題或內容…',
  Search: '搜尋',
  '{count} article': '{count} 篇文章',
  '{count} articles': '{count} 篇文章',
  ' matching “{query}”': '，關鍵字「{query}」',
  ' in {category}': '，分類「{category}」',
  ' tagged #{tag}': '，標籤 #{tag}',
  'Clear filters': '清除篩選',
  'Newest first': '最新優先',
  'No matching articles': '找不到符合的文章',
  'No published articles yet': '尚無已發布文章',
  'Try another keyword or clear the category and tag filters.':
    '試試其他關鍵字，或清除分類與標籤篩選。',
  'Published articles will appear here.': '已發布的文章會顯示在這裡。',
  'Selected projects and open-source work, with details and related links.':
    '個人作品與開源專案，包含介紹和相關連結。',
  'Project list': '作品列表',
  'No published projects yet': '尚無已發布作品',
  'Published projects and links will appear here.': '已發布的作品與連結會顯示在這裡。',
  'Content pagination': '內容分頁',
  'Previous page': '上一頁',
  'Next page': '下一頁',
  'Nothing here yet': '這裡還沒有內容',
  'Published content will appear here.': '發布的內容會顯示在這裡。',
  '{count} min read': '閱讀約 {count} 分鐘',
  Featured: '精選',
  'Article tags': '文章標籤',
  'Technologies used': '使用技術',
  Details: '詳細介紹',
  Demo: '展示',
  Source: '原始碼',
  '{title}: details': '{title}：詳細介紹',
  '{title}: live demo (opens in a new tab)': '{title}：展示（在新分頁開啟）',
  '{title}: source code (opens in a new tab)': '{title}：原始碼（在新分頁開啟）',
  'Back to articles': '返回文章列表',
  'Table of contents': '目錄',
  'Mobile article table of contents': '行動版文章目錄',
  'Article table of contents': '文章目錄',
  'Subscribe to new articles': '訂閱新文章',
  'ON THIS PAGE': '本頁內容',
  'A short read without section headings.': '這是一篇沒有章節標題的短文。',
  'Back to top ↑': '回到頁首 ↑',
  'KEEP EXPLORING': '繼續探索',
  'You might also like': '你可能也喜歡',
  'Back to projects': '返回作品列表',
  'A PROJECT BY': '作品作者',
  'Open demo': '開啟展示',
  'Source code': '原始碼',
  'Project details': '作品資訊',
  Published: '發布日期',
  'Last updated': '最後更新',
  Category: '分類',
  'Project table of contents': '作品目錄',
  'Temporarily unavailable': '暫時無法使用',
  'Refresh the page in a moment. If the problem persists, contact the site owner.':
    '請稍後重新整理；若問題持續，請聯絡站長。',
  'Page not found': '找不到頁面',
  'The requested page could not be found.': '找不到你要查看的頁面。',
  'Check the URL, or head back home to browse articles and projects.':
    '請確認網址，或回到首頁瀏覽文章與作品。',
  'Back to home': '返回首頁',
  'Browse articles': '瀏覽文章',
  Copy: '複製',
  'Copy code': '複製程式碼',
  Copied: '已複製',
  'Copy failed': '複製失敗',
  'Code copied to clipboard.': '程式碼已複製到剪貼簿。',
  'Unable to copy. Select the code and copy it manually.': '無法複製，請選取程式碼後手動複製。',
} as const;
export type UiKey = keyof typeof chinese;
export type UiValues = Record<string, string | number>;
export function normalizeUiLanguage(value: unknown): UiLanguage {
  return value === 'zh-TW' ? 'zh-TW' : 'en';
}
export function uiText(key: UiKey, language: UiLanguage = 'en', values: UiValues = {}): string {
  const template = language === 'zh-TW' ? chinese[key] : key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
export function uiLabel(key: UiKey, values: UiValues = {}) {
  const en = uiText(key, 'en', values);
  return {
    'aria-label': en,
    'data-ui-label-en': en,
    'data-ui-label-zh': uiText(key, 'zh-TW', values),
  };
}
export function uiPlaceholder(key: UiKey) {
  return {
    placeholder: key,
    'data-ui-placeholder-en': key,
    'data-ui-placeholder-zh': chinese[key],
  };
}
