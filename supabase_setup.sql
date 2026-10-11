-- Run this once in the Supabase SQL Editor.
create extension if not exists pg_trgm;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text not null default '',
  updated_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

do $$
declare
  report_table text;
begin
  foreach report_table in array array['lost_items', 'found_items', 'lost_people', 'found_people']
  loop
    execute format(
      'create table if not exists public.%I (
        id uuid primary key default gen_random_uuid(),
        created_at timestamptz not null default now(),
        title text not null default '''',
        public_details text not null default '''',
        hidden_details text not null default '''',
        lat double precision,
        lng double precision,
        location_name text,
        place_type text,
        photo_url text,
        reporter_name text,
        contact text,
        reporter_language text not null default ''en'',
        trip_end_date date,
        age_range text,
        clothing text,
        language_spoken text,
        pickup_option text,
        pickup_place text,
        status text not null default ''open''
      )',
      report_table
    );
  end loop;
end;
$$;

alter table public.lost_items add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.found_items add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.lost_people add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.found_people add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.profiles enable row level security;
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists "Users create own profile" on public.profiles;
create policy "Users create own profile" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select, insert, update on public.profiles to authenticated;

do $$
declare
  report_table text;
begin
  foreach report_table in array array['lost_items', 'found_items', 'lost_people', 'found_people']
  loop
    execute format('alter table public.%I enable row level security', report_table);
    execute format('drop policy if exists "Read open reports" on public.%I', report_table);
    execute format(
      'create policy "Read open reports" on public.%I for select to anon, authenticated using (status = ''open'')',
      report_table
    );
    execute format('drop policy if exists "Owners read reports" on public.%I', report_table);
    execute format(
      'create policy "Owners read reports" on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      report_table
    );
    execute format('drop policy if exists "Owners create reports" on public.%I', report_table);
    execute format(
      'create policy "Owners create reports" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      report_table
    );
    execute format('drop policy if exists "Owners update reports" on public.%I', report_table);
    execute format(
      'create policy "Owners update reports" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      report_table
    );
    execute format('drop policy if exists "Owners delete reports" on public.%I', report_table);
    execute format(
      'create policy "Owners delete reports" on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      report_table
    );

    execute format('revoke select on public.%I from anon, authenticated', report_table);
    execute format(
      'grant select (id, created_at, title, public_details, lat, lng, location_name, place_type, photo_url, reporter_language, trip_end_date, age_range, clothing, language_spoken, status, pickup_option, pickup_place) on public.%I to anon, authenticated',
      report_table
    );
    execute format('grant insert on public.%I to authenticated', report_table);
    execute format('grant update (pickup_option, pickup_place) on public.%I to authenticated', report_table);
    execute format('grant delete on public.%I to authenticated', report_table);
  end loop;
end;
$$;

create or replace function public.get_my_reports(p_report_table text)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in is required to view your reports.';
  end if;
  if p_report_table not in ('lost_items', 'found_items', 'lost_people', 'found_people') then
    raise exception 'Invalid report type.';
  end if;
  return query execute format(
    'select to_jsonb(report) from public.%I as report where user_id = $1 order by created_at desc',
    p_report_table
  ) using auth.uid();
end;
$$;

create or replace function public.find_report_matches(p_report_table text, p_report_id uuid)
returns table (
  lost_report jsonb,
  found_report jsonb,
  score double precision,
  hidden_matches integer,
  hidden_total integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  own_row record;
  other_row record;
  other_table text;
  visible_score real;
  hidden_score real;
  location_score real;
  place_score real;
  person_score real;
  match_score double precision;
  weight_total real;
  lost_json jsonb;
  found_json jsonb;
  own_is_lost boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required to find matches.';
  end if;
  if p_report_table not in ('lost_items', 'found_items', 'lost_people', 'found_people') then
    raise exception 'Invalid report type.';
  end if;
  own_is_lost := p_report_table like 'lost_%';
  other_table := case p_report_table
    when 'lost_items' then 'found_items'
    when 'found_items' then 'lost_items'
    when 'lost_people' then 'found_people'
    else 'lost_people'
  end;

  execute format('select * from public.%I where id = $1 and user_id = $2 and status = ''open''', p_report_table)
    into own_row using p_report_id, auth.uid();
  if own_row.id is null then
    raise exception 'Report not found or not owned by the signed-in user.';
  end if;

  for other_row in execute format(
    'select * from public.%I where status = ''open'' and user_id is distinct from $1',
    other_table
  ) using auth.uid()
  loop
    visible_score := similarity(
      lower(concat_ws(' ', own_row.title, own_row.public_details)),
      lower(concat_ws(' ', other_row.title, other_row.public_details))
    );
    hidden_score := case
      when nullif(btrim(own_row.hidden_details), '') is null
        or nullif(btrim(other_row.hidden_details), '') is null then 0
      else similarity(lower(own_row.hidden_details), lower(other_row.hidden_details))
    end;
    location_score := case
      when nullif(btrim(own_row.location_name), '') is not null
        and lower(own_row.location_name) = lower(other_row.location_name) then 1
      else 0
    end;
    place_score := case
      when nullif(own_row.place_type, '') is not null and own_row.place_type = other_row.place_type then 1
      else 0
    end;
    person_score := 0;
    weight_total := 0.95;
    if p_report_table like '%_people' then
      person_score := (
        case when nullif(own_row.age_range, '') is not null and own_row.age_range = other_row.age_range then 1 else 0 end
        + similarity(lower(coalesce(own_row.clothing, '')), lower(coalesce(other_row.clothing, '')))
        + similarity(lower(coalesce(own_row.language_spoken, '')), lower(coalesce(other_row.language_spoken, '')))
      ) / 3;
      weight_total := 1.10;
    end if;
    match_score := (
      0.42 * visible_score +
      0.36 * hidden_score +
      0.12 * location_score +
      0.05 * place_score +
      case when p_report_table like '%_people' then 0.15 * person_score else 0 end
    ) / weight_total;

    if match_score <= 0.70 or (visible_score < 0.12 and hidden_score < 0.15) then
      continue;
    end if;

    if own_is_lost then
      lost_json := to_jsonb(own_row);
      found_json := jsonb_build_object(
        'id', other_row.id, 'created_at', other_row.created_at, 'title', other_row.title,
        'public_details', other_row.public_details, 'lat', other_row.lat, 'lng', other_row.lng,
        'location_name', other_row.location_name, 'place_type', other_row.place_type,
        'photo_url', other_row.photo_url, 'status', other_row.status,
        'reporter_language', other_row.reporter_language, 'age_range', other_row.age_range,
        'clothing', other_row.clothing, 'language_spoken', other_row.language_spoken
      );
    else
      lost_json := jsonb_build_object(
        'id', other_row.id, 'created_at', other_row.created_at, 'title', other_row.title,
        'public_details', other_row.public_details, 'lat', other_row.lat, 'lng', other_row.lng,
        'location_name', other_row.location_name, 'place_type', other_row.place_type,
        'photo_url', other_row.photo_url, 'status', other_row.status,
        'reporter_language', other_row.reporter_language, 'age_range', other_row.age_range,
        'clothing', other_row.clothing, 'language_spoken', other_row.language_spoken
      );
      found_json := to_jsonb(own_row);
    end if;

    return query select
      lost_json,
      found_json,
      match_score,
      case when hidden_score >= 0.25 then 1 else 0 end,
      case when nullif(btrim(own_row.hidden_details), '') is null then 0 else 1 end;
  end loop;
