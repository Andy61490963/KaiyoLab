-- 設定與關於頁共用版本，避免舊分頁覆蓋較新的變更
ALTER TABLE settings ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
