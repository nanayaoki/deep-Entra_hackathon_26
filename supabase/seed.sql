-- Local/demo seed only. Do not run this in production.
-- Demo login password for every seeded account: Avlokan@123

do $$
declare
  student_id uuid;
  student_index int;
  month_index int;
  record_id uuid;
  demo_email text;
begin
  for student_index in 1..15 loop
    demo_email := format('student%02s@demo.avlokan.local', student_index);
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      demo_email, crypt('Avlokan@123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', format('Demo Student %s', student_index)), now(), now()
    ) returning id into student_id;

    insert into profiles (id, role, full_name, email, must_change_password, is_active)
    values (student_id, 'student', format('Demo Student %s', student_index), demo_email, false, true);

    insert into students (profile_id, gr_no, class, course, college_name, hostel_name, room_no, wing, academic_year, mentor_name)
    values (
      student_id,
      format('GRN-%04s', student_index),
      case when student_index % 2 = 0 then 'Second Year' else 'First Year' end,
      case when student_index % 3 = 0 then 'B.Com.' else 'B.E. Computer' end,
      'VSS College', 'VSS Hostel', format('Room %s', 100 + student_index),
      case when student_index % 3 = 0 then 'C' when student_index % 2 = 0 then 'B' else 'A' end,
      '2026-27', format('Mentor %s', ((student_index - 1) % 5) + 1)
    );

    for month_index in 4..9 loop
      if not (student_index in (5, 11) and month_index = 8) then
        insert into avlokan_records (student_id, month, year, status, submitted_at)
        values (student_id, month_index, 2026, 'graded_complete', now() - ((9 - month_index) * interval '30 days'))
        returning id into record_id;

        insert into section_daily_work (record_id, work_description, days_done, grade, reason_not_done)
        values (record_id, 'Completed monthly assigned work.', 20 + (student_index % 10), case when month_index >= 8 and student_index in (5, 11) then 'C' else 'B' end, case when student_index in (5, 11) and month_index = 8 then 'Ill' else null end);
        insert into section_yoga (record_id, present_days, absent_days, leave_days, grade)
        values (record_id, 20 + (student_index % 8), 2, 1, case when student_index % 5 = 0 and month_index >= 8 then 'C' else 'A' end);
        insert into section_earn_learn (record_id, earn_learn_type, amount, grade, reason_not_done)
        values (record_id, 'Regular', 1500 + student_index * 100, case when month_index >= 8 and student_index in (5, 11) then 'C' else 'B' end, case when student_index in (5, 11) and month_index = 8 then 'Other' else null end);
        insert into section_palak_meeting (record_id, meeting_date, discussion_notes, verification_status)
        values (record_id, make_date(2026, month_index, least(10 + student_index, 28)), 'Monthly mentor discussion.', case when student_index in (5, 11) and month_index in (7, 8) then 'Pending' else 'Verified' end);
        insert into section_vvk (record_id, favourite_lecture_1, favourite_lecture_2, grade)
        values (record_id, 'Life skills', 'Academic writing', case when month_index >= 8 and student_index in (5, 11) then 'C' else 'B' end);
        insert into section_mess (record_id, present_days, absent_days, leave_days, grade)
        values (record_id, 24, 3, 1, 'B');
        insert into section_block (record_id, grade) values (record_id, case when student_index % 4 = 0 then 'Satisfactory' else 'Good' end);
        insert into section_behaviour (record_id, remarks) values (record_id, 'No remarks recorded.');
        insert into section_student_notes (record_id, reading_this_month, other_remarks) values (record_id, 'Completed assigned reading.', null);
        insert into section_rector_remarks (record_id, remarks) values (record_id, 'Reviewed.');
      end if;

      perform refresh_explainable_flags(student_id, 2026, month_index);
    end loop;
  end loop;
end $$;
