-- Written critique of AI use, pasted chat logs and AI evaluation results.
--
-- Students hand in their work, their whole AI chat (pasted) and a critique of
-- how they used AI (three guided answers). The chat is later split into steps
-- (public.interactions: prompt, output and the student's reaction). AI
-- evaluation labels the work and checks the critique against the chat; each
-- claim in the critique is linked to the steps it is about, so the database
-- links students -> submissions -> steps -> prompts/outputs/reflections ->
-- critique claims.
--
-- Students can write their own critique but can never read its level or
-- Gemini's verdicts: those tables are staff-only.

-- ---------------------------------------------------------------------------
-- 1. Hand-in content kept on the submission
-- ---------------------------------------------------------------------------
alter table public.submissions
  add column if not exists chat_log text not null default ''
    check (char_length(chat_log) <= 200000),
  add column if not exists ai_tool text not null default ''
    check (char_length(ai_tool) <= 60),
  add column if not exists ai_split boolean not null default false,
  add column if not exists hand_in_count integer not null default 0
    check (hand_in_count >= 0);

-- ---------------------------------------------------------------------------
-- 2. The student's written critique: one per submission
-- ---------------------------------------------------------------------------
create table public.submission_critiques (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  used_for text not null check (char_length(btrim(used_for)) between 1 and 4000),
  checked text not null check (char_length(btrim(checked)) between 1 and 4000),
  changed text not null check (char_length(btrim(changed)) between 1 and 4000),
  word_count integer not null default 0 check (word_count >= 0),
  written_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Words counted the same way as public/js/engine.js (letters, digits and %).
create or replace function private.word_count(value text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from regexp_matches(lower(replace(replace(coalesce(value, ''), '''', ''), '’', '')), '[a-z0-9%]+', 'g');
$$;

-- The minimum length comes from the assignment's "Short written critique"
-- flag rule, so one teacher setting controls both the flag and hand-in.
create or replace function private.critique_min_words(target_submission_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce((a.settings -> 'rules' -> 'critiqueShort' ->> 'enabled')::boolean, true) = false then 0
    when a.settings -> 'rules' -> 'critiqueShort' ? 'minWords'
      then greatest(0, (a.settings -> 'rules' -> 'critiqueShort' ->> 'minWords')::integer)
    when a.settings ->> 'preset' = 'lenient' then 30
    when a.settings ->> 'preset' = 'strict' then 70
    else 45
  end
  from public.submissions s
  join public.assignments a on a.id = s.assignment_id
  where s.id = target_submission_id;
$$;

create or replace function private.check_critique()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  needed integer;
begin
  new.word_count := private.word_count(new.used_for || ' ' || new.checked || ' ' || new.changed);
  needed := coalesce(private.critique_min_words(new.submission_id), 0);
  if new.word_count < needed then
    raise exception 'Your critique is % words. Write at least % words across the three questions.', new.word_count, needed
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger submission_critiques_check
  before insert or update on public.submission_critiques
  for each row execute function private.check_critique();
create trigger submission_critiques_set_updated_at before update on public.submission_critiques
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. AI evaluation of a submission (staff only)
-- ---------------------------------------------------------------------------
-- Sentence labels stay JSON: they are regenerated on every run and only ever
-- read whole, like assignment settings. Their step references are interaction
-- ids from this submission.
create table public.ai_evaluations (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  submission_revision integer not null check (submission_revision > 0),
  model text not null check (char_length(model) between 1 and 100),
  detection jsonb not null default '{}'::jsonb check (jsonb_typeof(detection) = 'object'),
  summary text not null default '' check (char_length(summary) <= 2000),
  sentences jsonb not null default '[]'::jsonb check (jsonb_typeof(sentences) = 'array'),
  step_info jsonb not null default '{}'::jsonb check (jsonb_typeof(step_info) = 'object'),
  text_length integer not null default 0 check (text_length >= 0),
  ran_by uuid references public.profiles(id) on delete set null,
  ran_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_evaluations_set_updated_at before update on public.ai_evaluations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Gemini's check of the written critique (staff only), claim by claim
-- ---------------------------------------------------------------------------
create table public.critique_assessments (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  submission_revision integer not null check (submission_revision > 0),
  level smallint not null check (level between 0 and 4),
  written_depth smallint not null check (written_depth between 0 and 4),
  chat_depth smallint not null check (chat_depth between 0 and 4),
  accuracy text not null check (accuracy in ('matches', 'partly', 'does_not_match')),
  ai_written text not null check (ai_written in ('unlikely', 'possible', 'likely')),
  ai_written_reason text not null default '' check (char_length(ai_written_reason) <= 600),
  summary text not null default '' check (char_length(summary) <= 1200),
  model text not null default '',
  assessed_by uuid references public.profiles(id) on delete set null,
  assessed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger critique_assessments_set_updated_at before update on public.critique_assessments
  for each row execute function private.set_updated_at();

create table public.critique_claims (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.critique_assessments(submission_id) on delete cascade,
  position integer not null check (position >= 0),
  claim text not null check (char_length(btrim(claim)) between 1 and 300),
  verdict text not null check (verdict in ('supported', 'not_found', 'contradicted')),
  created_at timestamptz not null default now(),
  unique (submission_id, position)
);

-- Which steps of the chat a claim is about.
create table public.critique_claim_steps (
  claim_id uuid not null references public.critique_claims(id) on delete cascade,
  interaction_id uuid not null references public.interactions(id) on delete cascade,
  primary key (claim_id, interaction_id)
);

create index critique_claim_steps_interaction_idx on public.critique_claim_steps (interaction_id);

-- A claim can only point at steps from the same submission.
create or replace function private.check_claim_step()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.critique_claims c
    join public.interactions i on i.submission_id = c.submission_id
    where c.id = new.claim_id and i.id = new.interaction_id
  ) then
    raise exception 'A critique claim can only link to steps from the same submission.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger critique_claim_steps_same_submission
  before insert or update on public.critique_claim_steps
  for each row execute function private.check_claim_step();

create or replace function private.course_for_claim(target_claim_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.course_for_submission(c.submission_id)
  from public.critique_claims c
  where c.id = target_claim_id;
$$;

-- ---------------------------------------------------------------------------
-- 5. Access
-- ---------------------------------------------------------------------------
-- Fix: the students and enrolments policies referred to each other, so any
-- query made by a student failed with "infinite recursion detected in policy".
-- A security-definer check of "is this my student record" breaks the loop.
create or replace function private.is_own_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students st
    where st.id = target_student_id and st.auth_user_id = (select auth.uid())
  );
$$;
grant execute on function private.is_own_student(uuid) to authenticated;

drop policy if exists enrolments_select_course_or_self on public.enrolments;
create policy enrolments_select_course_or_self on public.enrolments
  for select to authenticated
  using (private.is_course_staff(course_id) or private.is_own_student(student_id));

alter table public.submission_critiques enable row level security;
alter table public.ai_evaluations enable row level security;
alter table public.critique_assessments enable row level security;
alter table public.critique_claims enable row level security;
alter table public.critique_claim_steps enable row level security;

grant select, insert, update, delete on public.submission_critiques to authenticated;
grant select, insert, update, delete on public.ai_evaluations to authenticated;
grant select, insert, update, delete on public.critique_assessments to authenticated;
grant select, insert, update, delete on public.critique_claims to authenticated;
grant select, insert, update, delete on public.critique_claim_steps to authenticated;
grant execute on function private.course_for_claim(uuid) to authenticated;
grant execute on function private.critique_min_words(uuid) to authenticated;
grant execute on function private.word_count(text) to authenticated;

-- The critique: staff of the course read it; only the student writes it.
create policy critiques_select_course_or_self on public.submission_critiques
  for select to authenticated
  using (private.is_course_staff(private.course_for_submission(submission_id)) or private.is_submission_student(submission_id));
create policy critiques_insert_self on public.submission_critiques
  for insert to authenticated
  with check (private.is_submission_student(submission_id));
create policy critiques_update_self on public.submission_critiques
  for update to authenticated
  using (private.is_submission_student(submission_id))
  with check (private.is_submission_student(submission_id));
create policy critiques_delete_admin on public.submission_critiques
  for delete to authenticated
  using (private.is_course_admin(private.course_for_submission(submission_id)));

-- AI evaluation and the critique check: course staff only. Students never see
-- their critique level or Gemini's verdicts.
create policy evaluations_staff on public.ai_evaluations
  for all to authenticated
  using (private.is_course_staff(private.course_for_submission(submission_id)))
  with check (private.is_course_staff(private.course_for_submission(submission_id)));
create policy assessments_staff on public.critique_assessments
  for all to authenticated
  using (private.is_course_staff(private.course_for_submission(submission_id)))
  with check (private.is_course_staff(private.course_for_submission(submission_id)));
create policy claims_staff on public.critique_claims
  for all to authenticated
  using (private.is_course_staff(private.course_for_submission(submission_id)))
  with check (private.is_course_staff(private.course_for_submission(submission_id)));
create policy claim_steps_staff on public.critique_claim_steps
  for all to authenticated
  using (private.is_course_staff(private.course_for_claim(claim_id)))
  with check (private.is_course_staff(private.course_for_claim(claim_id)));

-- ---------------------------------------------------------------------------
-- 6. Hand in: one transaction, run as the student so RLS still applies
-- ---------------------------------------------------------------------------
create or replace function public.hand_in_submission(
  target_submission_id uuid,
  final_text text,
  chat_log text,
  ai_tool text,
  used_for text,
  checked text,
  changed text,
  expected_revision integer default null
)
returns public.submissions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_row public.submissions;
  due date;
  log_changed boolean;
begin
  select * into current_row from public.submissions s where s.id = target_submission_id for update;
  if not found then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;
  if not private.is_submission_student(target_submission_id) then
    raise exception 'Only the student can hand in their own work.' using errcode = '42501';
  end if;
  if expected_revision is not null and current_row.revision <> expected_revision then
    raise exception 'This submission changed in another tab. Reload it before handing in.' using errcode = '40001';
  end if;
  select a.due_date into due from public.assignments a where a.id = current_row.assignment_id;
  -- Open until the end of the due date in New Zealand.
  if due is not null and now() >= ((due + 1)::timestamp at time zone 'Pacific/Auckland') then
    raise exception 'This assignment has closed, so it can no longer be handed in.' using errcode = 'LN001';
  end if;
  if char_length(btrim(coalesce(chat_log, ''))) = 0 then
    raise exception 'Paste your AI chat history before handing in.' using errcode = '23514';
  end if;

  log_changed := chat_log is distinct from current_row.chat_log or current_row.logs_attached_at is null;
  if log_changed then
    -- A new paste replaces the earlier steps and source.
    delete from public.interactions i where i.submission_id = target_submission_id;
    delete from public.interaction_sources src where src.submission_id = target_submission_id;
    insert into public.interaction_sources (submission_id, source_type, tool, attached_at)
    values (target_submission_id, 'pasted', coalesce(ai_tool, ''), now());
  end if;

  update public.submissions s set
    stage = 'handed_in',
    declaration = 'ai_used',
    final_text = coalesce(hand_in_submission.final_text, ''),
    chat_log = hand_in_submission.chat_log,
    ai_tool = coalesce(hand_in_submission.ai_tool, ''),
    logs_attached_at = case when log_changed then now() else s.logs_attached_at end,
    ai_split = case when log_changed then false else s.ai_split end,
    handed_in_at = now(),
    hand_in_count = s.hand_in_count + 1,
    revision = s.revision + 1
  where s.id = target_submission_id
  returning * into current_row;

  insert into public.submission_critiques (submission_id, used_for, checked, changed, written_at)
  values (target_submission_id, used_for, checked, changed, now())
  on conflict (submission_id) do update set
    used_for = excluded.used_for, checked = excluded.checked,
    changed = excluded.changed, written_at = excluded.written_at;

  return current_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Save an AI evaluation: one transaction, run as the marker
-- ---------------------------------------------------------------------------
-- payload: { model, detection, summary, textLength,
--            sentences: [{ text, para, source, steps: [step numbers] }],
--            steps: [{ step, task, purpose, use }],
--            splitSteps: [{ step, task, tool, prompt, output, reaction, decision }],   (first split of a pasted log)
--            critique: null | { level, writtenDepth, chatDepth, accuracy, aiWritten,
--                               aiWrittenReason, summary, claims: [{ claim, verdict, steps: [step numbers] }] } }
create or replace function public.save_ai_evaluation(target_submission_id uuid, payload jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sub public.submissions;
  mapped_sentences jsonb;
  mapped_steps jsonb;
  claim_row jsonb;
  claim_pos bigint;
  new_claim_id uuid;
begin
  select * into sub from public.submissions s where s.id = target_submission_id;
  if not found then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;
  if not private.is_course_staff(private.course_for_submission(target_submission_id)) then
    raise exception 'Only teaching staff can save an AI evaluation.' using errcode = '42501';
  end if;

  -- The first run on a pasted log splits it into steps.
  if jsonb_typeof(payload -> 'splitSteps') = 'array' and jsonb_array_length(payload -> 'splitSteps') > 0
     and not exists (select 1 from public.interactions i where i.submission_id = target_submission_id) then
    insert into public.interactions (submission_id, step, task, tool, prompt, output, critique, critique_source,
                                     pushback, pushback_text, student_decision, occurred_at)
    select target_submission_id, x.step, coalesce(x.task, ''), coalesce(x.tool, ''), coalesce(x.prompt, ''),
           coalesce(x.output, ''), coalesce(x.reaction, ''), case when coalesce(x.reaction, '') <> '' then 'chat' else 'none' end,
           false, coalesce(x.reaction, ''),
           case when x.decision in ('changed', 'not_used', 'unchanged') then x.decision else 'unrecorded' end,
           coalesce(sub.logs_attached_at, sub.handed_in_at)
    from jsonb_to_recordset(payload -> 'splitSteps')
      as x(step integer, task text, tool text, prompt text, output text, reaction text, decision text);
    update public.submissions s set ai_split = true where s.id = target_submission_id;
  end if;

  -- Step numbers -> this submission's interaction ids.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'text', sen ->> 'text',
             'para', coalesce((sen ->> 'para')::integer, 0),
             'source', sen ->> 'source',
             'steps', coalesce((
               select jsonb_agg(i.id order by i.step)
               from jsonb_array_elements_text(coalesce(sen -> 'steps', '[]'::jsonb)) n
               join public.interactions i on i.submission_id = target_submission_id and i.step = n::integer
             ), '[]'::jsonb)
           ) order by ord), '[]'::jsonb)
    into mapped_sentences
  from jsonb_array_elements(coalesce(payload -> 'sentences', '[]'::jsonb)) with ordinality as t(sen, ord);

  select coalesce(jsonb_object_agg(i.id::text, jsonb_build_object('task', st ->> 'task', 'purpose', st ->> 'purpose', 'use', st ->> 'use')), '{}'::jsonb)
    into mapped_steps
  from jsonb_array_elements(coalesce(payload -> 'steps', '[]'::jsonb)) st
  join public.interactions i on i.submission_id = target_submission_id and i.step = (st ->> 'step')::integer;

  insert into public.ai_evaluations (submission_id, submission_revision, model, detection, summary, sentences, step_info, text_length, ran_by, ran_at)
  values (target_submission_id, sub.revision, coalesce(payload ->> 'model', 'unknown'), coalesce(payload -> 'detection', '{}'::jsonb),
          left(coalesce(payload ->> 'summary', ''), 2000), mapped_sentences, mapped_steps,
          coalesce((payload ->> 'textLength')::integer, 0), (select auth.uid()), now())
  on conflict (submission_id) do update set
    submission_revision = excluded.submission_revision, model = excluded.model, detection = excluded.detection,
    summary = excluded.summary, sentences = excluded.sentences, step_info = excluded.step_info,
    text_length = excluded.text_length, ran_by = excluded.ran_by, ran_at = excluded.ran_at;

  -- The critique check replaces any earlier one (claims and their step links go with it).
  delete from public.critique_assessments ca where ca.submission_id = target_submission_id;
  if jsonb_typeof(payload -> 'critique') = 'object' then
    insert into public.critique_assessments (submission_id, submission_revision, level, written_depth, chat_depth, accuracy,
                                            ai_written, ai_written_reason, summary, model, assessed_by, assessed_at)
    values (target_submission_id, sub.revision,
            (payload -> 'critique' ->> 'level')::smallint, (payload -> 'critique' ->> 'writtenDepth')::smallint,
            (payload -> 'critique' ->> 'chatDepth')::smallint, payload -> 'critique' ->> 'accuracy',
            payload -> 'critique' ->> 'aiWritten', left(coalesce(payload -> 'critique' ->> 'aiWrittenReason', ''), 600),
            left(coalesce(payload -> 'critique' ->> 'summary', ''), 1200), coalesce(payload ->> 'model', ''),
            (select auth.uid()), now());
    for claim_row, claim_pos in
      select value, ordinality - 1 from jsonb_array_elements(coalesce(payload -> 'critique' -> 'claims', '[]'::jsonb)) with ordinality
    loop
      insert into public.critique_claims (submission_id, position, claim, verdict)
      values (target_submission_id, claim_pos, left(claim_row ->> 'claim', 300), claim_row ->> 'verdict')
      returning id into new_claim_id;
      insert into public.critique_claim_steps (claim_id, interaction_id)
      select distinct new_claim_id, i.id
      from jsonb_array_elements_text(coalesce(claim_row -> 'steps', '[]'::jsonb)) n
      join public.interactions i on i.submission_id = target_submission_id and i.step = n::integer;
    end loop;
  end if;
end;
$$;

revoke all on function public.hand_in_submission(uuid, text, text, text, text, text, text, integer) from public, anon;
revoke all on function public.save_ai_evaluation(uuid, jsonb) from public, anon;
grant execute on function public.hand_in_submission(uuid, text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.save_ai_evaluation(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Reporting: one row per submission (RLS of the caller applies)
-- ---------------------------------------------------------------------------
create view public.submission_critique_overview
with (security_invoker = true) as
select
  s.id as submission_id,
  s.assignment_id,
  s.student_id,
  s.stage,
  c.word_count as critique_words,
  c.written_at as critique_written_at,
  ca.level as critique_level,
  ca.written_depth,
  ca.chat_depth,
  ca.accuracy,
  ca.ai_written,
  (ca.submission_revision = s.revision) as assessment_current,
  (select count(*) from public.interactions i where i.submission_id = s.id) as steps,
  (select count(*) from public.critique_claims cl where cl.submission_id = s.id and cl.verdict <> 'supported') as unsupported_claims
from public.submissions s
left join public.submission_critiques c on c.submission_id = s.id
left join public.critique_assessments ca on ca.submission_id = s.id;

grant select on public.submission_critique_overview to authenticated;

notify pgrst, 'reload schema';