end;
$$;

create or replace function public.verify_report_match(p_report_table text, p_report_id uuid, p_candidate_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  other_table text;
  candidate_contact text;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required to verify a match.';
  end if;
  if p_report_table not in ('lost_items', 'found_items', 'lost_people', 'found_people') then
    raise exception 'Invalid report type.';
  end if;
  other_table := case p_report_table
    when 'lost_items' then 'found_items'
    when 'found_items' then 'lost_items'
    when 'lost_people' then 'found_people'
    else 'lost_people'
  end;
  if not exists (
    select 1 from public.find_report_matches(p_report_table, p_report_id) as possible
    where possible.score > 0.70
      and (case when p_report_table like 'lost_%'
        then possible.found_report ->> 'id'
        else possible.lost_report ->> 'id'
      end) = p_candidate_id::text
  ) then
    raise exception 'This report is not a verified strong match.';
  end if;

  execute format('select contact from public.%I where id = $1 and status = ''open''', other_table)
    into candidate_contact using p_candidate_id;
  return candidate_contact;
end;
$$;

revoke all on function public.find_report_matches(text, uuid) from public, anon;
revoke all on function public.verify_report_match(text, uuid, uuid) from public, anon;
revoke all on function public.get_my_reports(text) from public, anon;
grant execute on function public.get_my_reports(text) to authenticated;
grant execute on function public.find_report_matches(text, uuid) to authenticated;
grant execute on function public.verify_report_match(text, uuid, uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Report owners upload photos" on storage.objects;
create policy "Report owners upload photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "Public read report photos" on storage.objects;
create policy "Public read report photos" on storage.objects for select to anon, authenticated
  using (bucket_id = 'photos');
