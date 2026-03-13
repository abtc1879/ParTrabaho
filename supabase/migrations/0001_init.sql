create extension if not exists "pgcrypto";

create type public.gender_t as enum ('male', 'female', 'other', 'prefer_not_to_say');
create type public.job_status_t as enum ('open', 'assigned', 'in_progress', 'completed', 'cancelled');
create type public.application_status_t as enum ('pending', 'accepted', 'rejected', 'withdrawn');
create type public.notification_type_t as enum ('job_application', 'job_match', 'application_accepted', 'chat_message', 'job_completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  surname text not null,
  firstname text not null,
  middlename text,
  suffix text,
  birthdate date not null,
  gender public.gender_t not null default 'prefer_not_to_say',
  address text not null,
  expertise text[] not null default '{}',
  avatar_url text,
  rating_avg numeric(2, 1) not null default 0,
  rating_count integer not null default 0,
  jobs_completed_count integer not null default 0,
  jobs_posted_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  required_skill text not null,
  category text,
  salary_php numeric(12, 2) not null check (salary_php >= 0),
  location text not null,
  status public.job_status_t not null default 'open',
  accepted_application_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  cover_letter text,
  status public.application_status_t not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, freelancer_id)
);

alter table public.jobs
  add constraint jobs_accepted_application_id_fkey
  foreign key (accepted_application_id)
  references public.job_applications(id)
  on delete set null;

create table public.job_completions (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  client_marked_done boolean not null default false,
  freelancer_marked_done boolean not null default false,
  completed_at timestamptz
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (job_id, reviewer_id, reviewee_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type_t not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_jobs_status_location_skill on public.jobs(status, location, required_skill);
create index idx_apps_job_status on public.job_applications(job_id, status);
create index idx_notifications_user_read on public.notifications(user_id, is_read, created_at desc);
create index idx_messages_conversation_created on public.messages(conversation_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_jobs_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

create trigger set_job_applications_updated_at
before update on public.job_applications
for each row execute function public.set_updated_at();

create or replace function public.increment_jobs_posted_count()
returns trigger
language plpgsql
as $$
begin
  update public.profiles
  set jobs_posted_count = jobs_posted_count + 1
  where id = new.client_id;
  return new;
end;
$$;

create trigger trig_increment_jobs_posted_count
after insert on public.jobs
for each row execute function public.increment_jobs_posted_count();

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

create trigger trig_notify_client_of_new_application
after insert on public.job_applications
for each row execute function public.notify_client_of_new_application();

create or replace function public.accept_job_application(application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_client_id uuid;
  v_freelancer_id uuid;
begin
  select ja.job_id, j.client_id, ja.freelancer_id
  into v_job_id, v_client_id, v_freelancer_id
  from public.job_applications ja
  join public.jobs j on j.id = ja.job_id
  where ja.id = application_id;

  if v_job_id is null then
    raise exception 'Application not found';
  end if;

  if auth.uid() is distinct from v_client_id then
    raise exception 'You are not allowed to accept this applicant';
  end if;

  if exists (
    select 1 from public.jobs j
    where j.id = v_job_id and j.status <> 'open'
  ) then
    raise exception 'Job is no longer open';
  end if;

  update public.job_applications
  set status = 'accepted'
  where id = application_id;

  update public.job_applications
  set status = 'rejected'
  where job_id = v_job_id
    and id <> application_id
    and status = 'pending';

  update public.jobs
  set status = 'assigned',
      accepted_application_id = application_id
  where id = v_job_id;

  insert into public.conversations (job_id, client_id, freelancer_id)
  values (v_job_id, v_client_id, v_freelancer_id)
  on conflict (job_id) do nothing;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_freelancer_id,
    'application_accepted',
    'Application Accepted',
    'Your application has been accepted. You can now chat with the client.',
    jsonb_build_object('job_id', v_job_id)
  );

  return v_job_id;
end;
$$;

grant execute on function public.accept_job_application(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.job_applications enable row level security;
alter table public.job_completions enable row level security;
alter table public.reviews enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

create policy "Profiles readable by authenticated users"
on public.profiles
for select
to authenticated
using (true);

create policy "Users insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "Users update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Jobs readable by authenticated users"
on public.jobs
for select
to authenticated
using (true);

create policy "Client can insert own jobs"
on public.jobs
for insert
to authenticated
with check (auth.uid() = client_id);

create policy "Client can update own jobs"
on public.jobs
for update
to authenticated
using (auth.uid() = client_id)
with check (auth.uid() = client_id);

create policy "Client can delete own jobs"
on public.jobs
for delete
to authenticated
using (auth.uid() = client_id);

create policy "Freelancer can apply to open jobs"
on public.job_applications
for insert
to authenticated
with check (
  auth.uid() = freelancer_id
  and exists (
    select 1 from public.jobs j
    where j.id = job_id and j.status = 'open'
  )
);

create policy "Application readable by owner client/freelancer"
on public.job_applications
for select
to authenticated
using (
  auth.uid() = freelancer_id
  or exists (
    select 1 from public.jobs j
    where j.id = job_id and j.client_id = auth.uid()
  )
);

create policy "Client can update applicant statuses"
on public.job_applications
for update
to authenticated
using (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and j.client_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and j.client_id = auth.uid()
  )
);

create policy "Job completion readable by participants"
on public.job_completions
for select
to authenticated
using (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and (j.client_id = auth.uid() or exists (
      select 1 from public.job_applications ja
      where ja.id = j.accepted_application_id and ja.freelancer_id = auth.uid()
    ))
  )
);

create policy "Job completion updatable by participants"
on public.job_completions
for insert
to authenticated
with check (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and (j.client_id = auth.uid() or exists (
      select 1 from public.job_applications ja
      where ja.id = j.accepted_application_id and ja.freelancer_id = auth.uid()
    ))
  )
);

create policy "Job completion update by participants"
on public.job_completions
for update
to authenticated
using (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and (j.client_id = auth.uid() or exists (
      select 1 from public.job_applications ja
      where ja.id = j.accepted_application_id and ja.freelancer_id = auth.uid()
    ))
  )
)
with check (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and (j.client_id = auth.uid() or exists (
      select 1 from public.job_applications ja
      where ja.id = j.accepted_application_id and ja.freelancer_id = auth.uid()
    ))
  )
);

create policy "Reviews readable by authenticated users"
on public.reviews
for select
to authenticated
using (true);

create policy "Reviewer can create own review"
on public.reviews
for insert
to authenticated
with check (auth.uid() = reviewer_id);

create policy "Conversation visible to participants"
on public.conversations
for select
to authenticated
using (auth.uid() = client_id or auth.uid() = freelancer_id);

create policy "Conversation insert restricted to participants"
on public.conversations
for insert
to authenticated
with check (auth.uid() = client_id or auth.uid() = freelancer_id);

create policy "Messages visible to participants"
on public.messages
for select
to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.client_id = auth.uid() or c.freelancer_id = auth.uid())
  )
);

create policy "Messages insert by participants"
on public.messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.client_id = auth.uid() or c.freelancer_id = auth.uid())
  )
);

create policy "User reads own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);

create policy "User updates own notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are public"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

create policy "User uploads own avatar"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "User updates own avatar"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
