import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import imageCompression from 'browser-image-compression'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import logoImage from './assets/logo.jpeg'
import './App.css'

type Role =
  | 'Admin'
  | 'Rector'
  | 'Student'
  | 'Department Head'
  | 'Yoga Head'
  | 'Earn & Learn Head'
  | 'Palak Head'
  | 'VVK Head'
  | 'Mess Head'
  | 'Wing Head'

type Account = {
  id: number
  username: string
  password: string
  role: Role
  name: string
}

const initialAccounts: Account[] = [
  { id: 1, username: 'vssadmin', password: 'VSS@admin123', role: 'Admin', name: 'Admin User' },
]

const accountsStorageKey = 'vss-avlokan-accounts'
const studentProfilesStorageKey = 'vss-avlokan-student-profiles'

const loadStoredAccounts = (): Account[] => {
  const storedAccounts = window.localStorage.getItem(accountsStorageKey)

  if (!storedAccounts) {
    return initialAccounts
  }

  try {
    const parsedAccounts = JSON.parse(storedAccounts) as Account[]
    return Array.isArray(parsedAccounts) && parsedAccounts.length > 0 ? parsedAccounts : initialAccounts
  } catch {
    return initialAccounts
  }
}

const loadStoredStudentProfiles = (): Record<string, StudentProfile> => {
  const storedProfiles = window.localStorage.getItem(studentProfilesStorageKey)
  if (!storedProfiles) return {}

  try {
    const parsedProfiles = JSON.parse(storedProfiles) as Record<string, StudentProfile>
    return parsedProfiles && typeof parsedProfiles === 'object' ? parsedProfiles : {}
  } catch {
    return {}
  }
}

type AccountFormState = {
  name: string
  username: string
  password: string
  role: Role
}

type StudentView = 'profile' | 'avlokan' | 'previous' | 'complaint'
type RectorView = 'students' | 'review' | 'defaulters' | 'analysis'
type NotificationKind = 'monthly-reminder' | 'submission'

type AttendanceRecord = {
  id: string
  name: string
  grnNumber: string
  month: string
  year: number
  presentDays: number
  absentDays: number
  grade: 'A' | 'B' | 'C'
  isDefaulter: boolean
}

type VvkAttendance = {
  id: string
  name: string
  grnNumber: string
  month: string
  year: number
  totalLectures: number
  attendedLectures: number
  attendancePercentage: number
  grade: 'A' | 'B' | 'C'
  isDefaulter: boolean
}

type StudentProfile = {
  fullName: string
  grnNumber: string
  collegeName: string
  year: string
  course: string
  image: string
}

const avlokanSchema = z
  .object({
    work_description: z.string().min(1, 'Describe the assigned work.'),
    days_done: z.number().min(0).max(31),
    work_done_fully: z.boolean(),
    work_reason_not_done: z.string().optional(),
    earn_wellwisher_name: z.string().optional(),
    earn_wellwisher_phone: z.string().regex(/^(|[+\d][\d\s-]{7,})$/, 'Enter a valid phone number.'),
    earn_learn_type: z.enum(['Regular', 'Seasonal', 'Samiti Management']),
    earn_amount: z.number().min(0),
    earn_done_fully: z.boolean(),
    earn_reason_not_done: z.string().optional(),
    palak_meeting_date: z.string().min(1, 'Select the meeting date.'),
    palak_discussion_notes: z.string().min(1, 'Add the discussion notes.'),
    palak_photo: z.string().min(1, 'Upload a meeting photo.'),
    palak_geo_lat: z.number().optional(),
    palak_geo_long: z.number().optional(),
    favourite_lecture_1: z.string().min(1, 'Enter your favourite lecture.'),
    favourite_lecture_2: z.string().min(1, 'Enter your second favourite lecture.'),
    leaves: z.array(z.object({ from_date: z.string(), to_date: z.string(), reason: z.string() })),
    health_issue: z.string().optional(),
    misbehaviour_notes: z.string().optional(),
    other_activities: z.string().optional(),
    exam_details: z.string().optional(),
    academic_problems: z.string().optional(),
    special_events: z.string().optional(),
    reading_this_month: z.string().optional(),
    computer_usage: z.string().optional(),
    complaints_suggestions: z.string().optional(),
    financial_aid_amount: z.number().min(0),
    financial_aid_notes: z.string().optional(),
    other_remarks: z.string().optional(),
  })
  .superRefine((values, context) => {
    if (!values.work_done_fully && !values.work_reason_not_done) {
      context.addIssue({ code: 'custom', path: ['work_reason_not_done'], message: 'Select a reason.' })
    }
    if (!values.earn_done_fully && !values.earn_reason_not_done) {
      context.addIssue({ code: 'custom', path: ['earn_reason_not_done'], message: 'Select a reason.' })
    }
  })

type AvlokanFormValues = z.infer<typeof avlokanSchema>
type AvlokanSection = 'work' | 'earn' | 'palak' | 'vvk' | 'leaves' | 'notes'
type ReviewSection = 'work' | 'yoga' | 'earn' | 'palak' | 'vvk' | 'mess' | 'block'

type SubmittedAvlokan = {
  id: string
  studentId: number
  studentName: string
  month: string
  year: number
  submittedAt: string
  status: 'Submitted' | 'In review' | 'Complete'
  values: AvlokanFormValues
  grades: Partial<Record<ReviewSection, string>>
  rectorMarks?: number
  rectorRemarks?: string
}

type AppNotification = {
  id: string
  userId: number
  title: string
  message: string
  createdAt: string
  read: boolean
  kind: NotificationKind
  link: 'avlokan' | 'review'
}

const submissionsStorageKey = 'vss-avlokan-submissions'
const yogaAttendanceStorageKey = 'vss-yoga-attendance'
const messAttendanceStorageKey = 'vss-mess-attendance'
const vvkAttendanceStorageKey = 'vss-vvk-attendance'
const notificationsStorageKey = 'vss-avlokan-notifications'

const getCurrentCycle = () => {
  const now = new Date()
  return { month: now.toLocaleString('en-US', { month: 'long' }), year: now.getFullYear() }
}

const loadStoredSubmissions = (): SubmittedAvlokan[] => {
  const storedSubmissions = window.localStorage.getItem(submissionsStorageKey)
  if (!storedSubmissions) return []

  try {
    const parsedSubmissions = JSON.parse(storedSubmissions) as SubmittedAvlokan[]
    return Array.isArray(parsedSubmissions) ? parsedSubmissions : []
  } catch {
    return []
  }
}

const loadStoredYogaAttendance = (): AttendanceRecord[] => {
  const storedAttendance = window.localStorage.getItem(yogaAttendanceStorageKey)
  if (!storedAttendance) return []

  try {
    const parsedAttendance = JSON.parse(storedAttendance) as AttendanceRecord[]
    return Array.isArray(parsedAttendance) ? parsedAttendance : []
  } catch {
    return []
  }
}

const loadStoredAttendance = (storageKey: string): AttendanceRecord[] => {
  const storedAttendance = window.localStorage.getItem(storageKey)
  if (!storedAttendance) return []
  try {
    const parsedAttendance = JSON.parse(storedAttendance) as AttendanceRecord[]
    return Array.isArray(parsedAttendance) ? parsedAttendance : []
  } catch {
    return []
  }
}

const loadStoredVvkAttendance = (): VvkAttendance[] => {
  const storedAttendance = window.localStorage.getItem(vvkAttendanceStorageKey)
  if (!storedAttendance) return []
  try {
    const parsedAttendance = JSON.parse(storedAttendance) as VvkAttendance[]
    return Array.isArray(parsedAttendance) ? parsedAttendance : []
  } catch {
    return []
  }
}

const loadStoredNotifications = (): AppNotification[] => {
  const storedNotifications = window.localStorage.getItem(notificationsStorageKey)
  if (!storedNotifications) return []
  try {
    const parsedNotifications = JSON.parse(storedNotifications) as AppNotification[]
    return Array.isArray(parsedNotifications) ? parsedNotifications : []
  } catch {
    return []
  }
}

const defaultAvlokanValues: AvlokanFormValues = {
  work_description: '',
  days_done: 0,
  work_done_fully: true,
  work_reason_not_done: '',
  earn_wellwisher_name: '',
  earn_wellwisher_phone: '',
  earn_learn_type: 'Regular',
  earn_amount: 0,
  earn_done_fully: true,
  earn_reason_not_done: '',
  palak_meeting_date: '',
  palak_discussion_notes: '',
  palak_photo: '',
  palak_geo_lat: undefined,
  palak_geo_long: undefined,
  favourite_lecture_1: '',
  favourite_lecture_2: '',
  leaves: [],
  health_issue: '',
  misbehaviour_notes: '',
  other_activities: '',
  exam_details: '',
  academic_problems: '',
  special_events: '',
  reading_this_month: '',
  computer_usage: '',
  complaints_suggestions: '',
  financial_aid_amount: 0,
  financial_aid_notes: '',
  other_remarks: '',
}

const emptyAccountForm: AccountFormState = {
  name: '',
  username: '',
  password: '',
  role: 'Student',
}

const emptyStudentProfile: StudentProfile = {
  fullName: '',
  grnNumber: '',
  collegeName: '',
  year: '',
  course: '',
  image: '',
}

