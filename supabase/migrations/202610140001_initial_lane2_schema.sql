-- Lane2 production data model.
--
-- The browser prototype stores one nested JSON document. This migration
-- normalises identities, course access, submissions, interactions and reviews
-- so that independent edits are transactional and can be authorised with RLS.

create extension if not exists pgcrypto;
create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  first_name text not null default '',
  initials text not null default '',
  email text not null default '',
  default_role text not null default 'lecturer'
    check (default_role in ('course_admin', 'coordinator', 'lecturer', 'teaching_assistant', 'marker', 'student')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  code text not null,
  name text not null,
  semester text not null default '',
  badge text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_memberships (
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null
    check (role in ('course_admin', 'coordinator', 'lecturer', 'teaching_assistant', 'marker')),
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  auth_user_id uuid unique references public.profiles(id) on delete set null,
  institutional_id text,
  first_name text not null,
  last_name text not null,
  email text not null default '',
  avatar text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index students_institutional_id_key
  on public.students (lower(institutional_id))
  where institutional_id is not null and institutional_id <> '';

create table public.enrolments (
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  group_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (course_id, student_id)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  short_name text not null,
  description text not null default '',
  due_date date,
  word_limit integer not null default 0 check (word_limit >= 0),
  lane smallint not null default 2 check (lane > 0),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assignments_course_due_idx on public.assignments (course_id, due_date);

create table public.rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  criterion_type text not null check (criterion_type in ('rule', 'custom')),
  rule_key text,
  name text,
  description text not null default '',
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, legacy_id),
  check (
    (criterion_type = 'rule' and rule_key is not null)
    or (criterion_type = 'custom' and name is not null)
  )
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  stage text not null default 'not_started'
    check (stage in ('not_started', 'logs_attached', 'handed_in')),
  declaration text check (declaration is null or declaration in ('ai_used', 'no_ai')),
  logs_attached_at timestamptz,
  handed_in_at timestamptz,
  final_text text not null default '',
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id),
  check (handed_in_at is null or logs_attached_at is null or handed_in_at >= logs_attached_at)
);

create index submissions_assignment_stage_idx on public.submissions (assignment_id, stage);
create index submissions_student_idx on public.submissions (student_id);

create table public.interaction_sources (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  source_type text not null default 'link',
  tool text not null default '',
  url text not null default '',
  storage_path text,
  attached_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  step integer not null check (step > 0),
  task text not null default '',
  tool text not null default '',
  prompt text not null default '',
  output text not null default '',
  critique text not null default '',
  critique_source text not null default '',
  pushback boolean not null default false,
  pushback_text text not null default '',
  student_decision text not null default 'unrecorded'
    check (student_decision in ('changed', 'not_used', 'unchanged', 'unrecorded')),
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, step)
);

create index interactions_submission_idx on public.interactions (submission_id, step);

-- A review belongs to a marker. This avoids one marker overwriting another and
-- gives moderation an explicit record of who made each judgement.
create table public.submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'not_reviewed'
    check (status in ('not_reviewed', 'in_progress', 'reviewed')),
  decision text check (decision is null or decision in ('approve', 'flag')),
  comment text not null default '',
  seconds_spent integer not null default 0 check (seconds_spent >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, reviewer_id)
);

create index submission_reviews_reviewer_status_idx
  on public.submission_reviews (reviewer_id, status);

