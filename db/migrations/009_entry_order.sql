-- 手動順序獨立於草稿、發布版本和編輯時間；既有公開內容保留原先的時間順序
ALTER TABLE entries ADD COLUMN IF NOT EXISTS sort_order integer CHECK (sort_order >= 0);

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY kind
    ORDER BY published_at DESC NULLS LAST,
      CASE WHEN published_at IS NULL THEN updated_at END DESC NULLS LAST,
      id DESC
  )::integer AS position
  FROM entries
)
UPDATE entries
SET sort_order = ranked.position
FROM ranked
WHERE entries.id = ranked.id AND entries.sort_order IS NULL;

ALTER TABLE entries ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE entries ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS entries_manual_order
  ON entries (kind, sort_order, id) WHERE deleted_at IS NULL;