function App() {
  const [route, setRoute] = useState<'home' | 'about' | 'signin' | 'dashboard'>('home')
  const [session, setSession] = useState<Account | null>(null)
  const [authError, setAuthError] = useState('')
  const [username, setUsername] = useState('vssadmin')
  const [password, setPassword] = useState('VSS@admin123')
  const [accounts, setAccounts] = useState<Account[]>(loadStoredAccounts)
  const [accountForm, setAccountForm] = useState<AccountFormState>(emptyAccountForm)
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null)
  const [accountMessage, setAccountMessage] = useState('')
  const [studentView, setStudentView] = useState<StudentView>('profile')
  const [studentProfile, setStudentProfile] = useState<StudentProfile>(emptyStudentProfile)
  const [profileMessage, setProfileMessage] = useState('')
  const [complaint, setComplaint] = useState('')
  const [complaintMessage, setComplaintMessage] = useState('')
  const [submissions, setSubmissions] = useState<SubmittedAvlokan[]>(loadStoredSubmissions)
  const [rectorView, setRectorView] = useState<RectorView>('students')
  const [yogaAttendance, setYogaAttendance] = useState<AttendanceRecord[]>(loadStoredYogaAttendance)
  const [messAttendance, setMessAttendance] = useState<AttendanceRecord[]>(() => loadStoredAttendance(messAttendanceStorageKey))
  const [vvkAttendance, setVvkAttendance] = useState<VvkAttendance[]>(loadStoredVvkAttendance)
  const [notifications, setNotifications] = useState<AppNotification[]>(loadStoredNotifications)
  const [queueOpen, setQueueOpen] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(accountsStorageKey, JSON.stringify(accounts))
  }, [accounts])

  useEffect(() => {
    window.localStorage.setItem(submissionsStorageKey, JSON.stringify(submissions))
  }, [submissions])

  useEffect(() => {
    window.localStorage.setItem(yogaAttendanceStorageKey, JSON.stringify(yogaAttendance))
  }, [yogaAttendance])

  useEffect(() => {
    window.localStorage.setItem(messAttendanceStorageKey, JSON.stringify(messAttendance))
  }, [messAttendance])

  useEffect(() => {
    window.localStorage.setItem(vvkAttendanceStorageKey, JSON.stringify(vvkAttendance))
  }, [vvkAttendance])

  useEffect(() => {
    window.localStorage.setItem(notificationsStorageKey, JSON.stringify(notifications))
  }, [notifications])

  useEffect(() => {
    const now = new Date()
    const cycle = getCurrentCycle()
    const nextNotifications: AppNotification[] = []

    if (now.getDate() >= 28) {
      accounts.filter((account) => account.role === 'Student').forEach((student) => {
        const hasSubmitted = submissions.some(
          (submission) => submission.studentId === student.id && submission.month === cycle.month && submission.year === cycle.year,
        )
        const notificationId = `monthly-reminder-${student.id}-${cycle.year}-${cycle.month}`
        if (!hasSubmitted && !notifications.some((notification) => notification.id === notificationId)) {
          nextNotifications.push({
            id: notificationId,
            userId: student.id,
            title: 'Monthly Avlokan reminder',
            message: `Please complete and submit your ${cycle.month} ${cycle.year} Avlokan.`,
            createdAt: now.toISOString(),
            read: false,
            kind: 'monthly-reminder',
            link: 'avlokan',
          })
        }
      })
    }

    accounts.filter((account) => account.role !== 'Student').forEach((reviewer) => {
      submissions.forEach((submission) => {
        const notificationId = `submission-${reviewer.id}-${submission.id}`
        if (!notifications.some((notification) => notification.id === notificationId)) {
          nextNotifications.push({
            id: notificationId,
            userId: reviewer.id,
            title: 'Avlokan ready for grading',
            message: `${submission.studentName} submitted ${submission.month} ${submission.year} Avlokan for grading.`,
            createdAt: submission.submittedAt,
            read: false,
            kind: 'submission',
            link: 'review',
          })
        }
      })
    })

    if (nextNotifications.length > 0) {
      setNotifications((current) => [...nextNotifications, ...current])
    }
  }, [accounts, notifications, submissions])

  const currentRole = session?.role ?? 'Student'

  const accessibleRoute = useMemo(() => {
    if (!session && route === 'dashboard') {
      return 'signin'
    }
    return route
  }, [route, session])

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const user = accounts.find(
      (account) =>
        account.username.toLowerCase() === username.trim().toLowerCase() &&
        account.password === password,
    )

    if (!user) {
      setAuthError('The username or password entered is not valid.')
      return
    }

    setSession(user)
    setAuthError('')
    setStudentView('profile')
    setQueueOpen(false)
    setStudentProfile(loadStoredStudentProfiles()[String(user.id)] ?? emptyStudentProfile)
    setProfileMessage('')
    setRoute('dashboard')
  }

  const handleLogout = () => {
    setSession(null)
    setRoute('home')
    setQueueOpen(false)
  }

  const handleProfileSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (session?.role === 'Student') {
      const storedProfiles = loadStoredStudentProfiles()
      storedProfiles[String(session.id)] = studentProfile
      window.localStorage.setItem(studentProfilesStorageKey, JSON.stringify(storedProfiles))
    }
    setProfileMessage('Profile details saved successfully.')
  }

  const handleProfileImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const updatedProfile = { ...studentProfile, image: String(reader.result) }
      setStudentProfile(updatedProfile)
      if (session?.role === 'Student') {
        const storedProfiles = loadStoredStudentProfiles()
        storedProfiles[String(session.id)] = updatedProfile
        window.localStorage.setItem(studentProfilesStorageKey, JSON.stringify(storedProfiles))
      }
    }
    reader.readAsDataURL(file)
  }

  const handleComplaintSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!complaint.trim()) {
      setComplaintMessage('Please describe your complaint before submitting.')
      return
    }

    setComplaint('')
    setComplaintMessage('Complaint submitted successfully. The concerned team will review it.')
  }

  const handleAvlokanSubmit = (values: AvlokanFormValues) => {
    if (!session) return

    const submission: SubmittedAvlokan = {
      id: `${session.id}-${Date.now()}`,
      studentId: session.id,
      studentName: session.name,
      ...getCurrentCycle(),
      submittedAt: new Date().toISOString(),
      status: 'Submitted',
      values,
      grades: {},
    }

    setSubmissions((current) => [submission, ...current.filter((item) => item.studentId !== session.id)])
  }

  const handleNotificationRead = (notificationId: string) => {
    setNotifications((current) => current.map((notification) =>
      notification.id === notificationId ? { ...notification, read: true } : notification,
    ))
  }

  const handleNotificationOpen = (notification: AppNotification) => {
    handleNotificationRead(notification.id)
    setQueueOpen(false)
    if (notification.link === 'avlokan' && session?.role === 'Student') setStudentView('avlokan')
    if (notification.link === 'review' && session?.role === 'Rector') setRectorView('review')
  }

  const handleGradeUpdate = (submissionId: string, section: ReviewSection, grade: string) => {
    setSubmissions((current) => current.map((submission) => {
      if (submission.id !== submissionId) return submission

      const grades = { ...submission.grades, [section]: grade }
      return { ...submission, grades, status: Object.keys(grades).length > 0 ? 'In review' : submission.status }
    }))
  }

  const handleRectorReviewSave = (submissionId: string, marks: number, remarks: string) => {
    setSubmissions((current) => current.map((submission) =>
      submission.id === submissionId
        ? { ...submission, rectorMarks: marks, rectorRemarks: remarks, status: 'Complete' }
        : submission,
    ))
  }

  const mergeAttendance = (current: AttendanceRecord[], attendance: AttendanceRecord[]) => [
      ...attendance,
      ...current.filter((record) => !attendance.some((item) => item.month === record.month && item.year === record.year)),
    ]

  const handleYogaAttendanceSave = (attendance: AttendanceRecord[]) => {
    setYogaAttendance((current) => mergeAttendance(current, attendance))
  }

  const handleMessAttendanceSave = (attendance: AttendanceRecord[]) => {
    setMessAttendance((current) => mergeAttendance(current, attendance))
  }

  const handleVvkAttendanceSave = (attendance: VvkAttendance[]) => {
    setVvkAttendance((current) => [
      ...attendance,
      ...current.filter((record) => !attendance.some((item) => item.month === record.month && item.year === record.year)),
    ])
  }

  const resetAccountForm = () => {
    setAccountForm(emptyAccountForm)
    setEditingAccountId(null)
  }

  const handleAccountSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = accountForm.name.trim()
    const usernameValue = accountForm.username.trim()
    const passwordValue = accountForm.password.trim()

    if (!name || !usernameValue || !passwordValue) {
      setAccountMessage('Name, username and password are required.')
      return
    }

    const duplicateAccount = accounts.find(
      (account) =>
        account.username.toLowerCase() === usernameValue.toLowerCase() &&
        account.id !== editingAccountId,
    )

    if (duplicateAccount) {
      setAccountMessage('An account with this username already exists.')
      return
    }

    if (editingAccountId !== null) {
      setAccounts((previousAccounts) =>
        previousAccounts.map((account) =>
          account.id === editingAccountId
            ? { ...account, name, username: usernameValue, password: passwordValue, role: accountForm.role }
            : account,
        ),
      )
      setAccountMessage('Account updated successfully.')
    } else {
      const newAccount: Account = {
        id: Date.now(),
        name,
        username: usernameValue,
        password: passwordValue,
        role: accountForm.role,
      }

      setAccounts((previousAccounts) => [newAccount, ...previousAccounts])
      setAccountMessage('Account created successfully.')
    }

    resetAccountForm()
  }

  const handleEditAccount = (account: Account) => {
    setAccountForm({
      name: account.name,
      username: account.username,
      password: account.password,
      role: account.role,
    })
    setEditingAccountId(account.id)
    setAccountMessage('')
  }

  const handleDeleteAccount = (accountId: number) => {
    setAccounts((previousAccounts) => previousAccounts.filter((account) => account.id !== accountId))

    if (session?.id === accountId) {
      setSession(null)
      setRoute('home')
    }

    if (editingAccountId === accountId) {
      resetAccountForm()
    }

    setAccountMessage('Account deleted successfully.')
  }

  return (
    <div className="app-shell">
      {!session ? (
        <>
          <header className="topbar">
            <div className="brand-wrap">
              <img src={logoImage} alt="VSS logo" className="brand-logo" />
              <div>
                <p className="brand-name">VSS</p>
                <p className="brand-subtitle">Avlokan Portal</p>
              </div>
            </div>
            <nav className="nav" aria-label="Main navigation">
              <button type="button" onClick={() => setRoute('home')}>Home</button>
              <button type="button" onClick={() => setRoute('about')}>About</button>
              <button type="button" className="nav-primary" onClick={() => setRoute('signin')}>
                Sign In
              </button>
            </nav>
          </header>

          {accessibleRoute === 'home' && (
            <main className="landing-page">
              <section className="hero-panel">
                <div className="hero-copy">
                  <p className="eyebrow">For student life, discipline and growth</p>
                  <h1>VSS Avlokan Portal — track every month with evidence.</h1>
                  <p className="lede">
                    The monthly review process brings together academic progress, hostel behaviour,
                    work responsibility, mentor engagement, and wellbeing. Every record remains
                    visible, explainable, and reviewed by a human before any continuation decision.
                  </p>
                  <div className="cta-row">
                    <button type="button" className="primary" onClick={() => setRoute('signin')}>
                      Sign in to portal
                    </button>
                    <button type="button" className="secondary" onClick={() => setRoute('about')}>
                      Learn about Avlokan
                    </button>
                  </div>
                </div>
              </section>

              <section className="info-section">
                <div className="section-heading">
                  <p className="eyebrow">Learn about Avlokan</p>
                  <h2>How the monthly review cycle works</h2>
                </div>
                <div className="info-grid">
                  <div className="info-card">
                    <h3>Monthly review</h3>
                    <p>
                      Students submit their monthly records and relevant sections are reviewed by the
                      appropriate team members.
                    </p>
                  </div>
                  <div className="info-card">
                    <h3>Evidence tracking</h3>
                    <p>
                      Every action is linked to dates, remarks, and review notes so the process remains
                      transparent and accountable.
                    </p>
                  </div>
                  <div className="info-card">
                    <h3>Human oversight</h3>
                    <p>
                      Final decisions are reviewed by people, not automated scoring, to keep the process
                      fair and explainable.
                    </p>
                  </div>
                </div>
              </section>
            </main>
          )}

          {accessibleRoute === 'about' && (
            <main className="content-page">
              <section className="page-section narrow">
                <p className="eyebrow">About the website</p>
                <h2>What Avlokan means in practice</h2>
                <p>
                  Avlokan is the monthly review cycle that helps VSS understand each student across
                  academic participation, hostel conduct, work commitments, mentor engagement, and
                  personal wellbeing. It is not a single score. Instead, the system keeps month-by-month
                  evidence so Heads and the Rector can understand patterns, identify support needs, and
                  decide on the next step with full context.
                </p>
                <div className="info-grid">
                  <div className="info-card">
                    <h3>Monthly workflow</h3>
                    <p>
                      Each student completes the current month’s form, then Heads review their assigned
                      sections and submit grades or remarks. The record is only complete when all relevant
                      sections are updated.
                    </p>
                  </div>
                  <div className="info-card">
                    <h3>Explainability</h3>
                    <p>
                      Every flag points back to the exact months, dates, and reasons behind it. No result
                      is hidden behind a black-box calculation.
                    </p>
                  </div>
                  <div className="info-card">
                    <h3>Support before decision</h3>
                    <p>
                      The portal is designed for review and follow-up, not automated continuation. Human
                      judgment remains central to the final decision.
                    </p>
                  </div>
                </div>
              </section>
            </main>
          )}

          {accessibleRoute === 'signin' && (
            <main className="content-page auth-wrap">
              <section className="auth-box">
                <p className="eyebrow">Access the portal</p>
                <h2>Sign in</h2>
                <form onSubmit={handleLogin} className="auth-form">
                  <label>
                    Username
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  {authError ? <p className="error-message">{authError}</p> : null}
                  <button type="submit" className="primary full-width">
                    Continue
                  </button>
                </form>
                <div className="demo-accounts">
                  <p>Admin credential</p>
                  <ul>
                    <li>
                      <span>Username</span>
                      <strong>vssadmin</strong>
                    </li>
                    <li>
                      <span>Password</span>
                      <strong>VSS@admin123</strong>
                    </li>
                  </ul>
                </div>
              </section>
            </main>
          )}
        </>
      ) : (
        <div className="workspace-shell">
          <aside className="workspace-sidebar">
            <div className="sidebar-brand">
              <img src={logoImage} alt="VSS logo" className="brand-logo small-logo" />
              <div>
                <p className="brand-name">VSS</p>
                <p className="brand-subtitle">Avlokan</p>
              </div>
            </div>
            <div className="user-block">
              <span className="user-label">Signed in</span>
              <strong>{session.name}</strong>
              <small>{session.role}</small>
            </div>
            <nav className="sidebar-nav" aria-label="Dashboard navigation">
              {currentRole === 'Student' ? (
                <>
                  <button
                    type="button"
                    className={`nav-button ${studentView === 'profile' ? 'active' : ''}`}
                    onClick={() => setStudentView('profile')}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className={`nav-button ${studentView === 'avlokan' ? 'active' : ''}`}
                    onClick={() => setStudentView('avlokan')}
                  >
                    Fill this month's Avlokan
                  </button>
                  <button
                    type="button"
                    className={`nav-button ${studentView === 'previous' ? 'active' : ''}`}
                    onClick={() => setStudentView('previous')}
                  >
                    Previous submitted Avlokan
                  </button>
                  <button
                    type="button"
                    className={`nav-button ${studentView === 'complaint' ? 'active' : ''}`}
                    onClick={() => setStudentView('complaint')}
                  >
                    File a complaint
                  </button>
                </>
              ) : currentRole === 'Rector' ? (
                <>
                  <button type="button" className={`nav-button ${rectorView === 'students' ? 'active' : ''}`} onClick={() => setRectorView('students')}>
                    View all students
                  </button>
                  <button type="button" className={`nav-button ${rectorView === 'review' ? 'active' : ''}`} onClick={() => setRectorView('review')}>
                    Check and give marks
                  </button>
                  <button type="button" className={`nav-button ${rectorView === 'defaulters' ? 'active' : ''}`} onClick={() => setRectorView('defaulters')}>
                    Defaulters
                  </button>
                  <button type="button" className={`nav-button ${rectorView === 'analysis' ? 'active' : ''}`} onClick={() => setRectorView('analysis')}>
                    Analysis
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="nav-button active">
                    Overview
                  </button>
                  <button type="button" className="nav-button">
                    Six-month view
                  </button>
                </>
              )}
              <button
                type="button"
                className={`nav-button ${queueOpen ? 'active' : ''}`}
                onClick={() => setQueueOpen(true)}
              >
                My queue{notifications.filter((notification) => notification.userId === session.id && !notification.read).length > 0 ? ` (${notifications.filter((notification) => notification.userId === session.id && !notification.read).length})` : ''}
              </button>
              <button type="button" className="nav-button" onClick={handleLogout}>
                Sign out
              </button>
            </nav>
          </aside>

          <main className="workspace-content">
            <header className="workspace-header">
              <div>
                <p className="eyebrow">Portal dashboard</p>
                <h2>{session.role}</h2>
              </div>
              <button type="button" className="primary small-button">
                Review cycle: Sep 2026
              </button>
            </header>

            {queueOpen ? <NotificationQueue
              notifications={notifications.filter((notification) => notification.userId === session.id)}
              onOpen={handleNotificationOpen}
            /> : <>
              {currentRole === 'Admin' && (
                <AdminDashboard
                  accounts={accounts}
                  accountForm={accountForm}
                  editingAccountId={editingAccountId}
                  accountMessage={accountMessage}
                  onFieldChange={(field, value) =>
                    setAccountForm((current) => ({ ...current, [field]: value }))
                  }
                  onSubmit={handleAccountSubmit}
                  onEdit={handleEditAccount}
                  onDelete={handleDeleteAccount}
                  onReset={resetAccountForm}
                />
              )}
              {currentRole === 'Rector' && (
                <RectorDashboard
                  view={rectorView}
                  accounts={accounts}
                  profiles={loadStoredStudentProfiles()}
                  submissions={submissions}
                  yogaAttendance={yogaAttendance}
                  messAttendance={messAttendance}
                  vvkAttendance={vvkAttendance}
                  onReviewSave={handleRectorReviewSave}
                />
              )}
              {currentRole === 'Student' && (
                <StudentDashboard
                  view={studentView}
                  profile={studentProfile}
                  profileMessage={profileMessage}
                  complaint={complaint}
                  complaintMessage={complaintMessage}
                  onProfileChange={(field, value) => {
                    setStudentProfile((current) => ({ ...current, [field]: value }))
                    setProfileMessage('')
                  }}
                  onProfileImage={handleProfileImage}
                  onProfileSave={handleProfileSave}
                  onComplaintChange={(value) => {
                    setComplaint(value)
                    setComplaintMessage('')
                  }}
                  onComplaintSubmit={handleComplaintSubmit}
                  submissions={submissions.filter((submission) => submission.studentId === session.id)}
                  onAvlokanSubmit={handleAvlokanSubmit}
                />
              )}
              {currentRole === 'Department Head' && <HeadDashboard title="Department Head" section="work" submissions={submissions} onGradeUpdate={handleGradeUpdate} />}
              {currentRole === 'Yoga Head' && <AttendanceHeadDashboard subject="Yoga" attendance={yogaAttendance} onAttendanceSave={handleYogaAttendanceSave} />}
              {currentRole === 'Earn & Learn Head' && <HeadDashboard title="Earn & Learn Head" section="earn" submissions={submissions} onGradeUpdate={handleGradeUpdate} />}
              {currentRole === 'VVK Head' && <VvkHeadDashboard attendance={vvkAttendance} onAttendanceSave={handleVvkAttendanceSave} />}
              {currentRole === 'Mess Head' && <AttendanceHeadDashboard subject="Mess" attendance={messAttendance} onAttendanceSave={handleMessAttendanceSave} />}
              {currentRole === 'Wing Head' && <HeadDashboard title="Wing Head" section="block" submissions={submissions} onGradeUpdate={handleGradeUpdate} />}
              {currentRole === 'Palak Head' && <PalakDashboard submissions={submissions} onGradeUpdate={handleGradeUpdate} />}
            </>}
          </main>
        </div>
      )}
    </div>
  )
}

