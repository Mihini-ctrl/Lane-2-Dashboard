-- A course insert returns the newly created row to the API. The original
-- select policy checked access only through private.is_course_staff(id), which
-- queries courses again. During INSERT ... RETURNING that helper cannot see
-- the row soon enough for the returning-row RLS check, so valid creators get
-- SQLSTATE 42501 even though created_by = auth.uid(). Check the creator
-- directly, and keep the helper for every other member of the course staff.

drop policy if exists courses_select_staff on public.courses;
create policy courses_select_staff on public.courses
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or private.is_course_staff(id)
  );

notify pgrst, 'reload schema';
