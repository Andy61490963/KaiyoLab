// API 保留原有回應，介面依當前語言呈現已知的錯誤訊息
export const errorMessages: Record<string, string> = {
  'Method not allowed.': '不支援這個操作方式',
  'Operation not found.': '找不到這個操作',
  'Another content transfer is running. Try again after it finishes.':
    '另一個內容移轉正在執行，請等它完成後再試',
  'Your session expired. Sign in in another tab, then retry without closing this editor.':
    '登入已過期，請在另一個分頁重新登入，再回到這裡重試，請先保留編輯內容',
  'Your session expired. Sign in in another tab, then retry.':
    '登入已過期，請在另一個分頁重新登入後重試',
  'The email or password is incorrect.': '電子郵件或密碼不正確',
  'The current password is incorrect.': '目前的密碼不正確',
  'Use at least 12 characters for your password.': '密碼至少需要 12 個字元',
  'Passwords cannot exceed 128 characters.': '密碼不能超過 128 個字元',
  'Enter a valid email address.': '請輸入有效的電子郵件地址',
  'Too many attempts. Wait a minute and try again.': '嘗試次數過多，請稍候一分鐘再試',
  'Authentication failed. Check your details and try again.': '驗證失敗，請檢查登入資料後重試',
  'The request failed. Please try again.': '操作失敗，請重試',
  'Unable to reach the server. Check your connection and retry.':
    '無法連線到伺服器，請檢查網路後重試',
  'The request exceeds the size limit.': '送出的資料超過大小限制',
  'Send a JSON request body.': '請送出 JSON 格式的資料',
  'Unable to read the submitted data.': '無法讀取送出的資料',
  'That slug or name is already in use.': '這個網址代稱或名稱已被使用',
  'Unable to process the request. Please try again.': '無法完成操作，請重試',
  'Enter a valid HTTP or HTTPS URL.': '請輸入有效的 HTTP 或 HTTPS 網址',
  'Use a media library or built-in image path.': '請使用媒體庫或內建圖片路徑',
  'Slugs may contain letters, numbers, hyphens, and underscores.':
    '網址代稱只可包含文字、數字、連字號及底線',
  'The setup token is incorrect.': '一次性初始化碼不正確',
  'This site is already initialized.': '這個網站已完成初始化',
  'This site has not been initialized.': '網站尚未完成初始化',
  'Settings changed in another tab or import. Reload the latest settings first.':
    '設定已在其他分頁或匯入操作中變更，請先重新載入最新設定',
  'The settings version changed. Reload the latest settings first.':
    '設定版本已變更，請先重新載入最新設定',
  'This URL belongs to another entry or one of its previous published URLs. Choose a different slug.':
    '這個網址已屬於其他內容或其曾經發布的網址，請使用其他網址代稱',
  'Upload a .kaiyo.json.gz archive.': '請上傳 .kaiyo.json.gz 封存檔',
  'The compressed archive cannot exceed 32 MB.': '壓縮封存檔不能超過 32 MB',
  'Choose an archive.': '請選擇封存檔',
  'This is not a valid gzip JSON archive, or its expanded size exceeds 64 MB.':
    '封存檔不是有效的 gzip JSON 格式，或解壓縮後超過 64 MB',
  'A revision references missing content.': '版本紀錄指向不存在的內容',
  'A previous URL references missing content or a different content type.':
    '舊網址指向不存在或不同類型的內容',
  'An image has invalid base64 data.': '圖片的 base64 資料無效',
  'Images exceed the 10 MB per image or 30 MB total limit.':
    '圖片超過單張 10 MB 或總計 30 MB 的限制',
  'An image is invalid, animated, or does not match its declared dimensions.':
    '圖片無效、含有動畫，或實際尺寸與紀錄不符',
  'The archive references an image that is not included.': '封存檔使用了未包含在檔案中的圖片',
  'The archive or site content has changed. Check the archive again before importing.':
    '封存檔或網站內容已變更，請重新檢查封存檔後再匯入',
  'The site content exceeds portable archive limits. Use the database backup procedure.':
    '網站內容超過可攜式封存檔限制，請使用資料庫備份流程',
  'This site exceeds the portable archive limits. Use the database and media backup procedure.':
    '網站超過可攜式封存檔限制，請使用資料庫與媒體備份流程',
  'An image ID is invalid.': '圖片識別碼無效',
  'The image library exceeds portable archive limits. Use the database and media backup procedure.':
    '媒體庫超過可攜式封存檔限制，請使用資料庫與媒體備份流程',
  'An image file is missing. Restore it before exporting.': '有圖片檔案遺失，請先還原圖片再匯出',
  'The archive exceeds the 64 MB expanded limit. Use the database backup procedure.':
    '封存檔解壓縮後超過 64 MB，請使用資料庫備份流程',
  'The archive exceeds the 32 MB compressed limit. Use the database backup procedure.':
    '封存檔壓縮後超過 32 MB，請使用資料庫備份流程',
  'The content references a missing image. Choose another image.':
    '內容使用了不存在的圖片，請選擇其他圖片',
  'The history cursor is no longer available. Reload history.':
    '版本紀錄的分頁位置已失效，請重新載入紀錄',
  'Version not found.': '找不到這個版本',
  'Choose preview or import.': '請選擇預覽或匯入操作',
  'Check the archive before importing.': '請先檢查封存檔再匯入',
  'Content not found': '找不到內容',
  'Content not found.': '找不到內容',
  'Restore this content before publishing': '請先還原內容再發布',
  'This content changed in another tab. Reload before reviewing it':
    '內容已在其他分頁變更，請重新載入再檢查',
  'Images cannot exceed 10 MB.': '圖片不能超過 10 MB',
  'Choose an image.': '請選擇圖片',
  'Upload an image no larger than 10 MB.': '請上傳不超過 10 MB 的圖片',
  'Only PNG, JPEG, and WebP images are supported.': '只支援 PNG、JPEG 及 WebP 圖片',
  'The image is invalid or exceeds the pixel limit.': '圖片無效或超過像素上限',
  'Restore this content from the trash first.': '請先從垃圾桶還原內容',
  'Content version conflict. Reload before restoring.': '內容版本衝突，請重新載入再還原',
  'This content has changed in another tab. Keep your edits or save a copy before reloading.':
    '內容已在其他分頁變更，重新載入前請保留編輯內容或下載副本',
  'Restore this content before editing.': '請先還原內容再編輯',
  'Restore this content first.': '請先還原內容',
  'Add some content before publishing.': '請先加入內文再發布',
  'Content version conflict. Reload before retrying.': '內容版本衝突，請重新載入後重試',
  'Image not found.': '找不到圖片',
  'This image is still in use. Remove its references before deleting it.':
    '這張圖片仍在使用中，請先移除使用位置再刪除',
  'Category or tag not found.': '找不到分類或標籤',
  'This category or tag is still in use. Remove its references first.':
    '這個分類或標籤仍在使用中，請先移除使用位置',
  'Submit this request from the site itself.': '請從本站送出操作',
  'Sign in with the owner account first.': '請先使用站長帳號登入',
  'Unable to reach the authentication service.': '無法連線到驗證服務',
  'The transfer failed. Please try again.': '內容移轉失敗，請重試',
};

