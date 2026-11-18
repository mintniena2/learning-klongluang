import { ALL_COURSES_DATA } from '../data/coursesData';
import type {
  CmsSettings,
  CourseLevel,
  CoursesByLevel,
  Lesson,
  MaintenanceState,
  StudentRecord,
  TermAttendanceEntry,
  TrashedRecord,
} from '../types/classroom';

export const GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyDgW6Fwgt6OJtnxURoeApPNcdSFk3sKHEQbjJyLN04vWouS4sNm2yyNMtwZMIEu3sR/exec';

export const FORCE_MAINTENANCE_MODE = false;

const RECORDS_CACHE_KEY = 'clc_records_cache';
const PENDING_SYNC_KEY = 'clc_pending_sync_queue';
const TERM_ATTENDANCE_KEY = 'clc_term_attendance_scores';
const MAINTENANCE_KEY = 'clc_maintenance_mode';
const TRASH_CACHE_KEY = 'clc_trash_cache';
const CMS_SETTINGS_KEY = 'clc_cms_settings';
const CMS_LESSONS_KEY = 'clc_cms_lesson_overrides';

export const DEFAULT_CMS_SETTINGS: CmsSettings = {
  newsHeading: 'ประกาศสำหรับนักศึกษา ศรช. ปีการศึกษา 2569 ภาคเรียนที่ 2',
  newsBody:
    'ยินดีต้อนรับนักศึกษา ศรช. ปีการศึกษา 2569 ภาคเรียนที่ 2 ติดตามข่าวสารและกำหนดการเรียนได้ที่นี่ครับ กรุณาเข้าเรียนตามรายวิชาที่เปิดสอน อ่านเนื้อหา เล่นเกมจับคู่ความรู้ พิมพ์ตอบใบงานด้วยตนเอง และทำแบบทดสอบให้ครบถ้วน',
  newsImageUrl: 'images/news.png',
  coverImageUrl: 'images/cover.png',
  kpcEnabled: true,
  kpcTitle: 'แจ้งเตือนสำคัญ',
  kpcMessage: 'อย่าลืมเก็บคะแนน กพช.!',
  readSecondsPerPage: 10,
  deletedLessonIds: [],
};

export function normalizeStdId(id: unknown): string {
  return String(id ?? '').trim().replace(/^0+/, '');
}

export function sanitizeStudentIdInput(raw: string): string {
  return String(raw || '').replace(/\D/g, '').slice(0, 10);
}

export function validateStudentId(rawId: string): { valid: boolean; clean: string; error: string } {
  const clean = String(rawId || '').trim();
  if (!clean) {
    return {
      valid: false,
      clean,
      error: 'กรุณากรอกรหัสนักศึกษา (ต้องขึ้นต้นด้วยเลข 6 และมี 10 หลัก)',
    };
  }
  if (!/^\d+$/.test(clean)) {
    return {
      valid: false,
      clean,
      error: 'รหัสนักศึกษาต้องเป็นตัวเลขเท่านั้น ห้ามมีตัวอักษรหรือเว้นวรรค',
    };
  }
  if (!clean.startsWith('6')) {
    return {
      valid: false,
      clean,
      error: 'รหัสนักศึกษาต้องขึ้นต้นด้วยเลข 6 เท่านั้น (เช่น 69xxxxxxxx)',
    };
  }
  if (clean.length !== 10) {
    return {
      valid: false,
      clean,
      error: `รหัสนักศึกษาต้องมีจำนวน 10 หลักเท่านั้น (ตอนนี้กรอกมา ${clean.length} หลัก)`,
    };
  }
  return { valid: true, clean, error: '' };
}

export function resolveFallbackImageUrl(src: string): string | null {
  const s = String(src || '').trim();
  if (!s) return null;
  if (s.startsWith('images/')) {
    return `https://mintniena2.github.io/learning-klongluang/${s}`;
  }
  return null;
}

export function getRecordTrashKey(r: Pick<StudentRecord, 'stdId' | 'stdid' | 'lessonId' | 'lessonid'>): string {
  const sid = normalizeStdId(r.stdId || r.stdid || '') || String(r.stdId || r.stdid || '').trim();
  const lid = String(r.lessonId || r.lessonid || '').trim();
  return `${sid}__${lid}`;
}