function NotificationQueue({ notifications, onOpen }: { notifications: AppNotification[]; onOpen: (notification: AppNotification) => void }) {
  return (
    <section className="panel panel-wide notification-queue">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Action center</p>
          <h3>My queue</h3>
        </div>
        <span className="status-chip">{notifications.filter((notification) => !notification.read).length} unread</span>
      </div>
      {notifications.length === 0 ? <div className="student-empty-state">
        <h4>Your queue is clear</h4>
        <p>New reminders and submitted Avlokan records will appear here.</p>
      </div> : <div className="notification-list">
        {notifications.map((notification) => <button
          type="button"
          className={`notification-item ${notification.read ? '' : 'unread'}`}
          key={notification.id}
          onClick={() => onOpen(notification)}
        >
          <span className="notification-dot" aria-hidden="true" />
          <span className="notification-copy">
            <strong>{notification.title}</strong>
            <span>{notification.message}</span>
            <small>{new Date(notification.createdAt).toLocaleString()}</small>
          </span>
          <span className="notification-action">Open</span>
        </button>)}
      </div>}
    </section>
  )
}

type AdminDashboardProps = {
  accounts: Account[]
  accountForm: AccountFormState
  editingAccountId: number | null
  accountMessage: string
  onFieldChange: (field: keyof AccountFormState, value: string | Role) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onEdit: (account: Account) => void
  onDelete: (accountId: number) => void
  onReset: () => void
}

