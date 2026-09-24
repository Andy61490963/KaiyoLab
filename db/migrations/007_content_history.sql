-- 公開時間獨立於草稿修改時間，既有資料以目前公開時間建立基準
ALTER TABLE entries ADD COLUMN IF NOT EXISTS published_updated_at timestamptz;
UPDATE entries SET published_updated_at = published_at WHERE published IS NOT NULL AND published_updated_at IS NULL;

CREATE TABLE IF NOT EXISTS entry_revisions (
  id text PRIMARY KEY,
  entry_id text NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  content jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('draft', 'published', 'restore')),
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entry_revision_order ON entry_revisions(entry_id, created_at DESC, id DESC);
INSERT INTO entry_revisions(id, entry_id, content, source, version, created_at)
SELECT 'initial-draft-' || id, id, content, 'draft', version, updated_at FROM entries
ON CONFLICT DO NOTHING;
INSERT INTO entry_revisions(id, entry_id, content, source, version, created_at)
SELECT 'initial-published-' || id, id, published, 'published', version, COALESCE(published_at, updated_at)
FROM entries WHERE published IS NOT NULL ON CONFLICT DO NOTHING;

-- 已公開的網址保留給原文章，下架及垃圾桶也不釋放，避免其他內容接管舊連結
CREATE TABLE IF NOT EXISTS entry_slugs (
  kind text NOT NULL CHECK (kind IN ('article', 'project')),
  slug text NOT NULL,
  entry_id text NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  PRIMARY KEY(kind, slug)
);
CREATE INDEX IF NOT EXISTS entry_slug_owner ON entry_slugs(entry_id);
INSERT INTO entry_slugs(kind, slug, entry_id)
SELECT kind, published->>'slug', id FROM entries WHERE published IS NOT NULL
ORDER BY deleted_at NULLS FIRST, published_at DESC, id
ON CONFLICT DO NOTHING;