create table public.rubric_marks (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.submission_reviews(id) on delete cascade,
  interaction_id uuid not null references public.interactions(id) on delete cascade,
  criterion_id uuid not null references public.rubric_criteria(id) on delete cascade,
  mark text check (mark is null or mark in ('approve', 'flag')),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id, interaction_id, criterion_id)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  course_id uuid references public.courses(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_events_course_created_idx on public.audit_events (course_id, created_at desc);

create or replace function private.is_course_staff(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = target_course_id
      and (
        c.created_by = (select auth.uid())
        or exists (
          select 1 from public.course_memberships cm
          where cm.course_id = c.id and cm.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function private.is_course_admin(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.courses c
    where c.id = target_course_id
      and (
        c.created_by = (select auth.uid())
        or exists (
          select 1 from public.course_memberships cm
          where cm.course_id = c.id
            and cm.user_id = (select auth.uid())
            and cm.role in ('course_admin', 'coordinator')
        )
      )
  );
$$;

create or replace function private.is_submission_student(target_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submissions s
    join public.students st on st.id = s.student_id
    where s.id = target_submission_id and st.auth_user_id = (select auth.uid())
  );
$$;

create or replace function private.course_for_submission(target_submission_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.course_id
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  where s.id = target_submission_id;
$$;

create or replace function private.course_for_interaction(target_interaction_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.course_id
  from public.interactions i
  join public.submissions s on s.id = i.submission_id
  join public.assignments a on a.id = s.assignment_id
  where i.id = target_interaction_id;
$$;

create or replace function private.course_for_review(target_review_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.course_id
  from public.submission_reviews r
  join public.submissions s on s.id = r.submission_id
  join public.assignments a on a.id = s.assignment_id
  where r.id = target_review_id;
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, first_name, initials, email, default_role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, ''), '@', 1), 'New user'),
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'initials', ''),
    coalesce(new.email, ''),
    case
      when new.raw_user_meta_data ->> 'default_role' in ('course_admin', 'coordinator', 'lecturer', 'teaching_assistant', 'marker', 'student')
        then new.raw_user_meta_data ->> 'default_role'
      else 'lecturer'
    end
  );
  return new;
end;
$$;

create or replace function private.add_course_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.course_memberships (course_id, user_id, role)
  values (new.id, new.created_by, 'course_admin')
  on conflict (course_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.create_profile_for_auth_user();

create trigger on_course_created
  after insert on public.courses
  for each row execute function private.add_course_creator_membership();

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger courses_set_updated_at before update on public.courses
  for each row execute function private.set_updated_at();
create trigger students_set_updated_at before update on public.students
  for each row execute function private.set_updated_at();
create trigger assignments_set_updated_at before update on public.assignments
  for each row execute function private.set_updated_at();
create trigger rubric_criteria_set_updated_at before update on public.rubric_criteria
  for each row execute function private.set_updated_at();
create trigger submissions_set_updated_at before update on public.submissions
  for each row execute function private.set_updated_at();
create trigger interactions_set_updated_at before update on public.interactions
  for each row execute function private.set_updated_at();
create trigger submission_reviews_set_updated_at before update on public.submission_reviews
  for each row execute function private.set_updated_at();
create trigger rubric_marks_set_updated_at before update on public.rubric_marks
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_memberships enable row level security;
alter table public.students enable row level security;
alter table public.enrolments enable row level security;
alter table public.assignments enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.submissions enable row level security;
alter table public.interaction_sources enable row level security;
alter table public.interactions enable row level security;
alter table public.submission_reviews enable row level security;
alter table public.rubric_marks enable row level security;
alter table public.audit_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.course_memberships to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.enrolments to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, update, delete on public.rubric_criteria to authenticated;
grant select, insert, update, delete on public.submissions to authenticated;
grant select, insert, update, delete on public.interaction_sources to authenticated;
grant select, insert, update, delete on public.interactions to authenticated;
grant select, insert, update, delete on public.submission_reviews to authenticated;
grant select, insert, update, delete on public.rubric_marks to authenticated;
grant select, insert on public.audit_events to authenticated;
grant usage, select on sequence public.audit_events_id_seq to authenticated;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_course_staff(uuid) to authenticated;
grant execute on function private.is_course_admin(uuid) to authenticated;
grant execute on function private.is_submission_student(uuid) to authenticated;
grant execute on function private.course_for_submission(uuid) to authenticated;
grant execute on function private.course_for_interaction(uuid) to authenticated;
grant execute on function private.course_for_review(uuid) to authenticated;

create policy profiles_select_shared_course on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.course_memberships mine
      join public.course_memberships theirs on theirs.course_id = mine.course_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy courses_select_staff on public.courses
  for select to authenticated using (private.is_course_staff(id));
create policy courses_insert_creator on public.courses
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy courses_update_admin on public.courses
  for update to authenticated using (private.is_course_admin(id)) with check (private.is_course_admin(id));
create policy courses_delete_admin on public.courses
  for delete to authenticated using (private.is_course_admin(id));

create policy memberships_select_staff on public.course_memberships
  for select to authenticated using (private.is_course_staff(course_id));
create policy memberships_insert_admin on public.course_memberships
  for insert to authenticated with check (private.is_course_admin(course_id));
create policy memberships_update_admin on public.course_memberships
  for update to authenticated using (private.is_course_admin(course_id)) with check (private.is_course_admin(course_id));
create policy memberships_delete_admin on public.course_memberships
  for delete to authenticated using (private.is_course_admin(course_id));

create policy students_select_course_or_self on public.students
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or exists (
      select 1 from public.enrolments e
      where e.student_id = students.id and private.is_course_staff(e.course_id)
    )
  );
create policy students_insert_staff on public.students
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy students_update_course_or_self on public.students
  for update to authenticated
  using (
    auth_user_id = (select auth.uid())
    or exists (
      select 1 from public.enrolments e
      where e.student_id = students.id and private.is_course_admin(e.course_id)
    )
  );
create policy students_delete_admin on public.students
  for delete to authenticated
  using (
    not exists (select 1 from public.enrolments e where e.student_id = students.id)
    and created_by = (select auth.uid())
  );

create policy enrolments_select_course_or_self on public.enrolments
  for select to authenticated
  using (
    private.is_course_staff(course_id)
    or exists (
      select 1 from public.students s
      where s.id = enrolments.student_id and s.auth_user_id = (select auth.uid())
    )
  );
create policy enrolments_insert_admin on public.enrolments
  for insert to authenticated with check (private.is_course_admin(course_id));
create policy enrolments_update_admin on public.enrolments
  for update to authenticated using (private.is_course_admin(course_id)) with check (private.is_course_admin(course_id));
create policy enrolments_delete_admin on public.enrolments
  for delete to authenticated using (private.is_course_admin(course_id));

create policy assignments_select_course on public.assignments
  for select to authenticated
  using (
    private.is_course_staff(course_id)
    or exists (
      select 1
      from public.enrolments e
      join public.students s on s.id = e.student_id
      where e.course_id = assignments.course_id and s.auth_user_id = (select auth.uid())
    )
  );
create policy assignments_insert_admin on public.assignments
  for insert to authenticated with check (private.is_course_admin(course_id));
create policy assignments_update_admin on public.assignments
  for update to authenticated using (private.is_course_admin(course_id)) with check (private.is_course_admin(course_id));
create policy assignments_delete_admin on public.assignments
  for delete to authenticated using (private.is_course_admin(course_id));

create policy criteria_select_course on public.rubric_criteria
  for select to authenticated
  using (private.is_course_staff((select a.course_id from public.assignments a where a.id = assignment_id)));
create policy criteria_insert_admin on public.rubric_criteria
  for insert to authenticated
  with check (private.is_course_admin((select a.course_id from public.assignments a where a.id = assignment_id)));
create policy criteria_update_admin on public.rubric_criteria
  for update to authenticated
  using (private.is_course_admin((select a.course_id from public.assignments a where a.id = assignment_id)))
  with check (private.is_course_admin((select a.course_id from public.assignments a where a.id = assignment_id)));
create policy criteria_delete_admin on public.rubric_criteria
  for delete to authenticated
  using (private.is_course_admin((select a.course_id from public.assignments a where a.id = assignment_id)));

create policy submissions_select_course_or_self on public.submissions
  for select to authenticated
  using (
    private.is_course_staff((select a.course_id from public.assignments a where a.id = assignment_id))
    or exists (
      select 1 from public.students st
      where st.id = submissions.student_id and st.auth_user_id = (select auth.uid())
    )
  );
create policy submissions_insert_course_or_self on public.submissions
  for insert to authenticated
  with check (
    private.is_course_admin((select a.course_id from public.assignments a where a.id = assignment_id))
    or exists (
      select 1 from public.students st
      where st.id = submissions.student_id and st.auth_user_id = (select auth.uid())
    )
  );
create policy submissions_update_course_or_self on public.submissions
  for update to authenticated
  using (
    private.is_course_staff((select a.course_id from public.assignments a where a.id = assignment_id))
    or exists (
      select 1 from public.students st
      where st.id = submissions.student_id and st.auth_user_id = (select auth.uid())
    )
  );
create policy submissions_delete_admin on public.submissions
  for delete to authenticated
  using (private.is_course_admin((select a.course_id from public.assignments a where a.id = assignment_id)));

create policy sources_select_course_or_self on public.interaction_sources
  for select to authenticated
  using (private.is_course_staff(private.course_for_submission(submission_id)) or private.is_submission_student(submission_id));
create policy sources_insert_course_or_self on public.interaction_sources
  for insert to authenticated
  with check (private.is_course_staff(private.course_for_submission(submission_id)) or private.is_submission_student(submission_id));
create policy sources_update_course_or_self on public.interaction_sources
  for update to authenticated
  using (private.is_course_staff(private.course_for_submission(submission_id)) or private.is_submission_student(submission_id));
create policy sources_delete_course_or_self on public.interaction_sources
  for delete to authenticated
  using (private.is_course_admin(private.course_for_submission(submission_id)) or private.is_submission_student(submission_id));

create policy interactions_select_course_or_self on public.interactions
  for select to authenticated
  using (private.is_course_staff(private.course_for_submission(submission_id)) or private.is_submission_student(submission_id));
create policy interactions_insert_course_or_self on public.interactions
  for insert to authenticated
  with check (private.is_course_staff(private.course_for_submission(submission_id)) or private.is_submission_student(submission_id));
create policy interactions_update_course_or_self on public.interactions
  for update to authenticated
  using (private.is_course_staff(private.course_for_submission(submission_id)) or private.is_submission_student(submission_id));
create policy interactions_delete_course_or_self on public.interactions
  for delete to authenticated
  using (private.is_course_admin(private.course_for_submission(submission_id)) or private.is_submission_student(submission_id));

-- Review material is staff-only. A marker can change only their own review;
-- course admins can read all reviews for moderation.
create policy reviews_select_staff on public.submission_reviews
  for select to authenticated
  using (private.is_course_staff(private.course_for_submission(submission_id)));
create policy reviews_insert_self on public.submission_reviews
  for insert to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and private.is_course_staff(private.course_for_submission(submission_id))
  );
create policy reviews_update_self on public.submission_reviews
  for update to authenticated
  using (reviewer_id = (select auth.uid()))
  with check (
    reviewer_id = (select auth.uid())
    and private.is_course_staff(private.course_for_submission(submission_id))
  );
create policy reviews_delete_self_or_admin on public.submission_reviews
  for delete to authenticated
  using (
    reviewer_id = (select auth.uid())
    or private.is_course_admin(private.course_for_submission(submission_id))
  );

create policy marks_select_staff on public.rubric_marks
  for select to authenticated
  using (private.is_course_staff(private.course_for_review(review_id)));
create policy marks_insert_own_review on public.rubric_marks
  for insert to authenticated
  with check (
    exists (
      select 1 from public.submission_reviews r
      where r.id = rubric_marks.review_id and r.reviewer_id = (select auth.uid())
    )
    and private.course_for_interaction(interaction_id) = private.course_for_review(review_id)
  );
create policy marks_update_own_review on public.rubric_marks
  for update to authenticated
  using (
    exists (
      select 1 from public.submission_reviews r
      where r.id = rubric_marks.review_id and r.reviewer_id = (select auth.uid())
    )
  );
create policy marks_delete_own_review on public.rubric_marks
  for delete to authenticated
  using (
    exists (
      select 1 from public.submission_reviews r
      where r.id = rubric_marks.review_id and r.reviewer_id = (select auth.uid())
    )
  );

create policy audit_select_course_admin on public.audit_events
  for select to authenticated using (private.is_course_admin(course_id));
create policy audit_insert_actor on public.audit_events
  for insert to authenticated
  with check (actor_id = (select auth.uid()) and private.is_course_staff(course_id));