function AdminDashboard({
  accounts,
  accountForm,
  editingAccountId,
  accountMessage,
  onFieldChange,
  onSubmit,
  onEdit,
  onDelete,
  onReset,
}: AdminDashboardProps) {
  return (
    <div className="dashboard-grid">
      <section className="panel panel-wide">
        <div className="panel-header">
          <h3>Admin overview</h3>
          <button type="button" className="secondary small-button">System settings</button>
        </div>
        <div className="summary-grid">
          <div className="summary-card blue">
            <span>Portal status</span>
            <strong>Active</strong>
          </div>
          <div className="summary-card">
            <span>Accounts</span>
            <strong>{accounts.length} configured</strong>
          </div>
          <div className="summary-card">
            <span>Access level</span>
            <strong>Admin</strong>
          </div>
          <div className="summary-card">
            <span>Audit trail</span>
            <strong>Enabled</strong>
          </div>
        </div>
      </section>

      <section className="panel panel-wide admin-management-panel">
        <div className="panel-header">
          <h3>{editingAccountId !== null ? 'Update account' : 'Create account'}</h3>
        </div>

        <form className="admin-account-form" onSubmit={onSubmit}>
          <label>
            Full name
            <input
              type="text"
              value={accountForm.name}
              onChange={(event) => onFieldChange('name', event.target.value)}
            />
          </label>

          <label>
            Username
            <input
              type="text"
              value={accountForm.username}
              onChange={(event) => onFieldChange('username', event.target.value)}
            />
          </label>

          <label>
            Password
            <input
              type="text"
              value={accountForm.password}
              onChange={(event) => onFieldChange('password', event.target.value)}
            />
          </label>

          <label>
            Role
            <select
              value={accountForm.role}
              onChange={(event) => onFieldChange('role', event.target.value as Role)}
            >
              <option value="Admin">Admin</option>
              <option value="Rector">Rector</option>
              <option value="Student">Student</option>
              <option value="Department Head">Department Head</option>
              <option value="Yoga Head">Yoga Head</option>
              <option value="Earn & Learn Head">Earn & Learn Head</option>
              <option value="Palak Head">Palak Head</option>
              <option value="VVK Head">VVK Head</option>
              <option value="Mess Head">Mess Head</option>
              <option value="Wing Head">Wing Head</option>
            </select>
          </label>

          <div className="admin-actions">
            <button type="submit" className="primary">
              {editingAccountId !== null ? 'Save changes' : 'Create account'}
            </button>
            <button type="button" className="secondary" onClick={onReset}>
              Clear
            </button>
          </div>

          {accountMessage ? <p className="success-message">{accountMessage}</p> : null}
        </form>
      </section>

      <section className="panel panel-wide">
        <div className="panel-header">
          <h3>All accounts</h3>
        </div>
        <table className="data-table account-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Username</th>
              <th>Password</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>{account.role}</td>
                <td>{account.username}</td>
                <td>{account.password}</td>
                <td>Active</td>
                <td>
                  <div className="inline-actions">
                    <button type="button" className="secondary small-button" onClick={() => onEdit(account)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger-button small-button"
                      onClick={() => onDelete(account.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function AttendanceHeadDashboard({ subject, attendance, onAttendanceSave }: { subject: 'Yoga' | 'Mess'; attendance: AttendanceRecord[]; onAttendanceSave: (attendance: AttendanceRecord[]) => void }) {
  const [uploadMessage, setUploadMessage] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('September')
  const [selectedYear, setSelectedYear] = useState(2026)

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' })
      const parsedRows = rows.map((row, index) => {
        const keys = Object.keys(row)
        const normalizedKeys = keys.map((key) => key.trim().toLowerCase().replace(/[_.-]+/g, ' ').replace(/\s+/g, ' '))
        const nameKeyIndex = normalizedKeys.findIndex((key) => key === 'name' || key.includes('student name') || (key.includes('name') && !key.includes('username')))
        const grnKeyIndex = normalizedKeys.findIndex((key) => key === 'grn' || key.includes('grn no') || key.includes('grn number'))
        const name = nameKeyIndex >= 0 ? String(row[keys[nameKeyIndex]]).trim() : ''
        const grnNumber = grnKeyIndex >= 0 ? String(row[keys[grnKeyIndex]]).trim() : ''
        const attendanceValues = keys
          .filter((_, keyIndex) => keyIndex !== nameKeyIndex && keyIndex !== grnKeyIndex)
          .map((key) => String(row[key]).trim().toUpperCase())
        const presentDays = attendanceValues.filter((value) => value === 'P' || value === 'PRESENT').length
        const absentDays = attendanceValues.filter((value) => value === 'A' || value === 'ABSENT').length
        const grade: AttendanceRecord['grade'] = absentDays < 2 ? 'A' : absentDays < 5 ? 'B' : 'C'

        return {
          id: `${grnNumber || name || 'row'}-${selectedYear}-${selectedMonth}-${index}`,
          name: name || `Student ${index + 1}`,
          grnNumber: grnNumber || `UNKNOWN-${index + 1}`,
          month: selectedMonth,
          year: selectedYear,
          presentDays,
          absentDays,
          grade,
          isDefaulter: grade === 'C',
        }
      }).filter((record) => record.name && record.grnNumber)

      if (parsedRows.length === 0) {
        setUploadMessage('No valid rows found. Use columns named Name, GRN No. and daily P/A attendance columns.')
        return
      }

      onAttendanceSave(parsedRows)
      setUploadMessage(`${parsedRows.length} student attendance records uploaded and graded.`)
      event.target.value = ''
    } catch {
      setUploadMessage('The Excel file could not be read. Please upload a valid .xlsx or .xls file.')
    }
  }

  const currentAttendance = attendance.filter((record) => record.month === selectedMonth && record.year === selectedYear)

  return <div className="dashboard-grid">
    <section className="panel panel-wide">
      <div className="panel-header"><h3>Upload monthly {subject} presentee</h3><span className="role-label">{subject} Head</span></div>
      <div className="upload-controls">
        <label>Month<select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month) => <option key={month}>{month}</option>)}</select></label>
        <label>Year<input type="number" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} /></label>
        <label className="file-upload-label">Excel file<input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} /></label>
      </div>
      <p className="section-helper">Upload columns for Name, GRN No., and daily attendance values marked P or A. Grades are calculated automatically: absent &lt; 2 = A, absent 2–4 = B, absent &ge; 5 = C.</p>
      {uploadMessage ? <p className="success-message">{uploadMessage}</p> : null}
    </section>
    <section className="panel panel-wide">
      <div className="panel-header"><h3>{selectedMonth} {selectedYear} attendance results</h3></div>
      {currentAttendance.length === 0 ? <div className="student-empty-state"><h4>No attendance uploaded</h4><p>Upload the monthly Excel sheet to calculate attendance and grades.</p></div> : <table className="data-table attendance-table"><thead><tr><th>Name</th><th>GRN No.</th><th>Present</th><th>Absent</th><th>Grade</th><th>Flag</th></tr></thead><tbody>{currentAttendance.map((record) => <tr key={record.id} className={record.grade === 'C' ? 'defaulter-row' : ''}><td>{record.name}</td><td>{record.grnNumber}</td><td>{record.presentDays}</td><td>{record.absentDays}</td><td><strong>{record.grade}</strong></td><td>{record.isDefaulter ? `${subject} defaulter` : '—'}</td></tr>)}</tbody></table>}
    </section>
  </div>
}

