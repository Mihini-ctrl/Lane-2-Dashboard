-- Students need to read the published AI-use criteria for assignments in
-- courses they are enrolled in.  They still cannot create, edit or delete
-- criteria, and criteria from other courses remain hidden by RLS.

drop policy if exists criteria_select_student on public.rubric_criteria;
create policy criteria_select_student on public.rubric_criteria
  for select to authenticated
  using (
    private.is_course_student(
      (select a.course_id from public.assignments a where a.id = assignment_id)
    )
  );

notify pgrst, 'reload schema';
