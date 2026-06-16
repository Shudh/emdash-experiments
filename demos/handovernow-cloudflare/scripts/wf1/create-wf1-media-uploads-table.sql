CREATE TABLE IF NOT EXISTS ec_wf_media_uploads (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  status TEXT NOT NULL,
  author_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  scheduled_at TEXT,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  live_revision_id TEXT,
  draft_revision_id TEXT,

  title TEXT,
  lane TEXT NOT NULL,
  purpose TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  owner_user_id TEXT,
  asset_id TEXT,
  interest_id TEXT,
  workflow_instance_id TEXT,
  card_id TEXT,
  draft_id TEXT,
  client_item_id TEXT,
  media_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  upload_state TEXT NOT NULL,
  attached_state TEXT NOT NULL,
  upload_spec TEXT
);

CREATE INDEX IF NOT EXISTS idx_wf_media_uploads_user_created
  ON ec_wf_media_uploads (created_by_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_wf_media_uploads_target_card
  ON ec_wf_media_uploads (card_id, created_at);

CREATE INDEX IF NOT EXISTS idx_wf_media_uploads_asset
  ON ec_wf_media_uploads (asset_id, created_at);

CREATE INDEX IF NOT EXISTS idx_wf_media_uploads_draft
  ON ec_wf_media_uploads (draft_id, created_at);

CREATE INDEX IF NOT EXISTS idx_wf_media_uploads_media_id
  ON ec_wf_media_uploads (media_id);
