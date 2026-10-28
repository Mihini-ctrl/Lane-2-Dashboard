-- Connect a confirmed Supabase student account to the roster record that a
-- teacher created for the same university email.  The claim is deliberately
-- performed inside the database so the browser/API never needs a service key.

create or replace function private.is_course_student(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrolments e
    join public.students s on s.id = e.student_id
    where e.course_id = target_course_id
      and s.auth_user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_course_student(uuid) from public, anon;
grant execute on function private.is_course_student(uuid) to authenticated;

drop policy if exists courses_select_student on public.courses;
create policy courses_select_student on public.courses
  for select to authenticated
  using (private.is_course_student(id));

create or replace function public.claim_student_account()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_email text;
  caller_role text;
  matching_ids uuid[];
  student_id uuid;
begin
  if caller_id is null then
    raise exception 'You must be logged in to connect a student account.'
      using errcode = '42501';
  end if;

  select lower(trim(p.email)), p.default_role
    into caller_email, caller_role
  from public.profiles p
  where p.id = caller_id;

  if caller_role is distinct from 'student' then
    raise exception 'This account is not registered as a student.'
      using errcode = '42501';
  end if;

  -- Once linked, keep the stable identity even if an administrator later
  -- corrects the display email on the roster.
  select s.id into student_id
  from public.students s
  where s.auth_user_id = caller_id;
  if student_id is not null then
    return student_id;
  end if;

  select array_agg(s.id order by s.created_at, s.id)
    into matching_ids
  from public.students s
  where lower(trim(s.email)) = caller_email
    and s.auth_user_id is null;

  if coalesce(array_length(matching_ids, 1), 0) = 0 then
    raise exception 'No student enrolment matches %. Ask your teacher to enrol this exact university email, then try again.', caller_email
      using errcode = 'P0002';
  end if;

  if array_length(matching_ids, 1) > 1 then
    raise exception 'More than one student record matches %. Ask your teacher to merge the duplicate records before logging in.', caller_email
      using errcode = '21000';
  end if;

  student_id := matching_ids[1];
  update public.students
  set auth_user_id = caller_id
  where id = student_id and auth_user_id is null;

  if not found then
    raise exception 'This student account was connected elsewhere. Please try again.'
      using errcode = '40001';
  end if;

  return student_id;
end;
$$;

revoke all on function public.claim_student_account() from public, anon;
grant execute on function public.claim_student_account() to authenticated;

notify pgrst, 'reload schema';