export function hasStudentSubmittedAssignment(r: StudentRecord): boolean {
  let answersObj: unknown = r.assignmentAnswers ?? r.assignmentanswers;
  if (typeof answersObj === 'string' && answersObj.trim().startsWith('{')) {
    try {
      answersObj = JSON.parse(answersObj);
    } catch {
      // keep raw string
    }
  }
  if (typeof answersObj === 'object' && answersObj !== null) {
    const obj = answersObj as Record<string, unknown>;
    if (obj.inClass) return false;
    return Object.values(obj).some((val) => String(val ?? '').trim() !== '');
  }
  if (typeof answersObj === 'string') {
    return answersObj.trim() !== '' && answersObj !== '{}';
  }
  return false;
}

export function getRecordAssignmentScore(r: StudentRecord): number | null {
  const val = r.assignmentScore !== undefined ? r.assignmentScore : r.assignmentscore;
  if (val !== '' && val !== null && val !== undefined && !isNaN(Number(val))) {
    return Number(val);
  }
  return null;
}

export function calculateSubjectSummary(
  totalSessions: number,
  totalQuizScore: number,
  totalAssignScore: number
): { rawScoreText: string; finalScore40: number; passed: boolean } {
  const rawScore = totalQuizScore + totalAssignScore;
  const maxRawScore = totalSessions * 20;
  let finalScore40 = 0;
  let percentScore = 0;
  if (maxRawScore > 0) {
    finalScore40 = Number(((rawScore / maxRawScore) * 40).toFixed(2));
    percentScore = Math.round((rawScore / maxRawScore) * 100);
  }
  return {
    rawScoreText: `${rawScore} / ${maxRawScore}`,
    finalScore40,
    passed: percentScore >= 50,
  };
}

// ---------- Local Cache Accessors ----------