function AnalysisDashboard({ accounts, submissions, yogaAttendance, messAttendance, vvkAttendance }: { accounts: Account[]; submissions: SubmittedAvlokan[]; yogaAttendance: AttendanceRecord[]; messAttendance: AttendanceRecord[]; vvkAttendance: VvkAttendance[] }) {
  const studentNames = Array.from(new Set([
    ...submissions.map((submission) => submission.studentName),
    ...yogaAttendance.map((record) => record.name),
    ...messAttendance.map((record) => record.name),
    ...vvkAttendance.map((record) => record.name),
  ].filter(Boolean)))
  const [selectedStudent, setSelectedStudent] = useState(studentNames[0] ?? '')
  const avlokanMonth = 'September'
  const avlokanYear = 2026
  const monthNumber = new Date(`${avlokanMonth} 1, ${avlokanYear}`).getMonth()
  const monthEnded = new Date() >= new Date(avlokanYear, monthNumber + 1, 0, 23, 59, 59, 999)
  const missingAvlokanNames = accounts
    .filter((account) => account.role === 'Student')
    .filter((account) => !submissions.some((submission) => submission.studentId === account.id && submission.month === avlokanMonth && submission.year === avlokanYear))
    .map((account) => account.name)
  const allAttendance = [
    ...yogaAttendance.map((record) => ({ name: record.name, section: 'Yoga', month: `${record.month} ${record.year}`, grade: record.grade, present: record.presentDays, absent: record.absentDays })),
    ...messAttendance.map((record) => ({ name: record.name, section: 'Mess', month: `${record.month} ${record.year}`, grade: record.grade, present: record.presentDays, absent: record.absentDays })),
    ...vvkAttendance.map((record) => ({ name: record.name, section: 'VVK', month: `${record.month} ${record.year}`, grade: record.grade, present: record.attendedLectures, absent: record.totalLectures - record.attendedLectures })),
  ]
  const studentAttendance = allAttendance.filter((record) => record.name === selectedStudent)
  const studentSubmissions = submissions.filter((submission) => submission.studentName === selectedStudent)

  return <div className="dashboard-grid">
    <section className="panel panel-wide">
      <div className="panel-header"><h3>Select student</h3></div>
      {studentNames.length === 0 ? <div className="student-empty-state"><h4>No student analysis available</h4><p>Student submissions or attendance records are required.</p></div> : <div className="review-student-list analysis-student-list">
        {studentNames.map((studentName) => <button type="button" className={`review-student ${selectedStudent === studentName ? 'active' : ''}`} key={studentName} onClick={() => setSelectedStudent(studentName)}><strong>{studentName}</strong><span>View complete analysis</span></button>)}
      </div>}
    </section>
    <section className="panel panel-wide">
      <div className="panel-header"><h3>{selectedStudent || 'Student'}: six-month progress</h3></div>
      {studentAttendance.length === 0 && studentSubmissions.length === 0 ? <div className="student-empty-state"><h4>No analysis data for this student</h4><p>Upload attendance or receive a submitted Avlokan record for this student.</p></div> : <div className="analysis-trend-grid">
        {['Yoga', 'VVK', 'Mess', 'Daily Work', 'Earn & Learn', 'Block'].map((section) => {
          const attendanceGrades = studentAttendance.filter((record) => record.section === section).map((record) => record.grade)
          const submissionGrades = studentSubmissions.map((submission) => {
            const gradeKey = section === 'Daily Work' ? 'work' : section === 'Earn & Learn' ? 'earn' : section.toLowerCase()
            return submission.grades[gradeKey as ReviewSection]
          }).filter((grade): grade is string => Boolean(grade))
          const grades = [...attendanceGrades, ...submissionGrades]
          return <div className="analysis-card" key={section}><strong>{section}</strong><GradeProgressGraph grades={grades} /></div>
        })}
      </div>}
    </section>
    <SixMonthSummaryPanel submissions={studentSubmissions} missingAvlokanNames={missingAvlokanNames.filter((name) => !selectedStudent || name === selectedStudent)} monthEnded={monthEnded} />
  </div>
}

function GradeProgressGraph({ grades }: { grades: string[] }) {
  const sixMonthGrades = [...grades.slice(-6)]
  while (sixMonthGrades.length < 6) sixMonthGrades.unshift('—')

  return <div className="grade-progress-graph" aria-label={`Six month grade progress ${sixMonthGrades.join(', ')}`}>
    <div className="grade-graph-bars">{sixMonthGrades.map((grade, index) => <div className="grade-graph-column" key={`${grade}-${index}`}><span className={`grade-graph-bar grade-graph-${grade.replace(/[^A-Za-z]/g, '').toLowerCase()}`}>{grade}</span><small>M{index + 1}</small></div>)}</div>
  </div>
}

function SixMonthSummaryPanel({ submissions, missingAvlokanNames, monthEnded }: { submissions: SubmittedAvlokan[]; missingAvlokanNames: string[]; monthEnded: boolean }) {
  return <section className="panel panel-wide"><div className="panel-header"><h3>Six-month evidence packet</h3></div><div className="summary-evidence"><span>Submitted Avlokan records: {submissions.length}</span></div><div className="missing-avlokan-section"><h4>Not submitted Avlokan</h4>{missingAvlokanNames.length === 0 ? <p>No missing Avlokan for the selected student.</p> : <ul>{missingAvlokanNames.map((name) => <li className={monthEnded ? 'missing-avlokan-red' : ''} key={name}>{name}{monthEnded ? ' — month ended, added to Defaulters' : ' — submission pending until month end'}</li>)}</ul>}</div></section>
}

function VvkHeadDashboard({ attendance, onAttendanceSave }: { attendance: VvkAttendance[]; onAttendanceSave: (attendance: VvkAttendance[]) => void }) {
  const [uploadMessage, setUploadMessage] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('September')
  const [selectedYear, setSelectedYear] = useState(2026)

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      const parsedRows = rows.map((row, index) => {
        const keys = Object.keys(row)
        const normalizedKeys = keys.map((key) => key.trim().toLowerCase().replace(/[_.-]+/g, ' ').replace(/\s+/g, ' '))
        const nameKeyIndex = normalizedKeys.findIndex((key) => key === 'name' || key.includes('student name') || (key.includes('name') && !key.includes('username')))
        const grnKeyIndex = normalizedKeys.findIndex((key) => key === 'grn' || key.includes('grn no') || key.includes('grn number'))
        const name = nameKeyIndex >= 0 ? String(row[keys[nameKeyIndex]]).trim() : ''
        const grnNumber = grnKeyIndex >= 0 ? String(row[keys[grnKeyIndex]]).trim() : ''
        const attendanceValues = keys
          .filter((_, keyIndex) => keyIndex !== nameKeyIndex && keyIndex !== grnKeyIndex)
          .map((key) => String(row[key]).trim().toUpperCase())
        const totalLectures = attendanceValues.filter((value) => value === 'P' || value === 'A' || value === 'PRESENT' || value === 'ABSENT').length
        const attendedLectures = attendanceValues.filter((value) => value === 'P' || value === 'PRESENT').length
        const attendancePercentage = totalLectures === 0 ? 0 : (attendedLectures / totalLectures) * 100
        const grade: VvkAttendance['grade'] = attendancePercentage > 90 ? 'A' : attendancePercentage >= 75 ? 'B' : 'C'

        return {
          id: `${grnNumber || name || 'row'}-${selectedYear}-${selectedMonth}-${index}`,
          name: name || `Student ${index + 1}`,
          grnNumber: grnNumber || `UNKNOWN-${index + 1}`,
          month: selectedMonth,
          year: selectedYear,
          totalLectures,
          attendedLectures,
          attendancePercentage,
          grade,
          isDefaulter: grade === 'C',
        }
      }).filter((record) => record.name && record.grnNumber && record.totalLectures > 0)

      if (parsedRows.length === 0) {
        setUploadMessage('No valid rows found. Use Name, GRN No. and lecture attendance columns marked P or A.')
        return
      }

      onAttendanceSave(parsedRows)
      setUploadMessage(`${parsedRows.length} VVK attendance records uploaded and graded.`)
      event.target.value = ''
    } catch {
      setUploadMessage('The Excel file could not be read. Please upload a valid .xlsx or .xls file.')
    }
  }

  const currentAttendance = attendance.filter((record) => record.month === selectedMonth && record.year === selectedYear)

  return <div className="dashboard-grid">
    <section className="panel panel-wide">
      <div className="panel-header"><h3>Upload monthly VVK presentee</h3><span className="role-label">VVK Head</span></div>
      <div className="upload-controls">
        <label>Month<select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>{['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month) => <option key={month}>{month}</option>)}</select></label>
        <label>Year<input type="number" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} /></label>
        <label className="file-upload-label">Excel file<input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} /></label>
      </div>
      <p className="section-helper">Total lectures are all P/A lecture columns. Percentage = attended lectures ÷ total lectures × 100. Grades: &gt;90% = A, 75–90% = B, &lt;75% = C.</p>
      {uploadMessage ? <p className="success-message">{uploadMessage}</p> : null}
    </section>
    <section className="panel panel-wide">
      <div className="panel-header"><h3>{selectedMonth} {selectedYear} VVK results</h3></div>
      {currentAttendance.length === 0 ? <div className="student-empty-state"><h4>No VVK attendance uploaded</h4><p>Upload the monthly Excel sheet to calculate lecture attendance and grades.</p></div> : <table className="data-table attendance-table"><thead><tr><th>Name</th><th>GRN No.</th><th>Total lectures</th><th>Attended</th><th>Present %</th><th>Grade</th><th>Flag</th></tr></thead><tbody>{currentAttendance.map((record) => <tr key={record.id} className={record.grade === 'C' ? 'defaulter-row' : ''}><td>{record.name}</td><td>{record.grnNumber}</td><td>{record.totalLectures}</td><td>{record.attendedLectures}</td><td>{record.attendancePercentage.toFixed(1)}%</td><td><strong>{record.grade}</strong></td><td>{record.isDefaulter ? 'VVK defaulter' : '—'}</td></tr>)}</tbody></table>}
    </section>
  </div>
}

