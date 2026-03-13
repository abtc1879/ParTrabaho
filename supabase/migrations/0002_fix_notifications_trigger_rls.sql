-- Fix: applying to jobs failed with
-- "new row violates row-level security policy for table notifications"
-- because this trigger function inserted into notifications without SECURITY DEFINER.

create or replace function public.notify_client_of_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_title text;
  v_applicant_name text;
begin
  select j.client_id, j.title, concat_ws(' ', p.firstname, p.surname)
  into v_client_id, v_title, v_applicant_name
  from public.jobs j
  left join public.profiles p on p.id = new.freelancer_id
  where j.id = new.job_id;

  if v_client_id is not null then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_client_id,
      'job_application',
      'New Job Application',
      coalesce(nullif(v_applicant_name, ''), 'A freelancer') || ' applied to your job: ' || coalesce(v_title, 'Job Post'),
      jsonb_build_object(
        'job_id', new.job_id,
        'application_id', new.id,
        'freelancer_id', new.freelancer_id,
        'applicant_name', coalesce(nullif(v_applicant_name, ''), 'Freelancer'),
        'cover_letter', coalesce(new.cover_letter, ''),
        'job_title', coalesce(v_title, 'Job Post')
      )
    );
  end if;

  return new;
end;
$$;