export function loadCachedRecords(): StudentRecord[] {
  try {
    const raw = localStorage.getItem(RECORDS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCachedRecords(records: StudentRecord[]): void {
  try {
    localStorage.setItem(RECORDS_CACHE_KEY, JSON.stringify(records));
  } catch {
    // ignore storage quota errors
  }
}

export function loadCachedTrash(): TrashedRecord[] {
  try {
    const raw = localStorage.getItem(TRASH_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCachedTrash(trash: TrashedRecord[]): void {
  try {
    localStorage.setItem(TRASH_CACHE_KEY, JSON.stringify(trash));
  } catch {
    // ignore
  }
}

export function getTermAttendanceStore(): Record<string, TermAttendanceEntry> {
  try {
    return JSON.parse(localStorage.getItem(TERM_ATTENDANCE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function saveTermAttendanceToStore(stdId: string, stdName: string, score: number): void {
  const store = getTermAttendanceStore();
  const key = String(stdId).trim();
  store[key] = {
    stdId: key,
    stdName: String(stdName || '').trim(),
    score: Number(score),
  };
  localStorage.setItem(TERM_ATTENDANCE_KEY, JSON.stringify(store));
}

export function getTermAttendanceScore(stdId: string, studentRecords: StudentRecord[] = []): number | null {
  const cleanId = String(stdId || '').trim();
  const normId = normalizeStdId(cleanId);
  for (const r of studentRecords) {
    const val = r.termAttendanceScore !== undefined ? r.termAttendanceScore : r.termattendancescore;
    if (val !== undefined && val !== null && val !== '') {
      return Number(val);
    }
  }
  const store = getTermAttendanceStore();
  const entry = store[cleanId] || Object.values(store).find((e) => normalizeStdId(e.stdId) === normId);
  if (entry && entry.score !== undefined && entry.score !== null) {
    return Number(entry.score);
  }
  return null;
}

export function getMaintenanceState(): MaintenanceState {
  if (FORCE_MAINTENANCE_MODE) {
    return {
      enabled: true,
      message: 'ขณะนี้คุณครูกำลังปรับปรุงและอัปเดตข้อมูลระบบห้องเรียนออนไลน์ กรุณากลับมาใช้งานใหม่อีกครั้งครับ',
    };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(MAINTENANCE_KEY) || 'null');
    if (saved && typeof saved === 'object') return saved as MaintenanceState;
  } catch {
    // ignore
  }
  return { enabled: false, message: '' };
}

export function saveMaintenanceStateLocal(state: MaintenanceState): void {
  try {
    localStorage.setItem(MAINTENANCE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function loadCmsSettings(): CmsSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(CMS_SETTINGS_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return { ...DEFAULT_CMS_SETTINGS, ...saved };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CMS_SETTINGS };
}

export function saveCmsSettingsLocal(settings: CmsSettings): void {
  try {
    localStorage.setItem(CMS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export interface LessonOverrideEntry {
  level: CourseLevel;
  lesson: Lesson;
}

export function loadLessonOverrides(): Record<string, LessonOverrideEntry> {
  try {
    const saved = JSON.parse(localStorage.getItem(CMS_LESSONS_KEY) || 'null');
    if (saved && typeof saved === 'object') return saved;
  } catch {
    // ignore
  }
  return {};
}

export function saveLessonOverridesLocal(map: Record<string, LessonOverrideEntry>): void {
  try {
    localStorage.setItem(CMS_LESSONS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/**
 * รวมข้อมูลหลักจาก ALL_COURSES_DATA เข้ากับรายการที่ครูแก้ไข/เพิ่ม/ล็อคจากหลังบ้าน
 */
export function buildMergedCourses(
  overrides: Record<string, LessonOverrideEntry>,
  deletedLessonIds: string[] = []
): CoursesByLevel {
  const deletedSet = new Set(deletedLessonIds);
  const baseTon = ALL_COURSES_DATA['m-ton'].map((l) => ({ ...l }));
  const basePlai = ALL_COURSES_DATA['m-ปลาย'].map((l) => ({ ...l }));

  const applyOverrides = (list: Lesson[], level: CourseLevel): Lesson[] => {
    const out: Lesson[] = [];
    const seenIds = new Set<string>();

    list.forEach((orig) => {
      if (deletedSet.has(orig.id)) return;
      const ov = overrides[orig.id];
      if (ov && ov.level === level && ov.lesson) {
        out.push({ ...orig, ...ov.lesson });
      } else if (!ov) {
        out.push(orig);
      }
      seenIds.add(orig.id);
    });

    // Append custom/moved lessons for this level
    Object.values(overrides).forEach((ov) => {
      if (ov && ov.level === level && ov.lesson && !deletedSet.has(ov.lesson.id) && !seenIds.has(ov.lesson.id)) {
        out.push({ ...ov.lesson });
        seenIds.add(ov.lesson.id);
      }
    });

    return out;
  };

  return {
    'm-ton': applyOverrides(baseTon, 'm-ton'),
    'm-ปลาย': applyOverrides(basePlai, 'm-ปลาย'),
  };
}

// ---------- Pending Sync Queue ----------

interface PendingSyncItem {
  action: string;
  data: unknown;
  key: string;
}

function getPendingSyncQueue(): PendingSyncItem[] {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePendingSyncQueue(queue: PendingSyncItem[]): void {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

function enqueuePendingAction(action: string, data: unknown, key: string): void {
  const queue = getPendingSyncQueue().filter((item) => item.key !== key);
  queue.push({ action, data, key });
  savePendingSyncQueue(queue);
}

async function postCloudPayload(action: string, data: unknown): Promise<boolean> {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('วาง_URL')) return false;
  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data }),
    });
    return true;
  } catch (err) {
    console.error('ส่งข้อมูลล้มเหลว:', err);
    return false;
  }
}

export async function flushPendingSyncQueue(): Promise<void> {
  const queue = getPendingSyncQueue();
  if (queue.length === 0) return;
  const remaining: PendingSyncItem[] = [];
  for (const item of queue) {
    const ok = await postCloudPayload(item.action, item.data);
    if (!ok) remaining.push(item);
  }
  savePendingSyncQueue(remaining);
}

export async function syncToCloud(recordData: StudentRecord): Promise<void> {
  const key = `save__${normalizeStdId(recordData.stdId) || recordData.stdId}__${recordData.lessonId}`;
  const ok = await postCloudPayload('save', recordData);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800));
    const retryOk = await postCloudPayload('save', recordData);
    if (!retryOk) {
      enqueuePendingAction('save', recordData, key);
    }
  }
}

// ---------- Cloud Trash Helpers (Dual-mode: Immediate v1 registry + v2 Google Sheet 'ถังขยะ') ----------

export async function syncTrashStateToCloud(
  trashList: TrashedRecord[],
  actionMeta?: { type: 'move' | 'restore' | 'permanent'; target: TrashedRecord }
): Promise<void> {
  saveCachedTrash(trashList);

  // 1) Save cloud trash registry row via standard 'save' so EVERY device sees deleted/restored state immediately!
  const registryRecord: StudentRecord = {
    stdId: '__SYSTEM_TRASH__',
    stdName: 'ระบบถังขยะกู้คืนข้อมูล',
    level: 'm-ton',
    lessonId: '__TRASH_REGISTRY__',
    courseCode: 'SYSTEM',
    session: 'ถังขยะ',
    lessonTitle: `ถังขยะ (${trashList.length} รายการ)`,
    attendedAt: new Date().toLocaleString('th-TH'),
    quizAttempts: 0,
    bestQuizScore: 0,
    quizPassed: false,
    assignmentAnswers: {
      items: trashList.map((t) => ({
        trashKey: t.trashKey,
        deletedAt: t.deletedAt,
        deletedReason: t.deletedReason || '',
        record: t.record,
      })),
    },
    assignmentScore: trashList.length,
    teacherFeedback: 'TRASH_REGISTRY',
  };

  await syncToCloud(registryRecord);

  // 2) Also emit dedicated v2 action for upgraded Google Apps Script (moves rows physically to 'ถังขยะ' sheet tab)
  if (actionMeta) {
    const actionName =
      actionMeta.type === 'move'
        ? 'moveToTrash'
        : actionMeta.type === 'restore'
          ? 'restoreFromTrash'
          : 'permanentDelete';
    await postCloudPayload(actionName, {
      trashKey: actionMeta.target.trashKey,
      deletedAt: actionMeta.target.deletedAt,
      deletedReason: actionMeta.target.deletedReason || '',
      record: actionMeta.target.record,
    });
  }
}

export async function saveLessonOverrideToCloud(level: CourseLevel, lesson: Lesson): Promise<void> {
  const overrides = loadLessonOverrides();
  overrides[lesson.id] = { level, lesson };
  saveLessonOverridesLocal(overrides);

  const cloudRow: StudentRecord = {
    stdId: '__CMS_LESSON__',
    stdName: `${lesson.code} ${lesson.session}`,
    level,
    lessonId: `__LESSON__${lesson.id}`,
    courseCode: lesson.code,
    session: lesson.session,
    lessonTitle: lesson.title,
    attendedAt: new Date().toLocaleString('th-TH'),
    quizAttempts: 0,
    bestQuizScore: 0,
    quizPassed: false,
    assignmentAnswers: {
      level,
      lesson,
    },
    assignmentScore: lesson.isLocked ? 1 : 0,
    teacherFeedback: lesson.isLocked ? 'CMS_LOCKED' : 'CMS_OPEN',
  };

  await syncToCloud(cloudRow);
}

export async function saveCmsSettingsToCloud(settings: CmsSettings): Promise<void> {
  const updated: CmsSettings = {
    ...settings,
    updatedAt: new Date().toLocaleString('th-TH'),
  };
  saveCmsSettingsLocal(updated);

  const cloudRow: StudentRecord = {
    stdId: '__CMS_CONFIG__',
    stdName: 'การตั้งค่าระบบหลังบ้าน',
    level: 'm-ton',
    lessonId: '__CMS_SETTINGS__',
    courseCode: 'SYSTEM',
    session: 'ตั้งค่าหลังบ้าน',
    lessonTitle: 'การตั้งค่าเว็บไซต์',
    attendedAt: new Date().toLocaleString('th-TH'),
    quizAttempts: 0,
    bestQuizScore: 0,
    quizPassed: false,
    assignmentAnswers: updated as unknown as Record<string, unknown>,
    assignmentScore: '',
    teacherFeedback: 'CMS_SETTINGS',
  };

  await syncToCloud(cloudRow);
}

export interface CloudFetchResult {
  ok: boolean;
  records: StudentRecord[];
  trash: TrashedRecord[];
  cmsSettings: CmsSettings;
  lessonOverrides: Record<string, LessonOverrideEntry>;
  maintenance: MaintenanceState;
  hasV2SheetTrash: boolean;
}

function normalizeRawRecord(raw: Record<string, unknown>): StudentRecord {
  const r = { ...raw } as unknown as StudentRecord;
  r.stdId = String(raw.stdId ?? raw.stdid ?? raw.std_id ?? '').trim();
  r.stdName = String(raw.stdName ?? raw.stdname ?? raw.std_name ?? '').trim();
  r.level = String(raw.level ?? raw.Level ?? 'm-ton').trim();
  r.lessonId = String(raw.lessonId ?? raw.lessonid ?? raw.lesson_id ?? '').trim();
  r.courseCode = String(raw.courseCode ?? raw.coursecode ?? '').trim();
  r.session = String(raw.session ?? raw.Session ?? '').trim();
  r.lessonTitle = String(raw.lessonTitle ?? raw.lessontitle ?? '').trim();
  r.attendedAt = String(raw.attendedAt ?? raw.attendedat ?? '').trim();

  if (r.quizAttempts === undefined && raw.quizattempts !== undefined) {
    r.quizAttempts = Number(raw.quizattempts) || 0;
  } else {
    r.quizAttempts = Number(r.quizAttempts) || 0;
  }
  if (r.bestQuizScore === undefined && raw.bestquizscore !== undefined) {
    r.bestQuizScore = Number(raw.bestquizscore) || 0;
  } else {
    r.bestQuizScore = Number(r.bestQuizScore) || 0;
  }
  if (r.quizPassed === undefined && raw.quizpassed !== undefined) {
    r.quizPassed = raw.quizpassed as boolean | string;
  }
  if (r.assignmentScore === undefined && raw.assignmentscore !== undefined) {
    r.assignmentScore = raw.assignmentscore as number | string | null;
  }
  if (r.teacherFeedback === undefined && raw.teacherfeedback !== undefined) {
    r.teacherFeedback = String(raw.teacherfeedback ?? '');
  } else {
    r.teacherFeedback = String(r.teacherFeedback ?? '');
  }

  let ans = raw.assignmentAnswers ?? raw.assignmentanswers;
  if (typeof ans === 'string' && ans.trim().startsWith('{')) {
    try {
      ans = JSON.parse(ans);
    } catch {
      // keep raw
    }
  }
  r.assignmentAnswers = (ans ?? {}) as Record<string, unknown> | string;
  return r;
}

export async function fetchAllFromCloud(): Promise<CloudFetchResult | null> {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('วาง_URL')) return null;

  try {
    await flushPendingSyncQueue();
    const nocache = Date.now();
    const [recordsRes, trashRes] = await Promise.all([
      fetch(`${GOOGLE_SCRIPT_URL}?action=getRecords&nocache=${nocache}`, { cache: 'no-store' }),
      fetch(`${GOOGLE_SCRIPT_URL}?action=getTrash&nocache=${nocache}`, { cache: 'no-store' }).catch(() => null),
    ]);

    const data = await recordsRes.json();
    if (!Array.isArray(data)) return null;

    let hasV2SheetTrash = false;
    let v2TrashItems: TrashedRecord[] = [];
    if (trashRes) {
      try {
        const trashJson = await trashRes.json();
        if (trashJson && !Array.isArray(trashJson) && Number(trashJson.version) >= 2 && Array.isArray(trashJson.trash)) {
          hasV2SheetTrash = true;
          v2TrashItems = trashJson.trash.map((t: Record<string, unknown>) => {
            const rec = normalizeRawRecord((t.record as Record<string, unknown>) || t);
            return {
              trashKey: String(t.trashKey || getRecordTrashKey(rec)),
              deletedAt: String(t.deletedAt || new Date().toLocaleString('th-TH')),
              deletedReason: String(t.deletedReason || ''),
              record: rec,
            };
          });
        }
      } catch {
        // v1 Apps Script returns array or non-v2
      }
    }

    const termStore = getTermAttendanceStore();
    const mergedMap = new Map<string, StudentRecord>();
    const extraRows: StudentRecord[] = [];
    const attendanceMetaRows: StudentRecord[] = [];
    let cloudTrashItems: TrashedRecord[] = loadCachedTrash();
    let cmsSettings: CmsSettings = loadCmsSettings();
    const lessonOverrides: Record<string, LessonOverrideEntry> = { ...loadLessonOverrides() };
    let maintenance: MaintenanceState = getMaintenanceState();

    data.forEach((rawItem: Record<string, unknown>) => {
      const r = normalizeRawRecord(rawItem);
      const lId = r.lessonId;

      if (lId === '__TERM_ATTENDANCE__') {
        attendanceMetaRows.push(r);
        return;
      }

      if (lId === '__MAINTENANCE_MODE__') {
        if (r.assignmentAnswers && typeof r.assignmentAnswers === 'object') {
          maintenance = r.assignmentAnswers as unknown as MaintenanceState;
          saveMaintenanceStateLocal(maintenance);
        }
        return;
      }

      if (lId === '__TRASH_REGISTRY__') {
        const obj = r.assignmentAnswers as Record<string, unknown>;
        if (obj && Array.isArray(obj.items)) {
          cloudTrashItems = obj.items.map((t: unknown) => {
            const item = t as Record<string, unknown>;
            const rec = normalizeRawRecord((item.record as Record<string, unknown>) || {});
            return {
              trashKey: String(item.trashKey || getRecordTrashKey(rec)),
              deletedAt: String(item.deletedAt || ''),
              deletedReason: String(item.deletedReason || ''),
              record: rec,
            };
          });
        }
        return;
      }

      if (lId === '__CMS_SETTINGS__') {
        if (r.assignmentAnswers && typeof r.assignmentAnswers === 'object') {
          cmsSettings = { ...DEFAULT_CMS_SETTINGS, ...(r.assignmentAnswers as Partial<CmsSettings>) };
          saveCmsSettingsLocal(cmsSettings);
        }
        return;
      }

      if (lId.startsWith('__LESSON__')) {
        const payload = r.assignmentAnswers as Record<string, unknown>;
        if (payload && payload.lesson && typeof payload.lesson === 'object') {
          const ovLesson = payload.lesson as Lesson;
          const ovLevel = (payload.level === 'm-ปลาย' ? 'm-ปลาย' : 'm-ton') as CourseLevel;
          lessonOverrides[ovLesson.id] = { level: ovLevel, lesson: ovLesson };
        }
        return;
      }

      const cloudTermAtt = r.termAttendanceScore !== undefined ? r.termAttendanceScore : rawItem.termattendancescore;
      if (r.stdId && cloudTermAtt !== undefined && cloudTermAtt !== null && cloudTermAtt !== '') {
        r.termAttendanceScore = Number(cloudTermAtt);
        termStore[r.stdId] = {
          stdId: r.stdId,
          stdName: r.stdName,
          score: Number(cloudTermAtt),
        };
      }

      const normId = normalizeStdId(r.stdId) || r.stdId;
      if (normId && lId) {
        const key = `${normId}__${lId}`;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, r);
        } else {
          const prev = mergedMap.get(key)!;
          if (!prev.stdName && r.stdName) prev.stdName = r.stdName;
          if (r.stdId.length > prev.stdId.length) prev.stdId = r.stdId;
          prev.bestQuizScore = Math.max(Number(prev.bestQuizScore) || 0, Number(r.bestQuizScore) || 0);
          if (r.quizPassed === true || r.quizPassed === 'ผ่าน' || prev.bestQuizScore >= 6) {
            prev.quizPassed = true;
          }
          if (hasStudentSubmittedAssignment(r) && !hasStudentSubmittedAssignment(prev)) {
            prev.assignmentAnswers = r.assignmentAnswers;
          }
          const rScore = getRecordAssignmentScore(r);
          if (rScore !== null) {
            prev.assignmentScore = rScore;
          }
          if (r.teacherFeedback) {
            prev.teacherFeedback = r.teacherFeedback;
          }
          if (r.termAttendanceScore !== undefined && r.termAttendanceScore !== '') {
            prev.termAttendanceScore = r.termAttendanceScore;
          }
        }
      } else {
        extraRows.push(r);
      }
    });

    // Combine Trash: if v2 sheet exists, merge v2 physical trash sheet items with registry
    const finalTrashMap = new Map<string, TrashedRecord>();
    if (hasV2SheetTrash) {
      v2TrashItems.forEach((t) => finalTrashMap.set(t.trashKey, t));
    } else {
      cloudTrashItems.forEach((t) => finalTrashMap.set(t.trashKey, t));
    }
    const finalTrash = Array.from(finalTrashMap.values());
    const trashedKeySet = new Set(finalTrash.map((t) => t.trashKey));

    // Exclude trashed records from active records across all devices
    let cleanedRecords = [...Array.from(mergedMap.values()), ...extraRows].filter(
      (rec) => !trashedKeySet.has(getRecordTrashKey(rec))
    );

    attendanceMetaRows.forEach((r) => {
      if (!r.stdId) return;
      let metaScore: unknown = r.termAttendanceScore ?? r.termattendancescore;
      if (metaScore === undefined || metaScore === null || metaScore === '') {
        const fb = String(r.teacherFeedback || '');
        const parsedAns = r.assignmentAnswers;
        if (fb.startsWith('TERM_ATTENDANCE:')) {
          metaScore = fb.replace('TERM_ATTENDANCE:', '').trim();
        } else if (parsedAns && typeof parsedAns === 'object' && 'termAttendanceScore' in parsedAns) {
          metaScore = (parsedAns as Record<string, unknown>).termAttendanceScore;
        } else if (r.assignmentScore !== undefined && r.assignmentScore !== null && r.assignmentScore !== '') {
          metaScore = r.assignmentScore;
        }
      }
      if (metaScore !== undefined && metaScore !== null && metaScore !== '' && !isNaN(Number(metaScore))) {
        const numScore = Number(metaScore);
        termStore[r.stdId] = {
          stdId: r.stdId,
          stdName: r.stdName,
          score: numScore,
        };
        const metaNormId = normalizeStdId(r.stdId);
        cleanedRecords = cleanedRecords.map((rec) =>
          normalizeStdId(rec.stdId) === metaNormId ? { ...rec, termAttendanceScore: numScore } : rec
        );
      }
    });

    localStorage.setItem(TERM_ATTENDANCE_KEY, JSON.stringify(termStore));
    saveCachedRecords(cleanedRecords);
    saveCachedTrash(finalTrash);
    saveLessonOverridesLocal(lessonOverrides);

    return {
      ok: true,
      records: cleanedRecords,
      trash: finalTrash,
      cmsSettings,
      lessonOverrides,
      maintenance,
      hasV2SheetTrash,
    };
  } catch (err) {
    console.error('ดึงข้อมูลจากคลาวด์ไม่สำเร็จ:', err);
    return null;
  }
}

export const APPS_SCRIPT_V2_CODE = `// ============================================================
// Google Apps Script (v2) — รองรับชีต "ถังขยะ" และระบบหลังบ้านครบชุด
// วิธีติดตั้ง:
// 1. เปิด Google Sheet ของคุณ > ส่วนขยาย (Extensions) > Apps Script
// 2. วางโค้ดนี้แทนที่โค้ดเดิมทั้งหมด แล้วกดบันทึก (Ctrl+S)
// 3. กด "ทำให้ใช้งานได้" (Deploy) > "จัดการการทำให้ใช้งานได้" > กดไอคอนดินสอ > เลือก "เวอร์ชันใหม่" > กด Deploy
// ============================================================

var MAIN_SHEET_INDEX = 0;
var TRASH_SHEET_NAME = 'ถังขยะ';

var HEADERS = [
  'stdId', 'stdName', 'level', 'lessonId', 'session',
  'lessonTitle', 'attendedAt', 'bestQuizScore', 'quizPassed',
  'assignmentAnswers', 'assignmentScore', 'teacherFeedback', 'termAttendanceScore'
];

function getMainSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets()[MAIN_SHEET_INDEX];
}

function getTrashSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TRASH_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TRASH_SHEET_NAME);
    sheet.appendRow(HEADERS.concat(['deletedAt', 'deletedReason', 'trashKey']));
  }
  return sheet;
}

function normId_(v) {
  return String(v || '').trim().replace(/^0+/, '');
}

function sheetToObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[String(headers[j])] = row[j];
    }
    out.push(obj);
  }
  return out;
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'getRecords';
  if (action === 'getTrash') {
    var trashSheet = getTrashSheet_();
    var rows = sheetToObjects_(trashSheet);
    var items = rows.map(function(r) {
      return {
        trashKey: r.trashKey || (normId_(r.stdId) + '__' + String(r.lessonId || '')),
        deletedAt: r.deletedAt || '',
        deletedReason: r.deletedReason || '',
        record: r
      };
    });
    return ContentService.createTextOutput(JSON.stringify({ version: 2, trash: items }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var mainSheet = getMainSheet_();
  var records = sheetToObjects_(mainSheet);
  return ContentService.createTextOutput(JSON.stringify(records))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || 'save';
    var data = payload.data || {};

    if (action === 'moveToTrash') {
      var rec = data.record || data;
      var targetSid = normId_(rec.stdId);
      var targetLid = String(rec.lessonId || '').trim();
      var mainSheet = getMainSheet_();
      var values = mainSheet.getDataRange().getValues();
      var headers = values[0] || HEADERS;
      var sidIdx = headers.indexOf('stdId');
      var lidIdx = headers.indexOf('lessonId');

      for (var i = values.length - 1; i >= 1; i--) {
        if (normId_(values[i][sidIdx]) === targetSid && String(values[i][lidIdx]).trim() === targetLid) {
          mainSheet.deleteRow(i + 1);
        }
      }

      var trashSheet = getTrashSheet_();
      var rowOut = HEADERS.map(function(h) {
        var val = rec[h];
        if (h === 'assignmentAnswers' && typeof val === 'object' && val !== null) {
          return JSON.stringify(val);
        }
        return val !== undefined && val !== null ? val : '';
      });
      rowOut.push(data.deletedAt || new Date().toLocaleString('th-TH'));
      rowOut.push(data.deletedReason || '');
      rowOut.push(data.trashKey || (targetSid + '__' + targetLid));
      trashSheet.appendRow(rowOut);

      return ContentService.createTextOutput(JSON.stringify({ ok: true, movedToTrash: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'restoreFromTrash') {
      var rec = data.record || data;
      var targetSid = normId_(rec.stdId);
      var targetLid = String(rec.lessonId || '').trim();
      var trashSheet = getTrashSheet_();
      var values = trashSheet.getDataRange().getValues();
      var headers = values[0] || [];
      var sidIdx = headers.indexOf('stdId');
      var lidIdx = headers.indexOf('lessonId');

      for (var i = values.length - 1; i >= 1; i--) {
        if (normId_(values[i][sidIdx]) === targetSid && String(values[i][lidIdx]).trim() === targetLid) {
          trashSheet.deleteRow(i + 1);
        }
      }

      upsertMainRow_(rec);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, restored: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'permanentDelete') {
      var rec = data.record || data;
      var targetSid = normId_(rec.stdId);
      var targetLid = String(rec.lessonId || '').trim();
      var trashSheet = getTrashSheet_();
      var values = trashSheet.getDataRange().getValues();
      var headers = values[0] || [];
      var sidIdx = headers.indexOf('stdId');
      var lidIdx = headers.indexOf('lessonId');

      for (var i = values.length - 1; i >= 1; i--) {
        if (normId_(values[i][sidIdx]) === targetSid && String(values[i][lidIdx]).trim() === targetLid) {
          trashSheet.deleteRow(i + 1);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true, deletedPermanently: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    upsertMainRow_(data);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function upsertMainRow_(data) {
  var sheet = getMainSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length === 0) {
    sheet.appendRow(HEADERS);
    values = [HEADERS];
  }
  var headers = values[0];
  var sidIdx = headers.indexOf('stdId');
  var lidIdx = headers.indexOf('lessonId');
  var targetSid = normId_(data.stdId);
  var targetLid = String(data.lessonId || '').trim();

  var rowValues = headers.map(function(h) {
    var val = data[h];
    if (h === 'quizPassed') {
      if (val === true || val === 'ผ่าน') return 'ผ่าน';
      return 'ไม่ผ่าน';
    }
    if (h === 'assignmentAnswers' && typeof val === 'object' && val !== null) {
      return JSON.stringify(val);
    }
    return val !== undefined && val !== null ? val : '';
  });

  var foundRow = -1;
  for (var i = 1; i < values.length; i++) {
    if (normId_(values[i][sidIdx]) === targetSid && String(values[i][lidIdx]).trim() === targetLid) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}`;