function RectorDashboard({ view, accounts, profiles, submissions, yogaAttendance, messAttendance, vvkAttendance, onReviewSave }: { view: RectorView; accounts: Account[]; profiles: Record<string, StudentProfile>; submissions: SubmittedAvlokan[]; yogaAttendance: AttendanceRecord[]; messAttendance: AttendanceRecord[]; vvkAttendance: VvkAttendance[]; onReviewSave: (submissionId: string, marks: number, remarks: string) => void }) {
  const students = accounts.filter((account) => account.role === 'Student')
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(students[0]?.id ?? null)
  const selectedStudent = students.find((student) => student.id === selectedStudentId)
  const selectedSubmission = submissions.find((submission) => submission.studentId === selectedStudentId)
  const defaulterMap = new Map<string, { name: string; count: number; sections: Set<string> }>()
  const addDefaulter = (key: string, name: string, section: string) => {
    const current = defaulterMap.get(key)
    if (current) {
      current.count += 1
      current.sections.add(section)
    } else {
      defaulterMap.set(key, { name, count: 1, sections: new Set([section]) })
    }
  }

  yogaAttendance.filter((record) => record.isDefaulter).forEach((record) => addDefaulter(record.grnNumber || record.name, record.name, 'Yoga'))
  messAttendance.filter((record) => record.isDefaulter).forEach((record) => addDefaulter(record.grnNumber || record.name, record.name, 'Mess'))
  vvkAttendance.filter((record) => record.isDefaulter).forEach((record) => addDefaulter(record.grnNumber || record.name, record.name, 'VVK'))
  const currentAvlokanMonth = 'September'
  const currentAvlokanYear = 2026
  const currentMonthNumber = new Date(`${currentAvlokanMonth} 1, ${currentAvlokanYear}`).getMonth()
  const currentMonthEnded = new Date() >= new Date(currentAvlokanYear, currentMonthNumber + 1, 0, 23, 59, 59, 999)
  if (currentMonthEnded) {
    accounts
      .filter((account) => account.role === 'Student')
      .filter((account) => !submissions.some((submission) => submission.studentId === account.id && submission.month === currentAvlokanMonth && submission.year === currentAvlokanYear))
      .forEach((account) => addDefaulter(String(account.id), account.name, 'Missing Avlokan'))
  }
  const defaulters = Array.from(defaulterMap.values())
  const [marks, setMarks] = useState(selectedSubmission?.rectorMarks?.toString() ?? '')
  const [remarks, setRemarks] = useState(selectedSubmission?.rectorRemarks ?? '')

  useEffect(() => {
    setMarks(selectedSubmission?.rectorMarks?.toString() ?? '')
    setRemarks(selectedSubmission?.rectorRemarks ?? '')
  }, [selectedSubmission])

  const selectStudent = (studentId: number) => {
    setSelectedStudentId(studentId)
    if (view === 'students') return
  }

  const saveReview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSubmission || !marks) return
    onReviewSave(selectedSubmission.id, Number(marks), remarks)
  }

  return (
    <div className="dashboard-grid">
      {view !== 'defaulters' && view !== 'analysis' ? <section className="panel">
        <div className="panel-header"><h3>All students</h3></div>
        {students.length === 0 ? <div className="student-empty-state"><h4>No student accounts</h4><p>Create student accounts from the Admin dashboard.</p></div> : <div className="review-student-list">
          {students.map((student) => {
            const submission = submissions.find((item) => item.studentId === student.id)
            return <button type="button" className={`review-student ${selectedStudentId === student.id ? 'active' : ''}`} key={student.id} onClick={() => selectStudent(student.id)}>
              <strong>{student.name}</strong>
              <span>{submission ? `${submission.month} ${submission.year} · ${submission.status}` : 'No Avlokan submitted'}</span>
            </button>
          })}
        </div>}
      </section> : null}

      {view === 'students' ? <section className="panel panel-wide">
        <div className="panel-header"><h3>{selectedStudent ? `${selectedStudent.name}'s details` : 'Student details'}</h3></div>
        {selectedStudent ? <div className="review-detail-grid">
          <ReviewDetail label="Full name" value={profiles[String(selectedStudent.id)]?.fullName || selectedStudent.name} />
          <ReviewDetail label="Username" value={selectedStudent.username} />
          <ReviewDetail label="GRN number" value={profiles[String(selectedStudent.id)]?.grnNumber || 'Not provided'} />
          <ReviewDetail label="College" value={profiles[String(selectedStudent.id)]?.collegeName || 'Not provided'} />
          <ReviewDetail label="Year" value={profiles[String(selectedStudent.id)]?.year || 'Not provided'} />
          <ReviewDetail label="Course" value={profiles[String(selectedStudent.id)]?.course || 'Not provided'} />
          <ReviewDetail label="Account role" value={selectedStudent.role} />
          <ReviewDetail label="Current Avlokan" value={selectedSubmission ? `${selectedSubmission.month} ${selectedSubmission.year} · ${selectedSubmission.status}` : 'Not submitted'} />
        </div> : <div className="student-empty-state"><h4>Select a student</h4><p>Click a student name to view their details.</p></div>}
      </section> : null}

      {view === 'defaulters' ? <section className="panel panel-wide">
        <div className="panel-header"><h3>Defaulters</h3><span className="role-label">Automatic flags</span></div>
        {defaulters.length === 0 ? <div className="student-empty-state"><h4>No defaulters</h4><p>Students with a C grade in Yoga, Mess, or VVK will appear here automatically.</p></div> : <table className="data-table defaulter-table"><thead><tr><th>Student name</th><th>Defaulter count</th><th>Sections</th></tr></thead><tbody>{defaulters.map((defaulter) => <tr key={defaulter.name}><td><strong>{defaulter.name}</strong></td><td>{defaulter.count}</td><td>{Array.from(defaulter.sections).join(', ')}</td></tr>)}</tbody></table>}
      </section> : null}

      {view === 'analysis' ? <AnalysisDashboard accounts={accounts} submissions={submissions} yogaAttendance={yogaAttendance} messAttendance={messAttendance} vvkAttendance={vvkAttendance} /> : null}

      {view === 'review' && selectedStudent ? <section className="panel panel-wide">
        <div className="panel-header"><h3>Check and give marks</h3><span className="role-label">Monthly marks: 1–10</span></div>
        {selectedSubmission ? <>
          <PreviousAvlokanRecord submission={selectedSubmission} />
          <form className="rector-review-form" onSubmit={saveReview}>
            <label>Marks for this month's Avlokan
              <input type="number" min="1" max="10" value={marks} onChange={(event) => setMarks(event.target.value)} required />
            </label>
            <label>Section 11: Rector remarks
              <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Add your final remarks for this Avlokan." />
            </label>
            <button type="submit" className="primary">Save marks and remarks</button>
          </form>
        </> : <div className="student-empty-state"><h4>No Avlokan submitted</h4><p>This student must submit this month's Avlokan before Rector review.</p></div>}
      </section> : null}

    </div>
  )
}

type StudentDashboardProps = {
  view: StudentView
  profile: StudentProfile
  profileMessage: string
  complaint: string
  complaintMessage: string
  onProfileChange: (field: keyof Omit<StudentProfile, 'image'>, value: string) => void
  onProfileImage: (event: React.ChangeEvent<HTMLInputElement>) => void
  onProfileSave: (event: React.FormEvent<HTMLFormElement>) => void
  onComplaintChange: (value: string) => void
  onComplaintSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  submissions: SubmittedAvlokan[]
  onAvlokanSubmit: (values: AvlokanFormValues) => void
}

