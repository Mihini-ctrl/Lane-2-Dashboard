-- Let course staff remove stored files before deleting an assignment or course.
-- The submission still exists when Storage checks this policy.

create or replace function private.submission_file_staff_access(object_name text)
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
  return private.is_course_staff(private.course_for_submission(target));
end;
$$;

revoke all on function private.submission_file_staff_access(text) from public, anon;
grant execute on function private.submission_file_staff_access(text) to authenticated, service_role;

do $storage$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Supabase Storage is not available here, so the staff delete policy was not created.';
    return;
  end if;

  execute 'drop policy if exists submission_files_delete_staff on storage.objects';
  execute $p$create policy submission_files_delete_staff on storage.objects for delete to authenticated
    using (bucket_id = 'submission-files' and private.submission_file_staff_access(name))$p$;
end;
$storage$;

