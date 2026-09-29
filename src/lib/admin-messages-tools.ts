export const toolsMessages: Record<string, string> = {
  'About this workspace': '關於管理後台',
  'Your personal publishing space': '個人內容管理系統',
  'WRITE. BUILD. SHARE.': '筆記、作品與分享',
  'A place for your ideas.': '整理你的筆記與作品',
  'Development notes, side projects, and things worth documenting. Make this corner of the web your own.':
    '管理開發筆記、個人專案，以及值得記錄的事',
  'Your content. Your website.': '自己的內容，自己的網站',
  'Back to website': '返回網站',
  'FIRST-TIME SETUP': '首次設定',
  'KAIYOLAB ADMIN': 'KAIYOLAB 管理後台',
  'Set up your workspace': '設定網站與管理帳號',
  'Welcome back': '登入管理後台',
  'Create your site and owner account to start publishing.':
    '建立網站與站長帳號，開始管理文章與作品',
  'Sign in to manage your writing and projects.': '登入後管理文章、作品與網站設定',
  'Setup complete. Sign in with your new owner account.': '設定完成，請使用剛建立的站長帳號登入',
  'Owner account details': '站長帳號資料',
  'Sign-in details': '登入資料',
  'One-time setup token': '一次性初始化碼',
  'Paste the token from your container logs': '貼上容器日誌中的初始化碼',
  'Find the setup token with this terminal command:': '在終端機執行以下指令取得初始化碼：',
  'Display name': '顯示名稱',
  'What should we call you?': '輸入你的名稱',
  'Site name': '網站名稱',
  Email: '電子郵件',
  'Set password': '設定密碼',
  Password: '密碼',
  'At least 12 characters': '至少 12 個字元',
  'Enter your password': '輸入密碼',
  'Hide password': '隱藏密碼',
  'Show password': '顯示密碼',
  'Use a memorable passphrase with at least 12 characters.':
    '建議使用容易記住的片語，至少 12 個字元',
  'Working…': '處理中…',
  'Create site and account': '建立網站與管理帳號',
  'Sign in': '登入',
  'The setup page is disabled once your owner account is created.':
    '建立站長帳號後，首次設定頁面將關閉',
  'Owner access only. For a lost password, follow the account recovery steps in the README.':
    '僅限站長登入，忘記密碼時請依 README 的帳號復原步驟操作',
  'KaiyoLab · A private space to publish.': 'KaiyoLab · 私人內容管理後台',
  'Switch to light theme': '切換淺色主題',
  'Switch to dark theme': '切換深色主題',
  'Not configured': '尚未設定',
  'Not recorded': '尚無紀錄',
  'Record unavailable': '無法讀取紀錄',
  Maintenance: '網站維運',
  'System status': '系統狀態',
  'Check this instance and the configured maintenance records': '檢查目前網站與已設定的維運紀錄',
  'Checking…': '檢查中…',
  'Refresh status': '重新檢查',
  Application: '應用程式',
  'Deployed revision': '部署版本',
  Database: '資料庫',
  'Connected · {latency} ms': '已連線 · {latency} 毫秒',
  'Connection failed': '連線失敗',
  'Image storage': '圖片儲存空間',
  Writable: '可寫入',
  'Write check failed': '寫入檢查失敗',
  'Registered images': '已登錄圖片',
  Unavailable: '無法取得',
  '{count} items · {size} MB': '{count} 個項目 · {size} MB',
  Checked: '檢查時間',
  'Maintenance records': '維運紀錄',
  'Local backup status': '本機備份狀態',
  'Up to date': '備份正常',
  Overdue: '備份已逾期',
  'Last attempt failed': '最近一次備份失敗',
  'Not verified': '尚未驗證',
  'Last completed backup': '最近完成備份',
  'Backup overdue after': '備份逾期時間',
  'Last failed attempt': '最近失敗時間',
  'Last verified restore': '最近還原驗證',
  'Records come from the backup and restore verification scripts. No record means the operation has not been recorded in the configured directory. Image totals come from the database and do not verify individual files.':
    '紀錄由備份與還原驗證腳本產生，沒有紀錄表示指定目錄尚未記錄該次操作，圖片統計來自資料庫，不代表已逐一驗證實體檔案',
  'External uptime checks run separately in GitHub Actions. See the repository maintenance guide for backup, recovery and notification settings.':
    '外部網站監測由 GitHub Actions 獨立執行，備份、復原與通知設定請參閱專案維運指南',
  'Checking system status…': '正在檢查系統狀態…',
  Workspace: '網站管理',
  'Content transfer': '內容匯出與匯入',
  'Move your articles, projects, images, and site settings between KaiyoLab installations.':
    '在不同 KaiyoLab 網站之間搬移文章、作品、圖片與網站設定',
  'Your session expired. Sign in in another tab, then retry.':
    '登入已過期，請在另一個分頁登入後重試',
  'The transfer failed. Please try again.': '內容搬移失敗，請重試',
  'Archive downloaded. Keep it private: it includes drafts and unpublished images.':
    '封存檔已下載，內含草稿與未公開圖片，請妥善保管',
  'Imported {articles} articles and {projects} projects as private drafts, with {images} images. Review and publish each item when ready.':
    '已將 {articles} 篇文章與 {projects} 件作品匯入為私人草稿，並匯入 {images} 張圖片，請逐項確認後再發布',
  'Site settings have been applied.': '已套用網站設定',
  'View articles': '查看文章',
  'Export content': '匯出內容',
  'Download a portable .kaiyo.json.gz archive.': '下載可搬移的 .kaiyo.json.gz 封存檔',
  'Includes drafts, published snapshots, revision history, categories, tags, site content, and the image library. Account credentials and deployment settings are excluded.':
    '包含草稿、已發布快照、版本紀錄、分類、標籤、網站內容與媒體庫，不含帳號憑證與部署設定',
  'This archive contains private content. Store it securely. Use a database and volume backup for a complete disaster recovery copy.':
    '封存檔包含私人內容，請安全保存，完整災難復原仍需備份資料庫與持久化儲存空間',
  'Preparing archive…': '正在準備封存檔…',
  'Download archive': '下載封存檔',
  'Import content': '匯入內容',
  'Check an archive before adding content to this site.': '先檢查封存檔，再將內容加入此網站',
  'KaiyoLab archive': 'KaiyoLab 封存檔',
  'Up to 32 MB compressed / 64 MB expanded, 2,000 entries, and 500 images. Images must total 30 MB or less.':
    '壓縮檔上限 32 MB、解壓後上限 64 MB，最多 2,000 筆內容與 500 張圖片，圖片總大小不得超過 30 MB',
  'Also apply site settings and About me content': '同時套用網站設定與關於我內容',
  'This replaces the current public introduction, branding, and social links immediately. Your site URL and owner account stay unchanged.':
    '這會立即取代目前公開介紹、品牌與社群連結，網站網址與站長帳號維持不變',
  'All imported articles and projects are added as': '所有文章與作品都會匯入為',
  'private drafts': '私人草稿',
  ', including items from the trash. Published snapshots remain available in revision history. Existing content is never overwritten or deleted.':
    '，包括垃圾桶內的項目，已發布快照仍保留在版本紀錄中，現有內容不會被覆寫或刪除',
  'Checking archive…': '正在檢查封存檔…',
  'Check archive': '檢查封存檔',
  'Review import': '確認匯入內容',
  'Archive created {date}': '封存檔建立時間：{date}',
  'Article drafts': '文章草稿',
  'Project drafts': '作品草稿',
  Images: '圖片',
  'New categories': '新增分類',
  'New tags': '新增標籤',
  Revisions: '版本紀錄',
  'Rewritten internal links': '改寫的站內連結',
  '{count} items from the archive trash will be restored as private drafts.':
    '封存檔垃圾桶內的 {count} 筆內容會還原為私人草稿',
  '{count} older draft versions will be omitted. Each entry keeps its latest 99 draft versions and a snapshot of the imported draft; published versions are kept.':
    '將略過 {count} 個較舊的草稿版本，每筆內容保留最近 99 個草稿版本與本次匯入草稿的快照，已發布版本會完整保留',
  'Names and URLs': '名稱與網址',
  'Existing categories and tags with matching names are reused. Conflicting URLs receive an import suffix, including URLs stored in imported version history.':
    '同名分類與標籤會沿用現有項目，衝突網址會加上匯入後綴，匯入版本紀錄內的網址也會一併調整',
  Type: '類型',
  'In archive': '封存檔原值',
  'After import': '匯入後',
  article: '文章',
  project: '作品',
  category: '分類',
  tag: '標籤',
  'Reuse existing name': '沿用現有名稱',
  'Internal link changes': '站內連結調整',
  'These links will point to the imported articles or projects, preserving query parameters and section anchors instead of linking to existing content with the same URL.':
    '下列連結會指向本次匯入的文章或作品，保留查詢參數與章節錨點，避免連到目的站原本的同名內容',
  Location: '位置',
  'Archive link': '封存檔連結',
  'Imported link': '匯入後連結',
  '{count} additional link changes are not listed.': '另外 {count} 個連結調整未逐項列出',
  'Site settings and About me will be replaced with “{siteName}” by {authorName} when you confirm.':
    '確認後，網站設定與關於我將套用 {authorName} 的「{siteName}」內容',
  'Current site settings and About me will be kept.': '目前網站設定與關於我內容將維持不變',
  'Importing…': '正在匯入…',
  'Import as private drafts': '匯入為私人草稿',
  Cancel: '取消',
};

export function toolsMessage(key: string, language: 'zh-TW' | 'en'): string | undefined {
  if (language !== 'en') return undefined;
  if (key === '關於我') return 'About me';
  if (key === '首頁介紹') return 'Home introduction';
  // 只翻譯伺服器加入的位置後綴，保留文章標題原文
  const location = /^(.*) · (草稿|發布版本|歷史草稿)$/s.exec(key);
  if (!location) return undefined;
  const suffix: Record<string, string> = {
    草稿: 'Draft',
    發布版本: 'Published version',
    歷史草稿: 'Historical draft',
  };
  return `${location[1]} · ${suffix[location[2]]}`;
}