function StudentDashboard({
  view,
  profile,
  profileMessage,
  complaint,
  complaintMessage,
  onProfileChange,
  onProfileImage,
  onProfileSave,
  onComplaintChange,
  onComplaintSubmit,
  submissions,
  onAvlokanSubmit,
}: StudentDashboardProps) {
  if (view === 'avlokan') {
    return (
      <AvlokanForm onSubmitted={onAvlokanSubmit} />
    )
  }

  if (view === 'previous') {
    return (
      <div className="dashboard-grid">
        <section className="panel panel-wide">
          <div className="panel-header">
            <h3>Previous submitted Avlokan</h3>
          </div>
          {submissions.length === 0 ? <div className="student-empty-state">
            <h4>No previous submissions</h4>
            <p>Your submitted monthly Avlokan records will appear here after your first submission.</p>
          </div> : <div className="submission-list">
            {submissions.map((submission) => <article className="submission-card" key={submission.id}>
              <div>
                <strong>{submission.month} {submission.year}</strong>
                <span>Submitted {new Date(submission.submittedAt).toLocaleString()}</span>
              </div>
              <span className="status-chip">{submission.status}</span>
            </article>)}
          </div>}
        </section>
        {submissions.map((submission) => <PreviousAvlokanRecord key={`${submission.id}-details`} submission={submission} />)}
      </div>
    )
  }

  if (view === 'complaint') {
    return (
      <div className="dashboard-grid">
        <section className="panel panel-wide">
          <div className="panel-header">
            <h3>File a complaint</h3>
          </div>
          <form className="student-form" onSubmit={onComplaintSubmit}>
            <label>
              Describe your complaint
              <textarea
                value={complaint}
                onChange={(event) => onComplaintChange(event.target.value)}
                placeholder="Tell us what happened and how we can help."
              />
            </label>
            {complaintMessage ? <p className="success-message">{complaintMessage}</p> : null}
            <div className="form-actions">
              <button type="submit" className="primary">Submit complaint</button>
            </div>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className="dashboard-grid">
      <section className="panel panel-wide">
        <div className="panel-header">
          <h3>Profile</h3>
        </div>
        <form className="student-profile-form" onSubmit={onProfileSave}>
          <div className="profile-image-column">
            <div className="profile-image-preview">
              {profile.image ? <img src={profile.image} alt="Student profile" /> : <span>No image</span>}
            </div>
            <label>
              Profile image
              <input type="file" accept="image/*" onChange={onProfileImage} />
            </label>
          </div>
          <div className="profile-fields">
            <label>
              Full name
              <input type="text" value={profile.fullName} onChange={(event) => onProfileChange('fullName', event.target.value)} />
            </label>
            <label>
              GRN number
              <input type="text" value={profile.grnNumber} onChange={(event) => onProfileChange('grnNumber', event.target.value)} />
            </label>
            <label>
              College name
              <input type="text" value={profile.collegeName} onChange={(event) => onProfileChange('collegeName', event.target.value)} />
            </label>
            <label>
              Year
              <input type="text" value={profile.year} onChange={(event) => onProfileChange('year', event.target.value)} />
            </label>
            <label className="full-span">
              Course
              <input type="text" value={profile.course} onChange={(event) => onProfileChange('course', event.target.value)} />
            </label>
          </div>
          {profileMessage ? <p className="success-message">{profileMessage}</p> : null}
          <div className="form-actions full-span">
            <button type="submit" className="primary">Save profile</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function PreviousAvlokanRecord({ submission }: { submission: SubmittedAvlokan }) {
  const { values, grades } = submission

  return (
    <section className="panel panel-wide previous-record">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Complete submitted record</p>
          <h3>{submission.month} {submission.year}</h3>
        </div>
        <span className="status-chip">{submission.status}</span>
      </div>

      <div className="record-meta">
        <span>Submitted on {new Date(submission.submittedAt).toLocaleString()}</span>
        <span>Student: {submission.studentName}</span>
      </div>

      <div className="record-section-grid">
        <ReadOnlyRecordSection title="1.1 Daily half-hour work" grade={grades.work}>
          <ReadOnlyField label="Assigned work" value={values.work_description} />
          <ReadOnlyField label="Days completed" value={String(values.days_done)} />
          <ReadOnlyField label="Completed in full" value={values.work_done_fully ? 'Yes' : 'No'} />
          {!values.work_done_fully ? <ReadOnlyField label="Reason not done" value={values.work_reason_not_done || 'Not provided'} /> : null}
        </ReadOnlyRecordSection>

        <ReadOnlyRecordSection title="1.3 Earn & Learn" grade={grades.earn}>
          <ReadOnlyField label="Wellwisher name" value={values.earn_wellwisher_name || 'Not provided'} />
          <ReadOnlyField label="Wellwisher phone" value={values.earn_wellwisher_phone || 'Not provided'} />
          <ReadOnlyField label="Type" value={values.earn_learn_type} />
          <ReadOnlyField label="Amount" value={`₹${values.earn_amount.toFixed(2)}`} />
          <ReadOnlyField label="Completed as planned" value={values.earn_done_fully ? 'Yes' : 'No'} />
          {!values.earn_done_fully ? <ReadOnlyField label="Reason not done" value={values.earn_reason_not_done || 'Not provided'} /> : null}
        </ReadOnlyRecordSection>

        <ReadOnlyRecordSection title="1.4 Palak meeting" grade={grades.palak}>
          <ReadOnlyField label="Meeting date" value={values.palak_meeting_date} />
          <ReadOnlyField label="Discussion notes" value={values.palak_discussion_notes} />
          <ReadOnlyField label="Location" value={values.palak_geo_lat && values.palak_geo_long ? `${values.palak_geo_lat}, ${values.palak_geo_long}` : 'Not captured'} />
          <ReadOnlyField label="Photo" value={values.palak_photo ? 'Photo uploaded' : 'No photo'} />
        </ReadOnlyRecordSection>

        <ReadOnlyRecordSection title="2 VVK lectures" grade={grades.vvk}>
          <ReadOnlyField label="Favourite lecture" value={values.favourite_lecture_1} />
          <ReadOnlyField label="Second favourite lecture" value={values.favourite_lecture_2} />
        </ReadOnlyRecordSection>

        <ReadOnlyRecordSection title="6 Leave dates">
          {values.leaves.length > 0 ? values.leaves.map((leave, index) => <ReadOnlyField key={`${leave.from_date}-${index}`} label={`Leave period ${index + 1}`} value={`${leave.from_date} to ${leave.to_date}${leave.reason ? ` — ${leave.reason}` : ''}`} />) : <ReadOnlyField label="Leave periods" value="No leave recorded" />}
        </ReadOnlyRecordSection>

        <ReadOnlyRecordSection title="7-10 Other details">
          <ReadOnlyField label="Health issue / doctor appointment" value={values.health_issue || 'None recorded'} />
          <ReadOnlyField label="Misbehaviour" value={values.misbehaviour_notes || 'None recorded'} />
          <ReadOnlyField label="Other activities" value={values.other_activities || 'None recorded'} />
          <ReadOnlyField label="Exam details" value={values.exam_details || 'None recorded'} />
          <ReadOnlyField label="Academic problems" value={values.academic_problems || 'None recorded'} />
          <ReadOnlyField label="Special events" value={values.special_events || 'None recorded'} />
          <ReadOnlyField label="Reading this month" value={values.reading_this_month || 'None recorded'} />
          <ReadOnlyField label="Computer usage" value={values.computer_usage || 'None recorded'} />
          <ReadOnlyField label="Complaints / suggestions" value={values.complaints_suggestions || 'None recorded'} />
          <ReadOnlyField label="Financial aid" value={values.financial_aid_amount ? `₹${values.financial_aid_amount.toFixed(2)}${values.financial_aid_notes ? ` — ${values.financial_aid_notes}` : ''}` : 'None recorded'} />
          <ReadOnlyField label="Other remarks" value={values.other_remarks || 'None recorded'} />
        </ReadOnlyRecordSection>

        <ReadOnlyRecordSection title="11 Rector remarks" grade={submission.rectorMarks ? `${submission.rectorMarks}/10` : undefined}>
          <ReadOnlyField label="Rector remarks" value={submission.rectorRemarks || 'Not reviewed yet'} />
        </ReadOnlyRecordSection>
      </div>
    </section>
  )
}

function ReadOnlyRecordSection({ title, grade, children }: { title: string; grade?: string; children: React.ReactNode }) {
  return <section className="record-section">
    <div className="record-section-heading">
      <h4>{title}</h4>
      {grade ? <span className="status-chip">Grade: {grade}</span> : null}
    </div>
    <div className="record-fields">{children}</div>
  </section>
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <div className="record-field"><span>{label}</span><strong>{value}</strong></div>
}

function AvlokanForm({ onSubmitted }: { onSubmitted: (values: AvlokanFormValues) => void }) {
  const [activeSection, setActiveSection] = useState<AvlokanSection>('work')
  const [recordStatus, setRecordStatus] = useState('Draft')
  const [saveMessage, setSaveMessage] = useState('')
  const [locationMessage, setLocationMessage] = useState('')
  const palakVerification = 'Pending'
  const palakVerificationNotes = ''
  const { register, control, watch, setValue, handleSubmit, formState: { errors } } = useForm<AvlokanFormValues>({
    resolver: zodResolver(avlokanSchema),
    defaultValues: defaultAvlokanValues,
  })
  const { fields: leaveFields, append, remove } = useFieldArray({ control, name: 'leaves' })
  const workDoneFully = watch('work_done_fully')
  const earnDoneFully = watch('earn_done_fully')

  const saveAvlokan = (values: AvlokanFormValues, status: 'Draft' | 'Submitted') => {
    localStorage.setItem('vss-avlokan-current-record', JSON.stringify({ values, status, savedAt: new Date().toISOString() }))
    if (status === 'Submitted') onSubmitted(values)
    setRecordStatus(status)
    setSaveMessage(status === 'Draft' ? 'Avlokan draft saved.' : 'Avlokan submitted successfully.')
  }

  const handlePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const compressedPhoto = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true })
      const reader = new FileReader()
      reader.onload = () => setValue('palak_photo', String(reader.result), { shouldValidate: true })
      reader.readAsDataURL(compressedPhoto)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setValue('palak_geo_lat', position.coords.latitude)
          setValue('palak_geo_long', position.coords.longitude)
          setLocationMessage(`Location captured: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`)
        },
        () => setLocationMessage('Location access is required to verify this meeting — please allow it and retake the photo'),
      )
    } catch {
      setLocationMessage('The photo could not be prepared. Please select another image.')
    }
  }

  const sections: { id: AvlokanSection; label: string; status: string; locked?: string }[] = [
    { id: 'work', label: '1.1 Daily half-hour work', status: 'Student editable' },
    { id: 'earn', label: '1.3 Earn & Learn', status: 'Student editable' },
    { id: 'palak', label: '1.4 Palak meeting', status: 'Student editable' },
    { id: 'vvk', label: '2 VVK lectures', status: 'Student editable' },
    { id: 'leaves', label: '6 Leave dates', status: 'Student editable' },
    { id: 'notes', label: '7-10 Other details', status: 'Student editable' },
  ]

  const errorText = (field: keyof AvlokanFormValues) => {
    const error = errors[field]
    return error && 'message' in error ? <span className="field-error">{error.message}</span> : null
  }

  return (
    <form className="avlokan-layout" onSubmit={handleSubmit((values) => saveAvlokan(values, 'Submitted'))}>
      <aside className="avlokan-stepper">
        <div className="avlokan-stepper-heading">
          <p className="eyebrow">September 2026</p>
          <h3>Monthly Avlokan</h3>
          <span className="status-chip">{recordStatus}</span>
        </div>
        {sections.map((section) => (
          <button key={section.id} type="button" className={`avlokan-step ${activeSection === section.id ? 'active' : ''}`} onClick={() => setActiveSection(section.id)}>
            <strong>{section.label}</strong>
            <small>{section.locked ?? section.status}</small>
          </button>
        ))}
      </aside>

      <section className="avlokan-section-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Section {sections.findIndex((section) => section.id === activeSection) + 1} of {sections.length}</p>
            <h3>{sections.find((section) => section.id === activeSection)?.label}</h3>
          </div>
          <span className="status-chip">{sections.find((section) => section.id === activeSection)?.locked ? 'Locked' : 'Draft'}</span>
        </div>

        {activeSection === 'work' && <section className="form-section-content">
          <p className="section-helper">Filled by Student. Grade will be added by the Department Head.</p>
          <label>What work were you assigned?<textarea {...register('work_description')} placeholder="Describe the work assigned this month." /></label>
          {errorText('work_description')}
          <label>Days completed<input type="number" min="0" max="31" {...register('days_done', { valueAsNumber: true })} /></label>
          {errorText('days_done')}
          <ConditionalReasonField register={register} name="work_done_fully" checked={workDoneFully} reasonName="work_reason_not_done" options={['Ill', 'Leave', 'Other']} />
        </section>}

        {activeSection === 'earn' && <section className="form-section-content">
          <p className="section-helper">Filled by Student. Grade will be added by the Earn & Learn Head.</p>
          <label>Wellwisher name<input type="text" {...register('earn_wellwisher_name')} /></label>
          <label>Wellwisher phone<input type="tel" {...register('earn_wellwisher_phone')} /></label>
          {errorText('earn_wellwisher_phone')}
          <label>Earn & Learn type<select {...register('earn_learn_type')}><option>Regular</option><option>Seasonal</option><option>Samiti Management</option></select></label>
          <label>Amount (₹)<input type="number" min="0" step="0.01" {...register('earn_amount', { valueAsNumber: true })} /></label>
          <ConditionalReasonField register={register} name="earn_done_fully" checked={earnDoneFully} reasonName="earn_reason_not_done" options={['Ill', 'Leave', 'Other', 'Exam']} />
        </section>}

        {activeSection === 'palak' && <section className="form-section-content">
          <p className="section-helper">Submit this meeting on behalf of your Palak. A fresh photo and location are required for verification.</p>
          <label>Meeting date<input type="date" {...register('palak_meeting_date')} /></label>
          {errorText('palak_meeting_date')}
          <label>Discussion notes<textarea {...register('palak_discussion_notes')} placeholder="What did you discuss with your Palak this month?" /></label>
          {errorText('palak_discussion_notes')}
          <label>Meeting photo<input type="file" accept="image/*" capture="environment" onChange={handlePhoto} /></label>
          <input type="hidden" {...register('palak_photo')} />
          {errorText('palak_photo')}
          {locationMessage ? <p className="location-message">{locationMessage}</p> : null}
          <div className="verification-box"><span className="status-chip">{palakVerification}</span><p>{palakVerification === 'Pending' ? 'Palak Head verification will appear here after submission.' : palakVerificationNotes}</p></div>
        </section>}

        {activeSection === 'vvk' && <section className="form-section-content">
          <p className="section-helper">Filled by Student. Grade will be added by the VVK Head.</p>
          <label>Your favourite VVK lecture this month<input type="text" {...register('favourite_lecture_1')} /></label>
          {errorText('favourite_lecture_1')}
          <label>Your second favourite VVK lecture<input type="text" {...register('favourite_lecture_2')} /></label>
          {errorText('favourite_lecture_2')}
        </section>}

        {activeSection === 'leaves' && <section className="form-section-content">
          <p className="section-helper">Add every leave period for this month.</p>
          {leaveFields.map((field, index) => <div className="leave-row" key={field.id}>
            <label>From<input type="date" {...register(`leaves.${index}.from_date`)} /></label>
            <label>To<input type="date" {...register(`leaves.${index}.to_date`)} /></label>
            <label>Reason<input type="text" {...register(`leaves.${index}.reason`)} /></label>
            <button type="button" className="danger-button small-button" onClick={() => remove(index)}>Remove</button>
          </div>)}
          <button type="button" className="secondary" onClick={() => append({ from_date: '', to_date: '', reason: '' })}>+ Add leave period</button>
        </section>}

        {activeSection === 'notes' && <section className="form-section-content">
          <p className="section-helper">Student notes and other monthly details.</p>
          <label>Health issues or doctor visits<textarea {...register('health_issue')} placeholder="Any health issues or doctor visits this month?" /></label>
          <label>Any misbehaviour<textarea {...register('misbehaviour_notes')} /></label>
          <label>Other activities<textarea {...register('other_activities')} /></label>
          <h4 className="subsection-heading">10. Other details</h4>
          <label>10.1 Exam details<textarea {...register('exam_details')} /></label>
          <label>10.2 Academic problems<textarea {...register('academic_problems')} /></label>
          <label>10.3 Special events<textarea {...register('special_events')} /></label>
          <label>10.4 What are you reading this month?<input type="text" {...register('reading_this_month')} /></label>
          <label>10.5 Computer usage<textarea {...register('computer_usage')} /></label>
          <label>10.6 Complaints or suggestions<textarea {...register('complaints_suggestions')} /></label>
          <label>10.7 Financial aid amount (₹)<input type="number" min="0" step="0.01" {...register('financial_aid_amount', { valueAsNumber: true })} /></label>
          <label>10.7 Financial aid details<input type="text" {...register('financial_aid_notes')} /></label>
          <label>10.8 Other remarks<textarea {...register('other_remarks')} /></label>
        </section>}

        <div className="avlokan-actions">
          <button type="button" className="secondary" onClick={handleSubmit((values) => saveAvlokan(values, 'Draft'))}>Save section as draft</button>
          <button type="submit" className="primary">Submit Avlokan</button>
        </div>
        {saveMessage ? <p className="success-message">{saveMessage}</p> : null}
      </section>
    </form>
  )
}