const legacyMessages: Record<string, string> = {
  '來源網域必須是 HTTP 或 HTTPS origin': 'The source origin must be an HTTP or HTTPS origin.',
  網站尚未完成初始化: 'This site has not been initialized.',
  '設定已在其他分頁或匯入操作中變更，請先重新載入最新設定':
    'Settings changed in another tab or import. Reload the latest settings first.',
  '設定版本已變更，請先重新載入最新設定':
    'The settings version changed. Reload the latest settings first.',
  舊網址指向不存在或不同類型的內容:
    'A previous URL references missing content or a different content type.',
};

const fields: Record<string, string> = {
  title: '標題',
  slug: '網址代稱',
  excerpt: '摘要',
  body: '內文',
  cover: '封面',
  coverAlt: '封面替代文字',
  category: '分類',
  tags: '標籤',
  featured: '精選',
  seoTitle: 'SEO 標題',
  seoDescription: 'SEO 描述',
  demoUrl: '展示網址',
  repoUrl: '原始碼網址',
  series: '文章系列',
  seriesOrder: '系列順序',
  siteName: '網站名稱',
  tagline: '網站短介',
  description: '網站描述',
  homeIntro: '首頁介紹',
  authorName: '作者名稱',
  bio: '個人簡介',
  about: '關於我',
  logo: 'Logo',
  avatar: '頭像',
  heroImage: '首頁圖片',
  socialLinks: '社群連結',
  siteUrl: '網站網址',
  label: '名稱',
  url: '網址',
  email: '電子郵件',
  password: '密碼',
  name: '名稱',
  token: '初始化碼',
  version: '版本',
  content: '內容',
  alt: '替代文字',
  id: '識別碼',
  entries: '文章與作品',
  settings: '網站設定',
  revisions: '版本紀錄',
  taxonomies: '分類標籤',
  media: '圖片',
  aliases: '舊網址',
  sourceOrigin: '來源網域',
  exportedAt: '匯出時間',
  entryId: '內容識別碼',
  kind: '類型',
  publishedAt: '發布時間',
  updatedAt: '更新時間',
  createdAt: '建立時間',
  width: '寬度',
  height: '高度',
  format: '格式',
};

