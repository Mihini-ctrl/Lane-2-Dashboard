-- Preserve the prototype's content-marking result alongside the AI-use review
-- when synthetic demonstration records are imported into PostgreSQL.

alter table public.submission_reviews
  add column if not exists content_marks jsonb not null default '{}'::jsonb
    check (jsonb_typeof(content_marks) = 'object'),
  add column if not exists feedback text not null default '',
  add column if not exists content_saved_at timestamptz;

notify pgrst, 'reload schema';
