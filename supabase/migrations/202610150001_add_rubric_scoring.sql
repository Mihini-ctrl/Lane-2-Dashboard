-- Numeric assignment scoring and a clarification outcome for the unified
-- three-panel marking workspace.

alter table public.rubric_criteria
  add column if not exists max_score numeric(8,2) not null default 10
  check (max_score > 0);

alter table public.submission_reviews
  drop constraint if exists submission_reviews_decision_check;

alter table public.submission_reviews
  add constraint submission_reviews_decision_check
  check (decision is null or decision in ('approve', 'flag', 'clarify'));

create table public.rubric_scores (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.submission_reviews(id) on delete cascade,
  criterion_id uuid not null references public.rubric_criteria(id) on delete cascade,
  score numeric(8,2) check (score is null or score >= 0),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id, criterion_id)
);

create trigger rubric_scores_set_updated_at
before update on public.rubric_scores
for each row execute function private.set_updated_at();

alter table public.rubric_scores enable row level security;
grant select, insert, update, delete on public.rubric_scores to authenticated;

create policy scores_select_staff on public.rubric_scores
for select to authenticated
using (private.is_course_staff(private.course_for_review(review_id)));

create policy scores_insert_own_review on public.rubric_scores
for insert to authenticated
with check (
  exists (
    select 1
    from public.submission_reviews r
    join public.submissions s on s.id = r.submission_id
    join public.rubric_criteria c on c.id = rubric_scores.criterion_id
      and c.assignment_id = s.assignment_id
    where r.id = rubric_scores.review_id and r.reviewer_id = (select auth.uid())
  )
);

create policy scores_update_own_review on public.rubric_scores
for update to authenticated
using (
  exists (
    select 1
    from public.submission_reviews r
    join public.submissions s on s.id = r.submission_id
    join public.rubric_criteria c on c.id = rubric_scores.criterion_id
      and c.assignment_id = s.assignment_id
    where r.id = rubric_scores.review_id and r.reviewer_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.submission_reviews r
    join public.submissions s on s.id = r.submission_id
    join public.rubric_criteria c on c.id = rubric_scores.criterion_id
      and c.assignment_id = s.assignment_id
    where r.id = rubric_scores.review_id and r.reviewer_id = (select auth.uid())
  )
);

create policy scores_delete_own_review on public.rubric_scores
for delete to authenticated
using (
  exists (
    select 1 from public.submission_reviews r
    where r.id = rubric_scores.review_id and r.reviewer_id = (select auth.uid())
  )
);
