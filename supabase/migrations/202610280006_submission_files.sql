-- Keep each handed-in assignment file (PDF or Word, up to 10 MB) in a private
-- Supabase Storage bucket, so the teacher can open the original file from any
-- computer. Until now only the text read from the file reached the database.
--
-- Files are stored at '<submission id>/<random name>.<pdf|doc|docx>'.
-- The student can add or replace their own file while the assignment is open.
-- The student and the course's teaching staff can read it. Nobody else can.

alter table public.submissions
  add column if not exists file_name text
    check (file_name is null or char_length(file_name) between 1 and 255),
  add column if not exists file_size integer
    check (file_size is null or (file_size > 0 and file_size <= 10485760)),
  add column if not exists file_type text not null default '',
  add column if not exists file_path text,
  add column if not exists file_uploaded_at timestamptz;

-- Open until the end of the due date in New Zealand (the same rule as hand_in_submission).
create or replace function private.submission_is_open(target_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.due_date is null or now() < ((a.due_date + 1)::timestamp at time zone 'Pacific/Auckland')
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id = target_submission_id
  ), false);
$$;

-- Storage policy check. A path that does not start with a submission id is refused.
create or replace function private.submission_file_access(object_name text, for_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder text := split_part(coalesce(object_name, ''), '/', 1);
  target uuid;
begin
  if folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  target := folder::uuid;
  if for_write then
    return private.is_submission_student(target) and private.submission_is_open(target);
  end if;
  return private.is_submission_student(target)
    or private.is_course_staff(private.course_for_submission(target));
end;
$$;

revoke all on function private.submission_is_open(uuid) from public, anon;
revoke all on function private.submission_file_access(text, boolean) from public, anon;
grant execute on function private.submission_is_open(uuid) to authenticated, service_role;
grant execute on function private.submission_file_access(text, boolean) to authenticated, service_role;

-- Record the stored file on the submission. Returns the previous path so the
-- server can remove the file it replaces.
create or replace function public.attach_submission_file(
  target_submission_id uuid,
  file_name text,
  file_size integer,
  file_type text,
  file_path text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous text;
begin
  perform 1 from public.submissions s where s.id = target_submission_id for update;
  if not found then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;
  if not private.is_submission_student(target_submission_id) then
    raise exception 'Only the student can add a file to their own work.' using errcode = '42501';
  end if;
  if not private.submission_is_open(target_submission_id) then
    raise exception 'This assignment has closed, so it can no longer be handed in.' using errcode = 'LN001';
  end if;
  if split_part(coalesce(attach_submission_file.file_path, ''), '/', 1) <> target_submission_id::text
     or attach_submission_file.file_path !~* '\.(pdf|docx?)$' then
    raise exception 'The file path does not belong to this submission.' using errcode = '23514';
  end if;
  if attach_submission_file.file_size is null or attach_submission_file.file_size <= 0
     or attach_submission_file.file_size > 10485760 then
    raise exception 'Files must be 10 MB or smaller.' using errcode = '23514';
  end if;

  select s.file_path into previous from public.submissions s where s.id = target_submission_id;
  update public.submissions s set
    file_name = left(btrim(attach_submission_file.file_name), 255),
    file_size = attach_submission_file.file_size,
    file_type = coalesce(attach_submission_file.file_type, ''),
    file_path = attach_submission_file.file_path,
    file_uploaded_at = now()
  where s.id = target_submission_id;
  return previous;
end;
$$;

revoke all on function public.attach_submission_file(uuid, text, integer, text, text) from public, anon;
grant execute on function public.attach_submission_file(uuid, text, integer, text, text) to authenticated;

-- The bucket and its policies exist only on Supabase (the local test database has no Storage).
do $storage$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Supabase Storage is not available here, so the submission-files bucket was not created.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('submission-files', 'submission-files', false, 10485760, array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ])
  on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists submission_files_read on storage.objects';
  execute 'drop policy if exists submission_files_insert on storage.objects';
  execute 'drop policy if exists submission_files_delete on storage.objects';
  execute $p$create policy submission_files_read on storage.objects for select to authenticated
    using (bucket_id = 'submission-files' and private.submission_file_access(name, false))$p$;
  execute $p$create policy submission_files_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'submission-files' and private.submission_file_access(name, true))$p$;
  execute $p$create policy submission_files_delete on storage.objects for delete to authenticated
    using (bucket_id = 'submission-files' and private.submission_file_access(name, true))$p$;
end;
$storage$;

notify pgrst, 'reload schema';
