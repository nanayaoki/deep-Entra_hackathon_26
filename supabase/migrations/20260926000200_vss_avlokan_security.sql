create or replace function public.app_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.is_admin_or_rector()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_role() in ('admin', 'rector');
$$;

create or replace function public.record_belongs_to_current_student(target_record_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.avlokan_records r
    where r.id = target_record_id and r.student_id = auth.uid()
  );
$$;

create or replace function public.student_is_in_assignment(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.staff_assignments a on a.profile_id = auth.uid()
    where s.profile_id = target_student_id
      and (a.scope_type = 'all'
        or (a.scope_type = 'wing' and a.scope_value = s.wing)
        or (a.scope_type = 'hostel' and a.scope_value = s.hostel_name)
        or (a.scope_type = 'department' and a.scope_value = s.class))
  );
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_row jsonb;
  previous_row jsonb;
  row_identifier uuid;
begin
  changed_row := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  previous_row := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end;
  row_identifier := coalesce(
    (changed_row ->> 'id')::uuid,
    (changed_row ->> 'record_id')::uuid,
    (previous_row ->> 'id')::uuid,
    (previous_row ->> 'record_id')::uuid
  );

  insert into public.audit_log(table_name, row_id, action, changed_by, old_value, new_value)
  values (TG_TABLE_NAME, row_identifier, lower(TG_OP), auth.uid(), previous_row, changed_row);
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'section_daily_work','section_yoga','section_earn_learn','section_palak_meeting',
    'section_vvk','section_mess','section_block','section_behaviour','section_leaves',
    'section_student_notes','section_rector_remarks','flags','interventions'
  ] loop
    execute format('drop trigger if exists audit_%I on public.%I', table_name, table_name);
    execute format(
      'create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      table_name, table_name
    );
  end loop;
end $$;

alter table profiles enable row level security;
alter table students enable row level security;
alter table staff_assignments enable row level security;
alter table avlokan_records enable row level security;
alter table section_daily_work enable row level security;
alter table section_yoga enable row level security;
alter table section_earn_learn enable row level security;
alter table section_palak_meeting enable row level security;
alter table section_vvk enable row level security;
alter table section_mess enable row level security;
alter table section_block enable row level security;
alter table section_behaviour enable row level security;
alter table section_leaves enable row level security;
alter table section_student_notes enable row level security;
alter table section_rector_remarks enable row level security;
alter table flags enable row level security;
alter table interventions enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;

create policy profiles_self_read on profiles for select using (id = auth.uid() or public.app_role() in ('admin','rector'));
create policy profiles_admin_manage on profiles for all using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy students_self_read on students for select using (profile_id = auth.uid() or public.is_admin_or_rector() or public.student_is_in_assignment(profile_id));
create policy students_self_update on students for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy students_admin_manage on students for all using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy assignments_admin_manage on staff_assignments for all using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy assignments_self_read on staff_assignments for select using (profile_id = auth.uid() or public.app_role() in ('admin','rector'));

create policy records_student_read on avlokan_records for select using (student_id = auth.uid());
create policy records_student_insert on avlokan_records for insert with check (student_id = auth.uid());
create policy records_student_update on avlokan_records for update using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy records_admin_rector_read on avlokan_records for select using (public.is_admin_or_rector());
create policy records_assigned_head_read on avlokan_records for select using (public.student_is_in_assignment(student_id));
create policy records_admin_manage on avlokan_records for all using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

create policy daily_work_student_own on section_daily_work for all using (public.record_belongs_to_current_student(record_id)) with check (public.record_belongs_to_current_student(record_id));
create policy daily_work_admin_rector_read on section_daily_work for select using (public.is_admin_or_rector());
create policy daily_work_head_manage on section_daily_work for all using (public.app_role() = 'dept_head' and public.student_is_in_assignment((select student_id from avlokan_records where id = record_id))) with check (public.app_role() = 'dept_head');

create policy yoga_student_read on section_yoga for select using (public.record_belongs_to_current_student(record_id));
create policy yoga_admin_rector_read on section_yoga for select using (public.is_admin_or_rector());
create policy yoga_head_manage on section_yoga for all using (public.app_role() = 'yoga_head' and public.student_is_in_assignment((select student_id from avlokan_records where id = record_id))) with check (public.app_role() = 'yoga_head');