function validationMessage(message: string): string | undefined {
  if (Object.hasOwn(errorMessages, message)) return errorMessages[message];
  const length = message.match(
    /^Too (small|big): expected (string|array|number) to (?:have |be )(>=|<=|>|<)([\d.e+-]+)(?: (characters|items))?$/,
  );
  if (length) {
    const unit = length[2] === 'string' ? ' 個字元' : length[2] === 'array' ? ' 個項目' : '';
    const comparison = { '>=': '至少需要', '<=': '不能超過', '>': '必須大於', '<': '必須小於' }[
      length[3]
    ];
    return `${comparison} ${length[4]}${unit}`;
  }
  if (/^Invalid input: expected .+, received .+$/.test(message)) return '欄位資料格式不正確';
  if (/^Invalid option: expected /.test(message)) return '請選擇有效的選項';
  if (/^Invalid input$/.test(message)) return '請檢查欄位內容';
  if (/^Invalid email address$/.test(message)) return '請輸入有效的電子郵件地址';
  if (message === 'Invalid UUID') return '識別碼須為有效的 UUID';
  if (message === 'Invalid ISO datetime') return '請使用有效的 ISO 日期時間';
  if (/^Invalid input: expected /.test(message)) return '資料不符合指定格式';
  if (/^Unrecognized keys?: /.test(message)) return '包含不支援的欄位';
  if (/^Invalid string: must match pattern /.test(message)) return '文字格式不符合欄位要求';
  return undefined;
}

export function adminErrorMessage(key: string, language: 'zh-TW' | 'en'): string | undefined {
  if (Object.hasOwn(legacyMessages, key)) return language === 'en' ? legacyMessages[key] : key;
  const ambiguousUrl = key.match(/^封存檔含無法判別歸屬的站內網址：(.+)$/);
  if (ambiguousUrl)
    return language === 'en'
      ? `The archive contains an ambiguous internal URL: ${ambiguousUrl[1]}`
      : key;
  const duplicate = key.match(/^Duplicate (.+) in the archive\.$/);
  if (duplicate && language === 'zh-TW') {
    const labels: Record<string, string> = {
      'content IDs': '內容識別碼',
      'entry IDs': '內容識別碼',
      'category or tag names': '分類或標籤名稱',
      'image IDs': '圖片識別碼',
      'revision IDs': '版本識別碼',
      'published URLs': '已發布網址',
    };
    return `封存檔含有重複的${labels[duplicate[1]] || duplicate[1]}`;
  }
  const segments = key.split('; ');
  let translated = false;
  const result = segments.map((segment) => {
    const match = segment.match(/^([a-zA-Z]\w*(?:\.[\w]+)*)?: (.+)$/);
    if (!match) return segment;
    if (language === 'en') {
      if (!Object.hasOwn(legacyMessages, match[2])) return segment;
      translated = true;
      return `${match[1] || 'Data'}: ${legacyMessages[match[2]]}`;
    }
    const message = validationMessage(match[2]);
    if (!message) return segment;
    translated = true;
    const field = (match[1] || '資料')
      .split('.')
      .map((part) => fields[part] || part)
      .join(' / ');
    return `${field}：${message}`;
  });
  return translated ? result.join(language === 'en' ? '; ' : '；') : undefined;
}
