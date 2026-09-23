-- 僅替換與舊版預設文案完全相同的欄位，保留站長自行撰寫的內容
WITH defaults(key, old_value, new_value) AS (
  VALUES
    ('tagline', '在想像與技術之間，探索更多可能', '技術筆記與開源作品'),
    ('description', '一個記錄想法、分享技術與創作的個人實驗室', '整理開發筆記、做過的專案，以及正在學習的事'),
    ('bio', '寫下探索的軌跡，讓每一個想法都有發光的機會', '分享程式開發筆記與個人作品'),
    ('about', E'## 嗨，歡迎來到我的實驗室\n\n這裡記錄我的學習、創作，以及對世界的好奇\n\n你可以在管理後台編輯這段介紹', E'## 關於我\n\n這裡可以介紹自己的背景、正在做的專案，以及聯絡方式\n\n登入管理後台後，就能編輯這段文字')
), patches AS (
  SELECT settings.id, jsonb_object_agg(defaults.key, defaults.new_value) AS value
  FROM settings
  CROSS JOIN defaults
  WHERE settings.value ->> defaults.key = defaults.old_value
  GROUP BY settings.id
)
UPDATE settings
SET value = settings.value || patches.value
FROM patches
WHERE settings.id = patches.id;
