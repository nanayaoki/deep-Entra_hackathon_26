create extension if not exists pgcrypto;

create type user_role as enum (
  'admin','rector','student','dept_head','yoga_head','earn_learn_head','palak_head','vvk_head','mess_head','wing_head'
);
create type grade_abc as enum ('A','B','C');
create type block_grade as enum ('Good','Satisfactory','Bad');
create type reason_code as enum ('Ill','Leave','Other','Exam');
create type record_status as enum ('not_started','draft','submitted','graded_partial','graded_complete','missing');
create type verification_status as enum ('Pending','Verified','Disputed');
create type earn_learn_type as enum ('Regular','Seasonal','Samiti Management');
create type flag_type as enum ('missed_palak_meeting','wellbeing_spike','missing_avlokan','declining_trend','sudden_change');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  phone text,
  email text,
  avatar_url text,
  must_change_password boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create table students (
  profile_id uuid primary key references profiles(id) on delete cascade,
  gr_no text unique not null,
  class text,
  course text,
  college_name text,
  hostel_name text,
  room_no text,
  wing text,
  admission_date date,
  academic_year text,
  category text,
  mentor_name text,
  mentor_contact text,
  updated_at timestamptz not null default now()
);
create index idx_students_wing on students(wing);

create table staff_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  scope_type text not null check (scope_type in ('wing','department','hostel','all')),
  scope_value text,
  created_at timestamptz not null default now(),
  check ((scope_type = 'all' and scope_value is null) or scope_type <> 'all')
);

create table avlokan_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(profile_id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2000 and 2200),
  status record_status not null default 'not_started',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(student_id, month, year)
);
create index idx_avlokan_student_month on avlokan_records(student_id, year, month);

create table section_daily_work (
  record_id uuid primary key references avlokan_records(id) on delete cascade,
  work_description text,
  days_done int check (days_done between 0 and 31),
  reason_not_done reason_code check (reason_not_done in ('Ill','Leave','Other')),
  grade grade_abc,
  graded_by uuid references profiles(id),
  graded_at timestamptz
);
create table section_yoga (
  record_id uuid primary key references avlokan_records(id) on delete cascade,
  present_days int check (present_days between 0 and 31),
  absent_days int check (absent_days between 0 and 31),
  leave_days int check (leave_days between 0 and 31),
  grade grade_abc,
  filled_by uuid references profiles(id),
  filled_at timestamptz
);
create table section_earn_learn (
  record_id uuid primary key references avlokan_records(id) on delete cascade,
  wellwisher_name text,
  wellwisher_phone text,
  earn_learn_type earn_learn_type,
  amount numeric(10,2) check (amount is null or amount >= 0),
  reason_not_done reason_code,
  grade grade_abc,
  graded_by uuid references profiles(id),
  graded_at timestamptz
);
create table section_palak_meeting (
  record_id uuid primary key references avlokan_records(id) on delete cascade,
  meeting_date date,
  discussion_notes text,
  photo_url text,
  geo_lat numeric(9,6) check (geo_lat between -90 and 90),
  geo_long numeric(9,6) check (geo_long between -180 and 180),
  geo_captured_at timestamptz,
  verification_status verification_status not null default 'Pending',
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  verification_notes text
);
create table section_vvk (
  record_id uuid primary key references avlokan_records(id) on delete cascade,
  favourite_lecture_1 text,
  favourite_lecture_2 text,
  grade grade_abc,
  graded_by uuid references profiles(id),
  graded_at timestamptz
);
create table section_mess (
  record_id uuid primary key references avlokan_records(id) on delete cascade,
  present_days int check (present_days between 0 and 31),
  absent_days int check (absent_days between 0 and 31),
  leave_days int check (leave_days between 0 and 31),
  grade grade_abc,
  filled_by uuid references profiles(id),
  filled_at timestamptz
);
create table section_block (
  record_id uuid primary key references avlokan_records(id) on delete cascade,
  grade block_grade,
  graded_by uuid references profiles(id),
  graded_at timestamptz
);
create table section_behaviour (
  record_id uuid primary key references avlokan_records(id) on delete cascade,
  remarks text,
  filled_by uuid references profiles(id),
  filled_at timestamptz
);
create table section_leaves (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references avlokan_records(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  reason text,
  check (to_date >= from_date)
);
create index idx_section_leaves_record on section_leaves(record_id);
create table section_student_notes (
  record_id uuid primary key references avlokan_records(id) on delete cascade,
  health_issue text,
  misbehaviour_notes text,
  other_activities text,
  exam_details text,
  academic_problems text,
  special_events text,
  reading_this_month text,
  computer_usage text,
  complaints_suggestions text,
  financial_aid_amount numeric(10,2) check (financial_aid_amount is null or financial_aid_amount >= 0),
  financial_aid_notes text,
  other_remarks text
);
create table section_rector_remarks (
  record_id uuid primary key references avlokan_records(id) on delete cascade,
  remarks text,
  filled_by uuid references profiles(id),
  filled_at timestamptz
);

create table flags (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(profile_id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null,
  flag_type flag_type not null,
  evidence jsonb not null,
  raised_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  resolution_notes text
);
create index idx_flags_student on flags(student_id, year, month);
create index idx_flags_unresolved on flags(student_id) where resolved = false;

create table interventions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(profile_id) on delete cascade,
  related_flag_id uuid references flags(id) on delete set null,
  logged_by uuid references profiles(id),
  intervention_date date not null default current_date,
  note text not null,
  created_at timestamptz not null default now()
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  message text not null,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now(),
  old_value jsonb,
  new_value jsonb
);

create index idx_section_daily_work_grade on section_daily_work(grade) where grade is null;
create index idx_section_yoga_grade on section_yoga(grade) where grade is null;
create index idx_section_earn_learn_grade on section_earn_learn(grade) where grade is null;
create index idx_section_vvk_grade on section_vvk(grade) where grade is null;
create index idx_section_mess_grade on section_mess(grade) where grade is null;
create index idx_section_block_grade on section_block(grade) where grade is null;
