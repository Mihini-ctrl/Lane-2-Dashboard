-- The API gives users a friendly validation error. This trigger is the final
-- guard so direct calls to Supabase Auth cannot create accounts for personal
-- or lookalike domains.

create or replace function private.require_university_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
begin
  if email_domain not in ('aucklanduni.ac.nz', 'auckland.ac.nz') then
    raise exception 'A University of Auckland email address is required.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists require_university_email on auth.users;
create trigger require_university_email
  before insert or update of email on auth.users
  for each row execute function private.require_university_email();

notify pgrst, 'reload schema';
