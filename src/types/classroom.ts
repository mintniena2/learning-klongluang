export type CourseLevel = 'm-ton' | 'm-ปลาย';

export interface LessonPage {
  title: string;
  content: string;
  infographicUrl: string;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  ans: number;
}

export interface MatchingPair {
  id: string;
  term: string;
  match: string;
}

export interface Lesson {
  id: string;
  code: string;
  title: string;
  session: string;
  isLocked: boolean;
  pages: LessonPage[];
  assignmentTasks: string[];
  questions: QuizQuestion[];
  gameMode?: 'matching' | 'flip';
  customMatchingPairs?: MatchingPair[];
  isCustom?: boolean;
}

export type CoursesByLevel = Record<CourseLevel, Lesson[]>;

export interface StudentRecord {
  stdId: string;
  stdName: string;
  level: string;
  lessonId: string;
  courseCode?: string;
  session: string;
  lessonTitle: string;
  attendedAt: string;
  quizAttempts: number;
  bestQuizScore: number;
  quizPassed: boolean | string;
  assignmentAnswers: Record<string, unknown> | string;
  assignmentScore: number | string | null;
  teacherFeedback: string;
  termAttendanceScore?: number | string;
  // Raw/legacy aliases that may arrive from Google Sheets
  stdid?: string;
  stdname?: string;
  lessonid?: string;
  coursecode?: string;
  lessontitle?: string;
  attendedat?: string;
  quizattempts?: number;
  bestquizscore?: number;
  quizpassed?: boolean | string;
  assignmentanswers?: Record<string, unknown> | string;
  assignmentscore?: number | string | null;
  teacherfeedback?: string;
  termattendancescore?: number | string;
}

export interface TrashedRecord {
  trashKey: string;
  deletedAt: string;
  deletedReason?: string;
  record: StudentRecord;
}

export interface CmsSettings {
  newsHeading: string;
  newsBody: string;
  newsImageUrl: string;
  coverImageUrl: string;
  kpcEnabled: boolean;
  kpcTitle: string;
  kpcMessage: string;
  readSecondsPerPage: number;
  deletedLessonIds: string[];
  updatedAt?: string;
}

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  updatedAt?: string;
}

export interface TermAttendanceEntry {
  stdId: string;
  stdName: string;
  score: number;
}

export type ViewId =
  | 'view-home'
  | 'view-lessons'
  | 'view-lesson-login'
  | 'view-step-read'
  | 'view-step-matching'
  | 'view-step-assignment'
  | 'view-step-quiz'
  | 'view-student-login'
  | 'view-student-result'
  | 'view-teacher-login'
  | 'view-teacher-dashboard';
