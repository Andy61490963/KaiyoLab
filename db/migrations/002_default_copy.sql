-- 只更新仍沿用舊版預設值的欄位，保留站長自行編寫的網站資訊
WITH old_defaults(key, value) AS (
  VALUES
    ('tagline', '在想像與技術之間，探索更多可能。'),
    ('description', '一個記錄想法、分享技術與創作的個人實驗室。'),
    ('bio', '寫下探索的軌跡，讓每一個想法都有發光的機會。'),
    ('about', E'## 嗨，歡迎來到我的實驗室\n\n這裡記錄我的學習、創作，以及對世界的好奇。\n\n你可以在管理後台編輯這段介紹。')
), patches AS (
  SELECT settings.id, jsonb_object_agg(old_defaults.key, replace(old_defaults.value, '。', '')) AS value
  FROM settings
  CROSS JOIN old_defaults
  WHERE settings.value ->> old_defaults.key = old_defaults.value
  GROUP BY settings.id
)
UPDATE settings
SET value = settings.value || patches.value
FROM patches
WHERE settings.id = patches.id;