function ConditionalReasonField({ register, name, checked, reasonName, options }: { register: ReturnType<typeof useForm<AvlokanFormValues>>['register']; name: 'work_done_fully' | 'earn_done_fully'; checked: boolean; reasonName: 'work_reason_not_done' | 'earn_reason_not_done'; options: string[] }) {
  return <div className="conditional-field">
    <label className="checkbox-label"><input type="checkbox" {...register(name)} /> Was this completed in full?</label>
    {!checked ? <label>Reason not done<select {...register(reasonName)}><option value="">Select a reason</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label> : null}
  </div>
}

function HeadDashboard({ title, section, submissions, onGradeUpdate }: { title: string; section: ReviewSection; submissions: SubmittedAvlokan[]; onGradeUpdate: (submissionId: string, section: ReviewSection, grade: string) => void }) {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(submissions[0]?.id ?? null)
  const selectedSubmission = submissions.find((submission) => submission.id === selectedSubmissionId)
  const gradeOptions = section === 'block' ? ['Good', 'Satisfactory', 'Bad'] : ['A', 'B', 'C']

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-header">
          <h3>{title} submissions</h3>
        </div>
        {submissions.length === 0 ? <div className="student-empty-state"><h4>No submitted records</h4><p>Student submissions will appear here for grading.</p></div> : <div className="review-student-list">
          {submissions.map((submission) => <button type="button" className={`review-student ${selectedSubmissionId === submission.id ? 'active' : ''}`} key={submission.id} onClick={() => setSelectedSubmissionId(submission.id)}>
            <strong>{submission.studentName}</strong>
            <span>{submission.month} {submission.year} · {submission.grades[section] ?? 'Pending grade'}</span>
          </button>)}
        </div>}
      </section>

      <section className="panel panel-wide">
        <div className="panel-header"><h3>{selectedSubmission ? `Grade ${selectedSubmission.studentName}` : 'Grade submission'}</h3><span className="role-label">{title}</span></div>
        {selectedSubmission ? <div className="grading-panel">
          <ReviewDetail label="Submission month" value={`${selectedSubmission.month} ${selectedSubmission.year}`} />
          <ReviewDetail label="Student work context" value={selectedSubmission.values.work_description || 'No student text for this section.'} />
          <label>Grade<select value={selectedSubmission.grades[section] ?? ''} onChange={(event) => onGradeUpdate(selectedSubmission.id, section, event.target.value)}>
            <option value="">Select grade</option>
            {gradeOptions.map((grade) => <option key={grade}>{grade}</option>)}
          </select></label>
          <p className="success-message">Grade changes are saved for this submitted record.</p>
        </div> : <div className="student-empty-state"><h4>Select a student</h4><p>Choose a submitted record to grade this section.</p></div>}
      </section>
    </div>
  )
}

function PalakDashboard({ submissions, onGradeUpdate }: { submissions: SubmittedAvlokan[]; onGradeUpdate: (submissionId: string, section: ReviewSection, grade: string) => void }) {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null)
  const selectedSubmission = submissions.find((submission) => submission.id === selectedSubmissionId)

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-header">
          <h3>Palak submissions</h3>
        </div>
        {submissions.length === 0 ? <div className="student-empty-state"><h4>No submitted records</h4><p>Palak meeting submissions will appear here.</p></div> : <div className="review-student-list">
          {submissions.map((submission) => <button type="button" className={`review-student ${selectedSubmissionId === submission.id ? 'active' : ''}`} key={submission.id} onClick={() => setSelectedSubmissionId(submission.id)}>
            <strong>{submission.studentName}</strong><span>{submission.month} {submission.year}</span>
          </button>)}
        </div>}
      </section>
      <section className="panel panel-wide">
        <div className="panel-header"><h3>{selectedSubmission ? `Verify ${selectedSubmission.studentName}'s Palak meeting` : 'Verify Palak meeting'}</h3></div>
        {selectedSubmission ? <div className="grading-panel">
          <ReviewDetail label="Meeting date" value={selectedSubmission.values.palak_meeting_date} />
          <ReviewDetail label="Discussion notes" value={selectedSubmission.values.palak_discussion_notes} />
          <ReviewDetail label="Location" value={selectedSubmission.values.palak_geo_lat && selectedSubmission.values.palak_geo_long ? `${selectedSubmission.values.palak_geo_lat}, ${selectedSubmission.values.palak_geo_long}` : 'Not captured'} />
          <div className="palak-photo-review">
            <div className="palak-photo-review-header">
              <span>Meeting photo</span>
              {selectedSubmission.values.palak_photo ? <a href={selectedSubmission.values.palak_photo} target="_blank" rel="noreferrer">Open full size</a> : null}
            </div>
            {selectedSubmission.values.palak_photo ? <img src={selectedSubmission.values.palak_photo} alt={`${selectedSubmission.studentName}'s Palak meeting`} /> : <p className="photo-missing-message">No meeting photo was submitted. Keep verification pending or mark it disputed.</p>}
          </div>
          <label>Verification status<select value={selectedSubmission.grades.palak ?? 'Pending'} onChange={(event) => onGradeUpdate(selectedSubmission.id, 'palak', event.target.value)}><option>Pending</option><option>Verified</option><option>Disputed</option></select></label>
        </div> : <div className="student-empty-state"><h4>Select a student</h4><p>Choose a submitted record to verify the Palak meeting.</p></div>}
      </section>
    </div>
  )
}

function ReviewDetail({ label, value }: { label: string; value: string }) {
  return <div className="review-detail"><span>{label}</span><strong>{value}</strong></div>
}

export default App
