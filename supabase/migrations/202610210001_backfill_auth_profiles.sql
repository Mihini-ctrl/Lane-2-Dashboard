-- Profiles are normally created by the auth.users insert trigger in the
-- initial migration. Backfill users who signed up before that migration was
-- installed so they can immediately create courses after the schema exists.

insert into public.profiles (
  id,
  display_name,
  first_name,
  initials,
  email,
  default_role
)
select
  user_record.id,
  coalesce(
    nullif(user_record.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(coalesce(user_record.email, ''), '@', 1), ''),
    'New user'
  ),
  coalesce(user_record.raw_user_meta_data ->> 'first_name', ''),
  coalesce(user_record.raw_user_meta_data ->> 'initials', ''),
  coalesce(user_record.email, ''),
  case
    when user_record.raw_user_meta_data ->> 'default_role' in (
      'course_admin',
      'coordinator',
      'lecturer',
      'teaching_assistant',
      'marker',
      'student'
    ) then user_record.raw_user_meta_data ->> 'default_role'
    else 'lecturer'
  end
from auth.users as user_record
on conflict (id) do nothing;

-- Make the new schema visible immediately to PostgREST after a dashboard SQL
-- Editor run as well as after a CLI migration.
notify pgrst, 'reload schema';