create policy earn_learn_student_own on section_earn_learn for all using (public.record_belongs_to_current_student(record_id)) with check (public.record_belongs_to_current_student(record_id));
create policy earn_learn_admin_rector_read on section_earn_learn for select using (public.is_admin_or_rector());
create policy earn_learn_head_manage on section_earn_learn for all using (public.app_role() = 'earn_learn_head' and public.student_is_in_assignment((select student_id from avlokan_records where id = record_id))) with check (public.app_role() = 'earn_learn_head');

create policy palak_student_own on section_palak_meeting for all using (public.record_belongs_to_current_student(record_id)) with check (public.record_belongs_to_current_student(record_id));
create policy palak_admin_rector_read on section_palak_meeting for select using (public.is_admin_or_rector());
create policy palak_head_verify on section_palak_meeting for update using (public.app_role() = 'palak_head' and public.student_is_in_assignment((select student_id from avlokan_records where id = record_id))) with check (public.app_role() = 'palak_head');

create policy vvk_student_read on section_vvk for select using (public.record_belongs_to_current_student(record_id));
create policy vvk_admin_rector_read on section_vvk for select using (public.is_admin_or_rector());
create policy vvk_head_manage on section_vvk for all using (public.app_role() = 'vvk_head' and public.student_is_in_assignment((select student_id from avlokan_records where id = record_id))) with check (public.app_role() = 'vvk_head');

create policy mess_student_read on section_mess for select using (public.record_belongs_to_current_student(record_id));
create policy mess_admin_rector_read on section_mess for select using (public.is_admin_or_rector());
create policy mess_head_manage on section_mess for all using (public.app_role() = 'mess_head' and public.student_is_in_assignment((select student_id from avlokan_records where id = record_id))) with check (public.app_role() = 'mess_head');

create policy block_student_read on section_block for select using (public.record_belongs_to_current_student(record_id));
create policy block_admin_rector_read on section_block for select using (public.is_admin_or_rector());
create policy wing_head_manage on section_block for all using (public.app_role() = 'wing_head' and public.student_is_in_assignment((select student_id from avlokan_records where id = record_id))) with check (public.app_role() = 'wing_head');

create policy behaviour_student_read on section_behaviour for select using (public.record_belongs_to_current_student(record_id));
create policy behaviour_admin_rector_read on section_behaviour for select using (public.is_admin_or_rector());
create policy rector_behaviour_manage on section_behaviour for all using (public.app_role() = 'rector') with check (public.app_role() = 'rector');

create policy leaves_student_own on section_leaves for all using (public.record_belongs_to_current_student(record_id)) with check (public.record_belongs_to_current_student(record_id));
create policy leaves_admin_rector_read on section_leaves for select using (public.is_admin_or_rector());
create policy leaves_assigned_head_read on section_leaves for select using (public.student_is_in_assignment((select student_id from avlokan_records where id = record_id)));

create policy notes_student_own on section_student_notes for all using (public.record_belongs_to_current_student(record_id)) with check (public.record_belongs_to_current_student(record_id));
create policy notes_admin_rector_read on section_student_notes for select using (public.is_admin_or_rector());
create policy notes_assigned_head_read on section_student_notes for select using (public.student_is_in_assignment((select student_id from avlokan_records where id = record_id)));

create policy rector_remarks_student_read on section_rector_remarks for select using (public.record_belongs_to_current_student(record_id));
create policy rector_remarks_admin_rector_manage on section_rector_remarks for all using (public.is_admin_or_rector()) with check (public.is_admin_or_rector());

create policy flags_student_read on flags for select using (student_id = auth.uid());
create policy flags_admin_rector_manage on flags for all using (public.is_admin_or_rector()) with check (public.is_admin_or_rector());
create policy interventions_student_read on interventions for select using (student_id = auth.uid());
create policy interventions_admin_rector_manage on interventions for all using (public.is_admin_or_rector()) with check (public.is_admin_or_rector());
create policy notifications_self_manage on notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_admin_rector_read on audit_log for select using (public.is_admin_or_rector());

insert into storage.buckets (id, name, public)
values ('palak-photos', 'palak-photos', false)
on conflict (id) do nothing;

create policy palak_photos_student_upload on storage.objects for insert to authenticated
with check (bucket_id = 'palak-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy palak_photos_student_own_read on storage.objects for select to authenticated
using (bucket_id = 'palak-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy palak_photos_staff_read on storage.objects for select to authenticated
using (bucket_id = 'palak-photos' and public.app_role() in ('admin','palak_head'));
create policy palak_photos_staff_delete on storage.objects for delete to authenticated
using (bucket_id = 'palak-photos' and public.app_role() = 'admin');
