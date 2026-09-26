create unique index idx_flags_unique_type_month on flags(student_id, year, month, flag_type);

create or replace function public.refresh_explainable_flags(target_student_id uuid, target_year int, target_month int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_record_id uuid;
  prior_record_id uuid;
  palak_evidence jsonb;
  wellbeing_evidence jsonb;
begin
  select id into target_record_id
  from avlokan_records
  where student_id = target_student_id and year = target_year and month = target_month;

  select id into prior_record_id
  from avlokan_records
  where student_id = target_student_id
    and (year * 12 + month) = (target_year * 12 + target_month - 1);

  if target_record_id is null then
    insert into flags(student_id, month, year, flag_type, evidence)
    values (
      target_student_id, target_month, target_year, 'missing_avlokan',
      jsonb_build_object('missing_month', format('%s-%s', target_year, lpad(target_month::text, 2, '0')))
    ) on conflict (student_id, year, month, flag_type) do update set evidence = excluded.evidence, resolved = false;
  else
    delete from flags where student_id = target_student_id and year = target_year and month = target_month and flag_type = 'missing_avlokan';
  end if;

  if target_record_id is not null then
    select jsonb_build_object(
      'current_status', coalesce(current_p.verification_status::text, 'No record'),
      'previous_status', coalesce(previous_p.verification_status::text, 'No record'),
      'months_checked', jsonb_build_array(format('%s-%s', target_year, lpad(target_month::text, 2, '0')), format('%s-%s', target_year, lpad((target_month - 1)::text, 2, '0')))
    ) into palak_evidence
    from (select verification_status from section_palak_meeting where record_id = target_record_id) current_p
    full join (select verification_status from section_palak_meeting where record_id = prior_record_id) previous_p on true;

    if prior_record_id is not null
      and exists (select 1 from section_palak_meeting where record_id = target_record_id and verification_status is distinct from 'Verified')
      and exists (select 1 from section_palak_meeting where record_id = prior_record_id and verification_status is distinct from 'Verified') then
      insert into flags(student_id, month, year, flag_type, evidence)
      values (target_student_id, target_month, target_year, 'missed_palak_meeting', coalesce(palak_evidence, '{}'::jsonb))
      on conflict (student_id, year, month, flag_type) do update set evidence = excluded.evidence, resolved = false;
    end if;

    select jsonb_build_object(
      'daily_work_reason', dw.reason_not_done,
      'earn_learn_reason', el.reason_not_done,
      'source_record_id', target_record_id
    ) into wellbeing_evidence
    from section_daily_work dw
    full join section_earn_learn el on el.record_id = dw.record_id
    where coalesce(dw.record_id, el.record_id) = target_record_id;

    if exists (
      select 1 from section_daily_work where record_id = target_record_id and reason_not_done in ('Ill','Other')
      union all
      select 1 from section_earn_learn where record_id = target_record_id and reason_not_done in ('Ill','Other')
    ) then
      insert into flags(student_id, month, year, flag_type, evidence)
      values (target_student_id, target_month, target_year, 'wellbeing_spike', coalesce(wellbeing_evidence, '{}'::jsonb))
      on conflict (student_id, year, month, flag_type) do update set evidence = excluded.evidence, resolved = false;
    end if;
  end if;
end;
$$;

create view palak_compliance_monthly as
select
  r.year,
  r.month,
  count(*) filter (where p.verification_status = 'Verified') as visited,
  count(*) filter (where p.verification_status is distinct from 'Verified' and r.status <> 'missing') as not_visited,
  count(*) filter (where r.status = 'missing') as no_avlokan_submitted
from avlokan_records r
left join section_palak_meeting p on p.record_id = r.id
group by r.year, r.month;

create view student_trajectory as
select
  r.student_id, r.year, r.month, r.status,
  dw.grade as daily_work_grade,
  y.grade as yoga_grade,
  el.grade as earn_learn_grade,
  v.grade as vvk_grade,
  m.grade as mess_grade,
  b.grade as block_grade,
  p.verification_status as palak_status
from avlokan_records r
left join section_daily_work dw on dw.record_id = r.id
left join section_yoga y on y.record_id = r.id
left join section_earn_learn el on el.record_id = r.id
left join section_vvk v on v.record_id = r.id
left join section_mess m on m.record_id = r.id
left join section_block b on b.record_id = r.id
left join section_palak_meeting p on p.record_id = r.id;

create view daily_work_grading_queue as
select r.id as record_id, r.student_id, r.year, r.month, dw.work_description, dw.days_done, dw.reason_not_done
from avlokan_records r join section_daily_work dw on dw.record_id = r.id
where dw.grade is null;
create view yoga_grading_queue as
select r.id as record_id, r.student_id, r.year, r.month, y.present_days, y.absent_days, y.leave_days
from avlokan_records r join section_yoga y on y.record_id = r.id
where y.grade is null;
create view earn_learn_grading_queue as
select r.id as record_id, r.student_id, r.year, r.month, el.earn_learn_type, el.amount, el.reason_not_done
from avlokan_records r join section_earn_learn el on el.record_id = r.id
where el.grade is null;
create view vvk_grading_queue as
select r.id as record_id, r.student_id, r.year, r.month, v.favourite_lecture_1, v.favourite_lecture_2
from avlokan_records r join section_vvk v on v.record_id = r.id
where v.grade is null;
create view mess_grading_queue as
select r.id as record_id, r.student_id, r.year, r.month, m.present_days, m.absent_days, m.leave_days
from avlokan_records r join section_mess m on m.record_id = r.id
where m.grade is null;
create view block_grading_queue as
select r.id as record_id, r.student_id, r.year, r.month
from avlokan_records r join section_block b on b.record_id = r.id
where b.grade is null;

create view rector_flag_overview as
select
  f.id,
  f.student_id,
  s.gr_no,
  p.full_name as student_name,
  s.college_name,
  s.course,
  s.wing,
  f.month,
  f.year,
  f.flag_type,
  f.evidence,
  f.resolved,
  f.raised_at,
  f.resolution_notes
from flags f
join students s on s.profile_id = f.student_id
join profiles p on p.id = f.student_id;

alter view palak_compliance_monthly set (security_invoker = true);
alter view student_trajectory set (security_invoker = true);
alter view daily_work_grading_queue set (security_invoker = true);
alter view yoga_grading_queue set (security_invoker = true);
alter view earn_learn_grading_queue set (security_invoker = true);
alter view vvk_grading_queue set (security_invoker = true);
alter view mess_grading_queue set (security_invoker = true);
alter view block_grading_queue set (security_invoker = true);
alter view rector_flag_overview set (security_invoker = true);
