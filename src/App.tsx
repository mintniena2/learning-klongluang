import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TeacherCmsModal } from './components/TeacherCmsModal';
import { TrashModal } from './components/TrashModal';
import { getLessonMatchingPairs, isFlipGameLesson } from './data/coursesData';
import type {
  CmsSettings,
  CourseLevel,
  CoursesByLevel,
  Lesson,
  MaintenanceState,
  MatchingPair,
  StudentRecord,
  TermAttendanceEntry,
  TrashedRecord,
  ViewId,
} from './types/classroom';
import {
  buildMergedCourses,
  calculateSubjectSummary,
  DEFAULT_CMS_SETTINGS,
  fetchAllFromCloud,
  FORCE_MAINTENANCE_MODE,
  getMaintenanceState,
  getRecordAssignmentScore,
  getRecordTrashKey,
  getTermAttendanceScore,
  getTermAttendanceStore,
  hasStudentSubmittedAssignment,
  loadCachedRecords,
  loadCachedTrash,
  loadCmsSettings,
  loadLessonOverrides,
  normalizeStdId,
  resolveFallbackImageUrl,
  sanitizeStudentIdInput,
  saveCachedRecords,
  saveCmsSettingsLocal,
  saveCmsSettingsToCloud,
  saveLessonOverridesLocal,
  saveLessonOverrideToCloud,
  saveMaintenanceStateLocal,
  saveTermAttendanceToStore,
  syncToCloud,
  syncTrashStateToCloud,
  validateStudentId,
  type LessonOverrideEntry,
} from './utils/cloudSync';

interface FlipCardItem {
  uid: string;
  pairId: string;
  side: 'term' | 'match';
  text: string;
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

function shuffleList<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function SmartImage({
  src,
  alt,
  className,
  style,
  onAllFailed,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onAllFailed?: () => void;
}) {
  const [imgSrc, setImgSrc] = useState(src);
  const [triedFallback, setTriedFallback] = useState(false);

  useEffect(() => {
    setImgSrc(src);
    setTriedFallback(false);
  }, [src]);

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      style={style}
      onError={() => {
        if (!triedFallback) {
          const fallback = resolveFallbackImageUrl(src);
          if (fallback && fallback !== imgSrc) {
            setTriedFallback(true);
            setImgSrc(fallback);
            return;
          }
        }
        onAllFailed?.();
      }}
    />
  );
}

function StudentQuickLookup({
  students,
  onSelectStudent,
  onUseNewId,
  getExtraBadge,
  label = 'ค้นหาด่วนด้วยรหัสนักศึกษา หรือ ชื่อ (พิมพ์แล้วกดเลือก / กด Enter)',
  placeholder = 'พิมพ์รหัส (เช่น 6912 หรือเลขท้าย) หรือชื่อนักศึกษา...',
}: {
  students: { stdId: string; stdName: string }[];
  onSelectStudent: (student: { stdId: string; stdName: string }) => void;
  onUseNewId?: (newId: string) => void;
  getExtraBadge?: (stdId: string) => string | null;
  label?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const trimmed = query.trim();
  const normQ = normalizeStdId(trimmed);

  const matches = useMemo(() => {
    if (!trimmed) return [];
    const qLower = trimmed.toLowerCase();
    return students
      .filter((s) => {
        const sid = s.stdId.toLowerCase();
        const sname = s.stdName.toLowerCase();
        return sid.includes(qLower) || (normQ !== '' && normalizeStdId(sid).includes(normQ)) || sname.includes(qLower);
      })
      .slice(0, 10);
  }, [students, trimmed, normQ]);

  const handlePick = (student: { stdId: string; stdName: string }) => {
    onSelectStudent(student);
    setQuery('');
    setOpen(false);
  };

  const isValidNewTenDigits = /^\d{10}$/.test(trimmed) && trimmed.startsWith('6');

  return (
    <div className="std-lookup-wrap">
      <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-dark)' }}>
        <i className="fa-solid fa-magnifying-glass" style={{ color: 'var(--pastel-purple)' }}></i> {label}
      </label>
      <div className="std-lookup-input-box">
        <i className="fa-solid fa-magnifying-glass lookup-icon"></i>
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const exact = matches.find(
                (m) => m.stdId === trimmed || (normQ !== '' && normalizeStdId(m.stdId) === normQ)
              );
              if (exact) {
                handlePick(exact);
              } else if (matches.length === 1) {
                handlePick(matches[0]);
              } else if (matches.length === 0 && isValidNewTenDigits && onUseNewId) {
                onUseNewId(trimmed);
                setQuery('');
                setOpen(false);
              }
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="std-lookup-clear-btn"
            title="ล้างคำค้นหา"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        )}
      </div>

      {open && trimmed.length > 0 && (
        <div className="std-lookup-dropdown">
          {matches.length > 0 ? (
            matches.map((u) => {
              const badgeText = getExtraBadge ? getExtraBadge(u.stdId) : null;
              return (
                <button
                  key={u.stdId}
                  type="button"
                  className="std-lookup-item"
                  onClick={() => handlePick(u)}
                >
                  <div>
                    <strong className="font-mono-num" style={{ color: 'var(--pastel-purple-dark)', fontSize: '0.9rem' }}>
                      {u.stdId}
                    </strong>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-dark)' }}>{u.stdName || 'ไม่ระบุชื่อ'}</div>
                  </div>
                  {badgeText ? (
                    <span className="std-lookup-badge">{badgeText}</span>
                  ) : (
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      เลือก <i className="fa-solid fa-arrow-right"></i>
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div style={{ padding: '12px', fontSize: '0.84rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              <div>ไม่พบรหัส &ldquo;{trimmed}&rdquo; ในรายชื่อเดิม</div>
              {isValidNewTenDigits && onUseNewId && (
                <button
                  type="button"
                  className="btn btn-xs"
                  style={{ marginTop: '8px', background: 'var(--pastel-purple)' }}
                  onClick={() => {
                    onUseNewId(trimmed);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  <i className="fa-solid fa-plus"></i> ใช้รหัสใหม่ {trimmed} กรอกข้อมูลด้านล่าง
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  // Boot & Maintenance state
  const [bootResolved, setBootResolved] = useState(false);
  const [maintenance, setMaintenance] = useState<MaintenanceState>(() => getMaintenanceState());
  const [teacherBypass, setTeacherBypass] = useState<boolean>(
    () => sessionStorage.getItem('clc_teacher_bypass') === '1'
  );
  const [maintPanelOpen, setMaintPanelOpen] = useState(false);
  const [maintPwd, setMaintPwd] = useState('');
  const [maintAuthed, setMaintAuthed] = useState(false);
  const [maintBusy, setMaintBusy] = useState(false);

  // Core data synced from cloud
  const [records, setRecords] = useState<StudentRecord[]>(() => loadCachedRecords());
  const [trashItems, setTrashItems] = useState<TrashedRecord[]>(() => loadCachedTrash());
  const [hasV2SheetTrash, setHasV2SheetTrash] = useState(false);
  const [cmsSettings, setCmsSettings] = useState<CmsSettings>(() => loadCmsSettings());
  const [lessonOverrides, setLessonOverrides] = useState<Record<string, LessonOverrideEntry>>(() =>
    loadLessonOverrides()
  );

  const courses: CoursesByLevel = useMemo(
    () => buildMergedCourses(lessonOverrides, cmsSettings.deletedLessonIds || []),
    [lessonOverrides, cmsSettings.deletedLessonIds]
  );

  // Navigation & UI dialogs
  const [view, setView] = useState<ViewId>('view-home');
  const [currentLevel, setCurrentLevel] = useState<CourseLevel>('m-ton');
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [currentStudent, setCurrentStudent] = useState<{ id: string; name: string } | null>(null);

  // Notice / Toast / Confirm / Prompt replacement (no window.alert/confirm)
  const [noticeDialog, setNoticeDialog] = useState<{ title: string; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [maintPromptOpen, setMaintPromptOpen] = useState(false);
  const [maintPromptMsg, setMaintPromptMsg] = useState(
    'ขณะนี้คุณครูกำลังปรับปรุงและอัปเดตข้อมูลระบบห้องเรียนออนไลน์ เพื่อป้องกันข้อมูลคลาดเคลื่อน กรุณารอสักครู่แล้วกลับมาใช้งานใหม่อีกครั้งครับ'
  );

  const showNotice = useCallback((message: string, title = 'แจ้งเตือน') => {
    setNoticeDialog({ title, message });
  }, []);

  // Home cover/news fallback & KPC alert
  const [coverFailed, setCoverFailed] = useState(false);
  const [newsImgFailed, setNewsImgFailed] = useState(false);
  const [kpcOpen, setKpcOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Lesson login form
  const [lessonStdId, setLessonStdId] = useState('');
  const [lessonStdName, setLessonStdName] = useState('');
  const [lessonStartBusy, setLessonStartBusy] = useState(false);

  // Step 1: Reading
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [readTimeLeft, setReadTimeLeft] = useState(10);
  const [readLiked, setReadLiked] = useState(false);
  const readTimerRef = useRef<number | null>(null);

  // Step 2: Matching / Flip Game
  const [matchingCompleted, setMatchingCompleted] = useState(false);
  const [matchingPairs, setMatchingPairs] = useState<MatchingPair[]>([]);
  const [matchingLeftOrder, setMatchingLeftOrder] = useState<MatchingPair[]>([]);
  const [matchingRightOrder, setMatchingRightOrder] = useState<MatchingPair[]>([]);
  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
  const [selectedRightId, setSelectedRightId] = useState<string | null>(null);
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([]);
  const [mismatchPair, setMismatchPair] = useState<{ left: string | null; right: string | null }>({
    left: null,
    right: null,
  });
  const [matchingMistakes, setMatchingMistakes] = useState(0);
  const [matchingLockedAnim, setMatchingLockedAnim] = useState(false);
  const [matchingMuted, setMatchingMuted] = useState(false);
  const [matchingFeedback, setMatchingFeedback] = useState<{ type: 'info' | 'success' | 'error'; text: string }>({
    type: 'info',
    text: 'เลือกการ์ดหัวข้อทางฝั่งซ้าย 1 ใบ แล้วแตะจับคู่กับคำตอบที่ถูกต้องทางฝั่งขวา',
  });
  const [flipDeck, setFlipDeck] = useState<FlipCardItem[]>([]);
  const [flippedCardUids, setFlippedCardUids] = useState<string[]>([]);
  const [flipMismatchUids, setFlipMismatchUids] = useState<string[]>([]);

  // Step 3: Assignment (Anti-Copy-Paste)
  const [assignAnswers, setAssignAnswers] = useState<Record<number, string>>({});
  const [assignSaveBusy, setAssignSaveBusy] = useState(false);
  const [pasteWarningCount, setPasteWarningCount] = useState(0);
  const [pasteWarningText, setPasteWarningText] = useState('');
  const [assignLiked, setAssignLiked] = useState(false);
  const isThaiComposingRef = useRef(false);

  // Step 4: Quiz
  const [quizSelected, setQuizSelected] = useState<Record<number, number>>({});
  const [quizSubmitBusy, setQuizSubmitBusy] = useState(false);

  // Student Score Check
  const [checkStdId, setCheckStdId] = useState('');
  const [checkStdPwd, setCheckStdPwd] = useState('');
  const [checkLoginBusy, setCheckLoginBusy] = useState(false);
  const [studentResultData, setStudentResultData] = useState<{
    stdId: string;
    stdName: string;
    records: StudentRecord[];
    termAttScore: number | null;
  } | null>(null);

  // Teacher Login & Dashboard
  const [teacherPwd, setTeacherPwd] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterSession, setFilterSession] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selectedTrashKeys, setSelectedTrashKeys] = useState<string[]>([]);

  // Modals: Grading, Ungraded, Attendance, In-Class, Trash, CMS
  const [gradingRecord, setGradingRecord] = useState<StudentRecord | null>(null);
  const [gradeScoreInput, setGradeScoreInput] = useState('');
  const [gradeFeedbackInput, setGradeFeedbackInput] = useState('');
  const [gradeBusy, setGradeBusy] = useState(false);

  const [ungradedOpen, setUngradedOpen] = useState(false);
  const [ungradedLevel, setUngradedLevel] = useState('all');
  const [ungradedCourse, setUngradedCourse] = useState('all');

  const [attModalOpen, setAttModalOpen] = useState(false);
  const [attStdId, setAttStdId] = useState('');
  const [attStdName, setAttStdName] = useState('');
  const [attScore, setAttScore] = useState('');
  const [attBusy, setAttBusy] = useState(false);
  const [attSavedEntries, setAttSavedEntries] = useState<TermAttendanceEntry[]>([]);
  const [attListSearch, setAttListSearch] = useState('');
  const attScoreInputRef = useRef<HTMLInputElement | null>(null);

  const [inClassOpen, setInClassOpen] = useState(false);
  const [inClassAuthed, setInClassAuthed] = useState(false);
  const [inClassPwd, setInClassPwd] = useState('');
  const [inClassLessonId, setInClassLessonId] = useState('');
  const [inClassStdId, setInClassStdId] = useState('');
  const [inClassStdName, setInClassStdName] = useState('');
  const [inClassScore, setInClassScore] = useState('');
  const [inClassNote, setInClassNote] = useState('');
  const [inClassStatusMsg, setInClassStatusMsg] = useState('');
  const [inClassBusy, setInClassBusy] = useState(false);
  const inClassScoreInputRef = useRef<HTMLInputElement | null>(null);

  const [trashModalOpen, setTrashModalOpen] = useState(false);
  const [cmsModalOpen, setCmsModalOpen] = useState(false);

  const [editStdRecord, setEditStdRecord] = useState<StudentRecord | null>(null);
  const [editStdIdInput, setEditStdIdInput] = useState('');
  const [editStdNameInput, setEditStdNameInput] = useState('');
  const [editStdAllSessions, setEditStdAllSessions] = useState(true);
  const [editStdBusy, setEditStdBusy] = useState(false);

  // Sync helper
  const syncFromCloud = useCallback(
    async (showSuccessToast = false) => {
      const res = await fetchAllFromCloud();
      if (res) {
        setRecords(res.records);
        setTrashItems(res.trash);
        setCmsSettings(res.cmsSettings);
        setLessonOverrides(res.lessonOverrides);
        setMaintenance(res.maintenance);
        setHasV2SheetTrash(res.hasV2SheetTrash);
        if (showSuccessToast) {
          showNotice(`ซิงค์ข้อมูลล่าสุดจาก Google Sheets สำเร็จ! (${res.records.length} รายการ)`, 'ซิงค์สำเร็จ');
        }
        return res;
      }
      if (showSuccessToast) {
        showNotice('ไม่สามารถเชื่อมต่อ Google Sheets ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง', 'แจ้งเตือน');
      }
      return null;
    },
    [showNotice]
  );

  // Initial boot sequence
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const localMaint = getMaintenanceState();
      const hasBypass = sessionStorage.getItem('clc_teacher_bypass') === '1';

      if (localMaint.enabled && !hasBypass) {
        setBootResolved(true);
        await syncFromCloud(false);
        return;
      }

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2200));
      const cloudRes = await Promise.race([syncFromCloud(false), timeoutPromise]);

      if (cancelled) return;
      setBootResolved(true);

      const finalMaint = cloudRes ? cloudRes.maintenance : getMaintenanceState();
      const finalSettings = cloudRes ? cloudRes.cmsSettings : loadCmsSettings();
      if ((!finalMaint.enabled || hasBypass) && finalSettings.kpcEnabled) {
        setKpcOpen(true);
      }
    })();

    const handleOnline = () => {
      syncFromCloud(false);
    };
    window.addEventListener('online', handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
    };
  }, [syncFromCloud]);

  // Reset image failure flags when URLs change from CMS
  useEffect(() => {
    setCoverFailed(false);
  }, [cmsSettings.coverImageUrl]);

  useEffect(() => {
    setNewsImgFailed(false);
  }, [cmsSettings.newsImageUrl]);

  const navigate = useCallback(
    (target: ViewId) => {
      if (target === 'view-step-assignment' && !matchingCompleted) {
        showNotice('กรุณาเล่นเกมจับคู่ความรู้ให้ครบทุกคู่ก่อนเข้าทำใบงานครับ');
        return;
      }
      if (target !== 'view-step-read' && readTimerRef.current) {
        window.clearInterval(readTimerRef.current);
        readTimerRef.current = null;
      }
      setView(target);
      window.scrollTo(0, 0);
    },
    [matchingCompleted, showNotice]
  );

  // Web Audio tones
  const playGameTone = useCallback(
    (type: 'flip' | 'match' | 'wrong' | 'win') => {
      if (matchingMuted) return;
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        if (type === 'flip') {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(420, now);
          osc.frequency.exponentialRampToValueAtTime(520, now + 0.06);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.09);
        } else if (type === 'match') {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.23);
        } else if (type === 'wrong') {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(160, now + 0.16);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.21);
        } else if (type === 'win') {
          [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            const start = now + idx * 0.08;
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.07, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.26);
          });
        }
      } catch {
        // ignore audio context errors
      }
    },
    [matchingMuted]
  );

  // Reading step timer
  const startReadingPage = useCallback(
    (pageIdx: number) => {
      if (readTimerRef.current) {
        window.clearInterval(readTimerRef.current);
        readTimerRef.current = null;
      }
      setCurrentPageIndex(pageIdx);
      const sec = Math.max(0, Number(cmsSettings.readSecondsPerPage ?? 10));
      setReadTimeLeft(sec);
      if (sec === 0) return;

      readTimerRef.current = window.setInterval(() => {
        setReadTimeLeft((prev) => {
          if (prev <= 1) {
            if (readTimerRef.current) {
              window.clearInterval(readTimerRef.current);
              readTimerRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [cmsSettings.readSecondsPerPage]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (readTimerRef.current) window.clearInterval(readTimerRef.current);
    };
  }, []);

  // Select level & lesson
  const openLevel = (lvl: CourseLevel) => {
    setCurrentLevel(lvl);
    navigate('view-lessons');
  };

  const selectLesson = (lesson: Lesson) => {
    if (lesson.isLocked) {
      showNotice(
        `บทเรียนนี้ยังไม่เปิดให้เข้าเรียน\n\nวิชา: ${lesson.title}\n${lesson.session}\nกรุณารอคุณครูผู้สอนเปิดบทเรียนตามกำหนดการครับ`,
        'บทเรียนล็อคอยู่'
      );
      return;
    }
    setCurrentLesson(lesson);
    setMatchingCompleted(false);
    navigate('view-lesson-login');
  };

  // Start Learning Lesson (validate 6xxxxxxxxx 10 digits!)
  const startLearningLesson = async () => {
    if (!currentLesson) return;
    const idCheck = validateStudentId(lessonStdId);
    if (!idCheck.valid) {
      showNotice(idCheck.error, 'รหัสนักศึกษาไม่ถูกต้อง');
      return;
    }
    const name = lessonStdName.trim();
    if (!name) {
      showNotice('กรุณากรอกชื่อ - นามสกุล นักศึกษาให้ครบถ้วน');
      return;
    }

    const id = idCheck.clean;
    setCurrentStudent({ id, name });
    setMatchingCompleted(false);
    const normId = normalizeStdId(id);

    let currentRecords = records;
    let existing = currentRecords.find(
      (r) => normalizeStdId(r.stdId || r.stdid) === normId && String(r.lessonId || '').trim() === currentLesson.id
    );

    if (!existing) {
      setLessonStartBusy(true);
      const res = await syncFromCloud(false);
      setLessonStartBusy(false);
      if (res) {
        currentRecords = res.records;
      }
      existing = currentRecords.find(
        (r) => normalizeStdId(r.stdId || r.stdid) === normId && String(r.lessonId || '').trim() === currentLesson.id
      );
    }

    const existingTermAtt = getTermAttendanceScore(id, currentRecords);
    if (!existing) {
      const newRec: StudentRecord = {
        stdId: id,
        stdName: name,
        level: currentLevel,
        lessonId: currentLesson.id,
        courseCode: currentLesson.code,
        session: currentLesson.session,
        lessonTitle: `${currentLesson.title} (${currentLesson.code})`,
        attendedAt: new Date().toLocaleString('th-TH'),
        quizAttempts: 0,
        bestQuizScore: 0,
        quizPassed: false,
        assignmentAnswers: {},
        assignmentScore: null,
        teacherFeedback: '',
        ...(existingTermAtt !== null ? { termAttendanceScore: existingTermAtt } : {}),
      };
      const updated = [...currentRecords, newRec];
      setRecords(updated);
      saveCachedRecords(updated);
      syncToCloud(newRec);
    } else if (existingTermAtt !== null && (existing.termAttendanceScore === undefined || existing.termAttendanceScore === '')) {
      const updated = currentRecords.map((r) =>
        normalizeStdId(r.stdId || r.stdid) === normId && String(r.lessonId || '').trim() === currentLesson.id
          ? { ...r, termAttendanceScore: existingTermAtt }
          : r
      );
      setRecords(updated);
      saveCachedRecords(updated);
    }

    setReadLiked(false);
    navigate('view-step-read');
    startReadingPage(0);
  };

  // Step 2: Matching Game setup
  const goToMatchingGameStep = () => {
    if (!currentLesson) return;
    const pairs = getLessonMatchingPairs(currentLesson);
    const flipMode = isFlipGameLesson(currentLesson);

    setMatchingPairs(pairs);
    setMatchedPairIds(matchingCompleted ? pairs.map((p) => p.id) : []);
    setMatchingMistakes(0);
    setMatchingLockedAnim(false);
    setMismatchPair({ left: null, right: null });

    if (flipMode) {
      const deck: FlipCardItem[] = [];
      pairs.forEach((p) => {
        deck.push({ uid: `${p.id}_term`, pairId: p.id, side: 'term', text: p.term });
        deck.push({ uid: `${p.id}_match`, pairId: p.id, side: 'match', text: p.match });
      });
      setFlipDeck(shuffleList(deck));
      setFlippedCardUids([]);
      setFlipMismatchUids([]);
      setMatchingFeedback({
        type: 'info',
        text: matchingCompleted
          ? 'ผ่านเกมเปิดการ์ดแล้ว สามารถกดไปทำใบงานด้านล่างได้ทันที'
          : 'แตะเปิดการ์ดทีละ 2 ใบ เพื่อจับคู่คำศัพท์กับความหมายให้ครบทุกคู่',
      });
    } else {
      setMatchingLeftOrder(shuffleList(pairs));
      setMatchingRightOrder(shuffleList(pairs));
      setSelectedLeftId(null);
      setSelectedRightId(null);
      setMatchingFeedback({
        type: 'info',
        text: 'เลือกการ์ดหัวข้อทางฝั่งซ้าย 1 ใบ แล้วแตะจับคู่กับคำตอบที่ถูกต้องทางฝั่งขวา',
      });
    }

    navigate('view-step-matching');
  };

  const shuffleMatchingBoard = () => {
    if (matchingCompleted || matchingLockedAnim || !currentLesson) return;
    if (isFlipGameLesson(currentLesson)) {
      const deck: FlipCardItem[] = [];
      matchingPairs.forEach((p) => {
        deck.push({ uid: `${p.id}_term`, pairId: p.id, side: 'term', text: p.term });
        deck.push({ uid: `${p.id}_match`, pairId: p.id, side: 'match', text: p.match });
      });
      setFlipDeck(shuffleList(deck));
      setFlippedCardUids([]);
      setFlipMismatchUids([]);
      setMatchedPairIds([]);
      setMatchingMistakes(0);
      setMatchingFeedback({
        type: 'info',
        text: 'สลับการ์ดคว่ำหน้าใหม่ทั้งหมดแล้ว เริ่มเปิดการ์ดได้เลยครับ',
      });
      return;
    }
    setMatchingLeftOrder(shuffleList(matchingPairs));
    setMatchingRightOrder(shuffleList(matchingPairs));
    setSelectedLeftId(null);
    setSelectedRightId(null);
    setMatchingFeedback({
      type: 'info',
      text: 'สลับตำแหน่งการ์ดใหม่แล้ว เลือกจับคู่ต่อได้เลยครับ',
    });
  };

  const checkMatchAttempt = (leftId: string, rightId: string) => {
    if (leftId === rightId) {
      const nextMatched = [...matchedPairIds, leftId];
      setMatchedPairIds(nextMatched);
      setSelectedLeftId(null);
      setSelectedRightId(null);
      if (nextMatched.length === matchingPairs.length) {
        setMatchingCompleted(true);
        playGameTone('win');
        setMatchingFeedback({
          type: 'success',
          text: 'เก่งมาก! คุณจับคู่ความรู้ครบทุกข้อแล้ว สามารถกดปุ่มด้านล่างเพื่อเข้าทำใบงานได้เลย',
        });
      } else {
        playGameTone('match');
        setMatchingFeedback({
          type: 'success',
          text: `ถูกต้อง! จับคู่สำเร็จแล้ว ${nextMatched.length} จาก ${matchingPairs.length} คู่`,
        });
      }
    } else {
      playGameTone('wrong');
      setMatchingMistakes((m) => m + 1);
      setMatchingLockedAnim(true);
      setMismatchPair({ left: leftId, right: rightId });
      setMatchingFeedback({
        type: 'error',
        text: 'ยังไม่ตรงกัน ลองอ่านทบทวนและจับคู่อีกครั้งนะครับ',
      });
      window.setTimeout(() => {
        setSelectedLeftId(null);
        setSelectedRightId(null);
        setMismatchPair({ left: null, right: null });
        setMatchingLockedAnim(false);
      }, 520);
    }
  };

  const onPickLeftCard = (id: string) => {
    if (matchingLockedAnim || matchedPairIds.includes(id)) return;
    if (selectedRightId) {
      setSelectedLeftId(id);
      checkMatchAttempt(id, selectedRightId);
    } else {
      setSelectedLeftId((prev) => (prev === id ? null : id));
    }
  };

  const onPickRightCard = (id: string) => {
    if (matchingLockedAnim || matchedPairIds.includes(id)) return;
    if (selectedLeftId) {
      setSelectedRightId(id);
      checkMatchAttempt(selectedLeftId, id);
    } else {
      setSelectedRightId((prev) => (prev === id ? null : id));
    }
  };

  const onFlipCardClick = (uid: string) => {
    if (matchingLockedAnim || matchingCompleted || flippedCardUids.includes(uid)) return;
    const card = flipDeck.find((c) => c.uid === uid);
    if (!card || matchedPairIds.includes(card.pairId)) return;

    if (flippedCardUids.length === 0) {
      playGameTone('flip');
      setFlippedCardUids([uid]);
      return;
    }

    if (flippedCardUids.length === 1) {
      const firstCard = flipDeck.find((c) => c.uid === flippedCardUids[0]);
      if (!firstCard) return;

      setFlippedCardUids([firstCard.uid, uid]);
      setMatchingLockedAnim(true);

      if (firstCard.pairId === card.pairId) {
        window.setTimeout(() => {
          setMatchedPairIds((prev) => {
            const next = [...prev, card.pairId];
            if (next.length === matchingPairs.length) {
              setMatchingCompleted(true);
              playGameTone('win');
              setMatchingFeedback({
                type: 'success',
                text: 'เก่งมาก! คุณเปิดการ์ดจับคู่ครบทุกคู่แล้ว สามารถกดปุ่มด้านล่างเพื่อเข้าทำใบงานได้เลย',
              });
            } else {
              playGameTone('match');
              setMatchingFeedback({
                type: 'success',
                text: `เปิดเจอคู่ถูกต้อง! จับคู่สำเร็จแล้ว ${next.length} จาก ${matchingPairs.length} คู่`,
              });
            }
            return next;
          });
          setFlippedCardUids([]);
          setMatchingLockedAnim(false);
        }, 320);
      } else {
        playGameTone('wrong');
        setMatchingMistakes((m) => m + 1);
        setFlipMismatchUids([firstCard.uid, uid]);
        setMatchingFeedback({
          type: 'error',
          text: 'ยังไม่ตรงคู่กัน จำตำแหน่งการ์ดไว้แล้วลองเปิดใหม่อีกครั้งนะครับ',
        });
        window.setTimeout(() => {
          setFlippedCardUids([]);
          setFlipMismatchUids([]);
          setMatchingLockedAnim(false);
        }, 780);
      }
    }
  };

  // Step 3: Assignment
  const goToAssignmentStep = () => {
    if (!currentLesson || !currentStudent) return;
    if (!matchingCompleted) {
      showNotice('กรุณาเล่นเกมจับคู่ความรู้ให้ครบทุกคู่ก่อนทำใบงานครับ');
      goToMatchingGameStep();
      return;
    }

    setPasteWarningCount(0);
    setPasteWarningText('');
    setAssignLiked(false);

    const normId = normalizeStdId(currentStudent.id);
    const rec = records.find(
      (r) => normalizeStdId(r.stdId || r.stdid) === normId && String(r.lessonId || '').trim() === currentLesson.id
    );
    const prevAns: Record<number, string> = {};
    const tasks = currentLesson.assignmentTasks || ['ให้นักศึกษาสรุปสิ่งที่ได้เรียนรู้'];
    const rawAns = rec && typeof rec.assignmentAnswers === 'object' ? (rec.assignmentAnswers as Record<string, unknown>) : {};
    tasks.forEach((_, idx) => {
      const val = rawAns[idx];
      prevAns[idx] = typeof val === 'string' ? val : '';
    });
    setAssignAnswers(prevAns);
    navigate('view-step-assignment');
  };

  const triggerPasteWarning = (msg: string) => {
    setPasteWarningCount((c) => c + 1);
    setPasteWarningText(msg);
  };

  const saveAssignmentAndNext = async () => {
    if (!currentLesson || !currentStudent) return;
    const tasks = currentLesson.assignmentTasks || ['ให้นักศึกษาสรุปสิ่งที่ได้เรียนรู้'];
    for (let i = 0; i < tasks.length; i++) {
      if (!String(assignAnswers[i] || '').trim()) {
        showNotice(`กรุณาอ่านและพิมพ์คำตอบใบงานข้อที่ ${i + 1} ให้เรียบร้อยก่อนส่งครับ`);
        return;
      }
    }

    setAssignSaveBusy(true);
    const normId = normalizeStdId(currentStudent.id);
    const answersObj: Record<string, string> = {};
    tasks.forEach((_, idx) => {
      answersObj[String(idx)] = String(assignAnswers[idx] || '').trim();
    });

    let targetRec: StudentRecord | null = null;
    const updated = records.map((r) => {
      if (normalizeStdId(r.stdId || r.stdid) === normId && String(r.lessonId || '').trim() === currentLesson.id) {
        targetRec = { ...r, assignmentAnswers: answersObj };
        return targetRec;
      }
      return r;
    });

    setRecords(updated);
    saveCachedRecords(updated);
    if (targetRec) {
      await syncToCloud(targetRec);
    }
    setAssignSaveBusy(false);

    // Proceed to Quiz Step
    const attempts = targetRec ? Number((targetRec as StudentRecord).quizAttempts) || 0 : 0;
    const bestScore = targetRec ? Number((targetRec as StudentRecord).bestQuizScore) || 0 : 0;
    const passed = targetRec ? Boolean((targetRec as StudentRecord).quizPassed) : false;

    if (attempts >= 2) {
      showNotice(
        `ท่านใช้สิทธิ์สอบครบ 2 ครั้งแล้ว คะแนนสอบสูงสุด: ${bestScore}/${currentLesson.questions.length} (${passed ? 'ผ่าน' : 'ไม่ผ่าน'})`,
        'ครบสิทธิ์การสอบ'
      );
      navigate('view-home');
      return;
    }

    setQuizSelected({});
    navigate('view-step-quiz');
  };

  const submitQuiz = async () => {
    if (!currentLesson || !currentStudent) return;
    const questions = currentLesson.questions || [];
    for (let i = 0; i < questions.length; i++) {
      if (quizSelected[i] === undefined) {
        showNotice(`กรุณาตอบคำถามให้ครบทั้ง ${questions.length} ข้อ ก่อนกดส่งแบบทดสอบ`);
        return;
      }
    }

    let score = 0;
    questions.forEach((qItem, idx) => {
      if (quizSelected[idx] === qItem.ans) score++;
    });

    setQuizSubmitBusy(true);
    const normId = normalizeStdId(currentStudent.id);
    const passThreshold = Math.ceil(questions.length * 0.6);

    let updatedRec: StudentRecord | null = null;
    const updatedList = records.map((r) => {
      if (normalizeStdId(r.stdId || r.stdid) === normId && String(r.lessonId || '').trim() === currentLesson.id) {
        const nextBest = Math.max(Number(r.bestQuizScore) || 0, score);
        updatedRec = {
          ...r,
          quizAttempts: (Number(r.quizAttempts) || 0) + 1,
          bestQuizScore: nextBest,
          quizPassed: nextBest >= passThreshold || r.quizPassed === true || r.quizPassed === 'ผ่าน',
        };
        return updatedRec;
      }
      return r;
    });

    setRecords(updatedList);
    saveCachedRecords(updatedList);
    if (updatedRec) {
      await syncToCloud(updatedRec);
    }
    setQuizSubmitBusy(false);

    const bestShown = updatedRec ? (updatedRec as StudentRecord).bestQuizScore : score;
    showNotice(
      `บันทึกการส่งงานและสอบสำเร็จ!\nคะแนนสอบครั้งนี้: ${score}/${questions.length} คะแนน\nคะแนนสูงสุดสะสม: ${bestShown}/${questions.length}`,
      'ส่งแบบทดสอบสำเร็จ'
    );
    navigate('view-home');
  };

  // Student Score Check (validate 6xxxxxxxxx 10 digits)
  const loginCheckScore = async () => {
    const idCheck = validateStudentId(checkStdId);
    if (!idCheck.valid) {
      showNotice(idCheck.error, 'รหัสนักศึกษาไม่ถูกต้อง');
      return;
    }
    const pwdInput = checkStdPwd.trim();
    if (!pwdInput) {
      showNotice('กรุณากรอกรหัสผ่าน');
      return;
    }
    if (idCheck.clean !== pwdInput) {
      showNotice('รหัสผ่านไม่ถูกต้อง (รหัสผ่านใช้รหัสเดียวกับรหัสนักศึกษา)');
      return;
    }

    setCheckLoginBusy(true);
    const cloudRes = await syncFromCloud(false);
    setCheckLoginBusy(false);

    const currentRecs = cloudRes ? cloudRes.records : records;
    const normInput = normalizeStdId(idCheck.clean);
    const stdRecords = currentRecs.filter((r) => normalizeStdId(r.stdId || r.stdid) === normInput);
    const termAttScore = getTermAttendanceScore(idCheck.clean, stdRecords);
    const termStore = getTermAttendanceStore();
    const termEntry =
      termStore[idCheck.clean] || Object.values(termStore).find((e) => normalizeStdId(e.stdId) === normInput);

    if (stdRecords.length === 0 && termAttScore === null) {
      showNotice('ไม่พบข้อมูลประวัติการเรียนของรหัสนักศึกษานี้ ในระบบออนไลน์', 'ไม่พบข้อมูล');
      return;
    }

    setStudentResultData({
      stdId: (stdRecords[0] && stdRecords[0].stdId) || idCheck.clean,
      stdName: (stdRecords[0] && stdRecords[0].stdName) || (termEntry && termEntry.stdName) || '-',
      records: stdRecords,
      termAttScore,
    });
    navigate('view-student-result');
  };

  // Student course summary computation
  const studentCourseSummaries = useMemo(() => {
    if (!studentResultData) return [];
    const allLessons = [...(courses['m-ton'] || []), ...(courses['m-ปลาย'] || [])];
    const courseMap: Record<string, { code: string; title: string; totalSessions: number }> = {};
    allLessons.forEach((item) => {
      if (!courseMap[item.code]) {
        courseMap[item.code] = { code: item.code, title: item.title, totalSessions: 0 };
      }
      courseMap[item.code].totalSessions++;
    });

    const enrolled = Object.values(courseMap).filter((c) =>
      studentResultData.records.some(
        (r) =>
          (r.courseCode && r.courseCode === c.code) ||
          (r.lessonTitle && r.lessonTitle.includes(c.code)) ||
          (r.lessonId && r.lessonId.includes(c.code))
      )
    );

    return enrolled.map((c) => {
      const recsForCourse = studentResultData.records.filter(
        (r) =>
          (r.courseCode && r.courseCode === c.code) ||
          (r.lessonTitle && r.lessonTitle.includes(c.code)) ||
          (r.lessonId && r.lessonId.includes(c.code))
      );
      let totalQuiz = 0;
      let totalAssign = 0;
      recsForCourse.forEach((r) => {
        totalQuiz += Number(r.bestQuizScore) || 0;
        totalAssign += Number(getRecordAssignmentScore(r)) || 0;
      });
      return {
        ...c,
        ...calculateSubjectSummary(c.totalSessions, totalQuiz, totalAssign),
      };
    });
  }, [studentResultData, courses]);

  // Teacher Login
  const loginTeacher = async () => {
    if (teacherPwd.trim() === '954803') {
      setTeacherPwd('');
      navigate('view-teacher-dashboard');
      await syncFromCloud(false);
    } else {
      showNotice('รหัสผ่านครูไม่ถูกต้อง!', 'เข้าสู่ระบบไม่สำเร็จ');
    }
  };

  // Teacher Dashboard filtering & metrics
  const validRecords = useMemo(
    () => records.filter((r) => r && (r.stdId || r.stdName || r.lessonTitle || r.lessontitle)),
    [records]
  );

  const ungradedCount = useMemo(
    () => validRecords.filter((r) => hasStudentSubmittedAssignment(r) && getRecordAssignmentScore(r) === null).length,
    [validRecords]
  );

  const invalidIdCount = useMemo(
    () => validRecords.filter((r) => !validateStudentId(String(r.stdId || r.stdid || '')).valid).length,
    [validRecords]
  );

  const teacherFilterSessions = useMemo(() => {
    if (filterLevel === 'all') {
      return [...(courses['m-ton'] || []), ...(courses['m-ปลาย'] || [])];
    }
    return courses[filterLevel as CourseLevel] || [];
  }, [filterLevel, courses]);

  const filteredTeacherRecords = useMemo(() => {
    let list = validRecords;
    if (filterLevel !== 'all') {
      list = list.filter((r) => (r.level || '') === filterLevel);
    }
    if (filterSession !== 'all') {
      list = list.filter((r) => (r.lessonId || '') === filterSession);
    }
    if (filterStatus === 'ungraded') {
      list = list.filter((r) => hasStudentSubmittedAssignment(r) && getRecordAssignmentScore(r) === null);
    } else if (filterStatus === 'graded') {
      list = list.filter((r) => getRecordAssignmentScore(r) !== null);
    } else if (filterStatus === 'not_submitted') {
      list = list.filter((r) => !hasStudentSubmittedAssignment(r) && getRecordAssignmentScore(r) === null);
    } else if (filterStatus === 'invalid_id') {
      list = list.filter((r) => !validateStudentId(String(r.stdId || r.stdid || '')).valid);
    }
    const q = teacherSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          String(r.stdId || '').toLowerCase().includes(q) ||
          String(r.stdName || '').toLowerCase().includes(q) ||
          String(r.lessonTitle || '').toLowerCase().includes(q) ||
          String(r.session || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [validRecords, filterLevel, filterSession, filterStatus, teacherSearch]);

  // Soft Delete & Trash operations
  const moveRecordsToTrash = async (targets: StudentRecord[], reason = 'ครูลบข้อมูล (ตัวเทส/รหัสผิด)') => {
    if (targets.length === 0) return;
    const nowText = new Date().toLocaleString('th-TH');
    const targetKeys = new Set(targets.map((t) => getRecordTrashKey(t)));
    const newTrashEntries: TrashedRecord[] = targets.map((rec) => ({
      trashKey: getRecordTrashKey(rec),
      deletedAt: nowText,
      deletedReason: reason,
      record: rec,
    }));

    const nextRecords = records.filter((r) => !targetKeys.has(getRecordTrashKey(r)));
    const trashMap = new Map<string, TrashedRecord>();
    trashItems.forEach((t) => trashMap.set(t.trashKey, t));
    newTrashEntries.forEach((t) => trashMap.set(t.trashKey, t));
    const nextTrash = Array.from(trashMap.values());

    setRecords(nextRecords);
    setTrashItems(nextTrash);
    setSelectedTrashKeys((prev) => prev.filter((k) => !targetKeys.has(k)));
    saveCachedRecords(nextRecords);

    for (const entry of newTrashEntries) {
      await syncTrashStateToCloud(nextTrash, { type: 'move', target: entry });
    }
    showNotice(`ย้ายข้อมูล ${targets.length} รายการลงใน "ถังขยะ" แล้ว (สามารถกู้คืนได้ทุกเมื่อ)`, 'ย้ายลงถังขยะสำเร็จ');
  };

  const restoreFromTrash = async (item: TrashedRecord) => {
    const nextTrash = trashItems.filter((t) => t.trashKey !== item.trashKey);
    const exists = records.some((r) => getRecordTrashKey(r) === item.trashKey);
    const nextRecords = exists ? records : [item.record, ...records];

    setTrashItems(nextTrash);
    setRecords(nextRecords);
    saveCachedRecords(nextRecords);

    await syncTrashStateToCloud(nextTrash, { type: 'restore', target: item });
    await syncToCloud(item.record);
    showNotice(`กู้คืนข้อมูลของ ${item.record.stdName || item.record.stdId} (${item.record.session}) เรียบร้อยแล้ว`, 'กู้คืนสำเร็จ');
  };

  const permanentDeleteFromTrash = async (item: TrashedRecord) => {
    const nextTrash = trashItems.filter((t) => t.trashKey !== item.trashKey);
    setTrashItems(nextTrash);
    await syncTrashStateToCloud(nextTrash, { type: 'permanent', target: item });
    showNotice(`ลบข้อมูลของ ${item.record.stdName || item.record.stdId} ออกจากถังขยะถาวรแล้ว`, 'ลบถาวรสำเร็จ');
  };

  // Edit / Migrate Student ID & Name without losing worksheet/quiz/grade data
  const smartMergeAssignmentAnswers = (
    primary?: StudentRecord['assignmentAnswers'],
    secondary?: StudentRecord['assignmentAnswers']
  ): Record<string, unknown> | string => {
    if (!primary || (typeof primary === 'string' && !primary.trim())) return secondary ?? {};
    if (!secondary || (typeof secondary === 'string' && !secondary.trim())) return primary;
    if (typeof primary === 'object' && typeof secondary === 'object' && !Array.isArray(primary) && !Array.isArray(secondary)) {
      const merged: Record<string, unknown> = { ...secondary };
      Object.keys(primary).forEach((k) => {
        const val = primary[k];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          merged[k] = val;
        }
      });
      return merged;
    }
    return primary;
  };

  const openEditStudentModal = (rec: StudentRecord) => {
    const rawId = String(rec.stdId || rec.stdid || '').trim();
    const rawName = String(rec.stdName || rec.stdname || '').trim();
    setEditStdRecord(rec);
    setEditStdIdInput(sanitizeStudentIdInput(rawId));
    setEditStdNameInput(rawName);
    setEditStdAllSessions(true);
  };

  const saveMigratedStudentRecords = async () => {
    if (!editStdRecord) return;
    const idCheck = validateStudentId(editStdIdInput);
    if (!idCheck.valid) {
      showNotice(idCheck.error, 'รหัสนักศึกษาใหม่ไม่ถูกต้อง');
      return;
    }
    const cleanNewName = editStdNameInput.trim();
    if (!cleanNewName) {
      showNotice('กรุณากรอกชื่อ-นามสกุลนักศึกษา');
      return;
    }

    const oldRawId = String(editStdRecord.stdId || editStdRecord.stdid || '').trim();
    const oldNormId = normalizeStdId(oldRawId) || oldRawId;
    const newStdId = idCheck.clean;
    const newNormId = normalizeStdId(newStdId) || newStdId;
    const isSameNormId = newNormId === oldNormId;

    const targetRecords =
      editStdAllSessions && oldNormId
        ? records.filter((r) => {
            const rRaw = String(r.stdId || r.stdid || '').trim();
            const rNorm = normalizeStdId(rRaw) || rRaw;
            return rNorm === oldNormId;
          })
        : [editStdRecord];

    if (targetRecords.length === 0) return;

    setEditStdBusy(true);

    // 1) Update in-place when keeping the same numeric ID (only fixing name or formatting)
    if (isSameNormId) {
      const targetKeySet = new Set(targetRecords.map((t) => getRecordTrashKey(t)));
      const updatedList: StudentRecord[] = [];
      const nextRecords = records.map((r) => {
        if (targetKeySet.has(getRecordTrashKey(r))) {
          const updated: StudentRecord = { ...r, stdId: newStdId, stdName: cleanNewName };
          updatedList.push(updated);
          return updated;
        }
        return r;
      });

      setRecords(nextRecords);
      saveCachedRecords(nextRecords);
      for (const upd of updatedList) {
        await syncToCloud(upd);
      }

      setEditStdBusy(false);
      setEditStdRecord(null);
      showNotice(
        `อัปเดตข้อมูล ${updatedList.length} รายการ เป็น "${newStdId} (${cleanNewName})" เรียบร้อยแล้ว`,
        'แก้ไขข้อมูลสำเร็จ'
      );
      return;
    }

    // 2) Migrate records to the new valid 6xxxxxxxxx student ID (preserving & merging all quiz, worksheet & grade data)
    const oldKeySet = new Set(targetRecords.map((t) => getRecordTrashKey(t)));
    let workingRecords = [...records];
    const migratedToSave: StudentRecord[] = [];

    const existingOldTermAtt = getTermAttendanceScore(oldRawId, records);

    for (const oldRec of targetRecords) {
      const lessonId = String(oldRec.lessonId || oldRec.lessonid || '').trim();
      const targetNewKey = `${newNormId}__${lessonId}`;
      const existingTargetIdx = workingRecords.findIndex(
        (r) => !oldKeySet.has(getRecordTrashKey(r)) && getRecordTrashKey(r) === targetNewKey
      );
      const existingTarget = existingTargetIdx >= 0 ? workingRecords[existingTargetIdx] : null;

      const oldBestQuiz = Number(oldRec.bestQuizScore) || 0;
      const targetBestQuiz = Number(existingTarget?.bestQuizScore) || 0;
      const bestQuizScore = Math.max(oldBestQuiz, targetBestQuiz);
      const quizAttempts = Math.max(Number(oldRec.quizAttempts) || 0, Number(existingTarget?.quizAttempts) || 0);
      const quizPassed =
        bestQuizScore >= 6 ||
        oldRec.quizPassed === true ||
        oldRec.quizPassed === 'ผ่าน' ||
        existingTarget?.quizPassed === true ||
        existingTarget?.quizPassed === 'ผ่าน';

      const oldAssignScore = getRecordAssignmentScore(oldRec);
      const targetAssignScore = existingTarget ? getRecordAssignmentScore(existingTarget) : null;
      const finalAssignScore =
        oldAssignScore !== null && targetAssignScore !== null
          ? Math.max(oldAssignScore, targetAssignScore)
          : oldAssignScore !== null
            ? oldAssignScore
            : targetAssignScore !== null
              ? targetAssignScore
              : '';

      const mergedFeedback = [oldRec.teacherFeedback, existingTarget?.teacherFeedback]
        .map((s) => String(s || '').trim())
        .filter((s, idx, arr) => s && arr.indexOf(s) === idx)
        .join(' | ');

      const mergedTermAtt =
        existingTarget?.termAttendanceScore !== undefined && existingTarget?.termAttendanceScore !== ''
          ? existingTarget.termAttendanceScore
          : oldRec.termAttendanceScore !== undefined && oldRec.termAttendanceScore !== ''
            ? oldRec.termAttendanceScore
            : existingOldTermAtt !== null
              ? existingOldTermAtt
              : undefined;

      const mergedRec: StudentRecord = {
        ...oldRec,
        stdId: newStdId,
        stdName: cleanNewName,
        attendedAt: oldRec.attendedAt || existingTarget?.attendedAt || new Date().toLocaleString('th-TH'),
        quizAttempts,
        bestQuizScore,
        quizPassed,
        assignmentAnswers: smartMergeAssignmentAnswers(oldRec.assignmentAnswers, existingTarget?.assignmentAnswers),
        assignmentScore: finalAssignScore,
        teacherFeedback: mergedFeedback,
        ...(mergedTermAtt !== undefined ? { termAttendanceScore: mergedTermAtt } : {}),
      };

      migratedToSave.push(mergedRec);
      if (existingTargetIdx >= 0) {
        workingRecords[existingTargetIdx] = mergedRec;
      } else {
        workingRecords.push(mergedRec);
      }
    }

    // Remove old wrong-ID rows from active list (they will be backed up in Trash below)
    workingRecords = workingRecords.filter((r) => !oldKeySet.has(getRecordTrashKey(r)));

    // Migrate Term Attendance Store if student had term attendance recorded under the old ID
    if (existingOldTermAtt !== null) {
      saveTermAttendanceToStore(newStdId, cleanNewName, existingOldTermAtt);
      workingRecords = workingRecords.map((r) =>
        normalizeStdId(r.stdId || r.stdid) === newNormId ? { ...r, termAttendanceScore: existingOldTermAtt } : r
      );
    }

    // Save newly migrated records to Google Sheets FIRST (safety first!)
    for (const rec of migratedToSave) {
      await syncToCloud(rec);
    }
    if (existingOldTermAtt !== null) {
      await syncToCloud({
        stdId: newStdId,
        stdName: cleanNewName,
        level: (migratedToSave[0]?.level as CourseLevel) || 'm-ton',
        lessonId: '__TERM_ATTENDANCE__',
        courseCode: 'ATTENDANCE',
        session: 'คะแนนเข้าเรียนรวมทั้งเทอม',
        lessonTitle: 'คะแนนเข้าเรียนรวมทั้งเทอม',
        attendedAt: new Date().toLocaleString('th-TH'),
        quizAttempts: 0,
        bestQuizScore: 0,
        quizPassed: false,
        assignmentAnswers: { termAttendanceScore: existingOldTermAtt },
        assignmentScore: existingOldTermAtt,
        teacherFeedback: 'TERM_ATTENDANCE:' + existingOldTermAtt,
        termAttendanceScore: existingOldTermAtt,
      });
    }

    // Move old wrong-ID rows into Trash as backup (with reason)
    const nowText = new Date().toLocaleString('th-TH');
    const trashMap = new Map<string, TrashedRecord>();
    trashItems.forEach((t) => trashMap.set(t.trashKey, t));
    // Ensure target new keys are not marked as trashed
    migratedToSave.forEach((m) => trashMap.delete(getRecordTrashKey(m)));

    const backupEntries: TrashedRecord[] = targetRecords.map((rec) => ({
      trashKey: getRecordTrashKey(rec),
      deletedAt: nowText,
      deletedReason: `ย้ายรหัสเป็น ${newStdId} (${cleanNewName})`,
      record: rec,
    }));
    backupEntries.forEach((entry) => trashMap.set(entry.trashKey, entry));
    const nextTrash = Array.from(trashMap.values());

    setRecords(workingRecords);
    setTrashItems(nextTrash);
    setSelectedTrashKeys((prev) => prev.filter((k) => !oldKeySet.has(k)));
    saveCachedRecords(workingRecords);

    for (const entry of backupEntries) {
      await syncTrashStateToCloud(nextTrash, { type: 'move', target: entry });
    }

    setEditStdBusy(false);
    setEditStdRecord(null);
    showNotice(
      `ย้ายข้อมูล ${targetRecords.length} รายการ จากรหัส "${oldRawId}" ไปเป็น "${newStdId} (${cleanNewName})" เรียบร้อยแล้ว!\nคะแนนสอบ ใบงาน และผลการตรวจทั้งหมดถูกย้ายตามไปด้วยครบถ้วน (ข้อมูลเดิมสำรองไว้ในถังขยะ)`,
      'ย้ายรหัสสำเร็จ'
    );
  };

  // Grading modal
  const openGradingModal = (rec: StudentRecord) => {
    setGradingRecord(rec);
    const cur = getRecordAssignmentScore(rec);
    setGradeScoreInput(cur !== null ? String(cur) : '');
    setGradeFeedbackInput(rec.teacherFeedback || '');
  };

  const saveAssignmentGrade = async () => {
    if (!gradingRecord) return;
    if (
      gradeScoreInput === '' ||
      isNaN(Number(gradeScoreInput)) ||
      Number(gradeScoreInput) < 0 ||
      Number(gradeScoreInput) > 10
    ) {
      showNotice('กรุณาระบุคะแนนระหว่าง 0 ถึง 10');
      return;
    }
    setGradeBusy(true);
    const numericScore = Number(gradeScoreInput);
    const normId = normalizeStdId(gradingRecord.stdId || gradingRecord.stdid);
    const targetLid = String(gradingRecord.lessonId || '').trim();

    let updatedRec: StudentRecord = {
      ...gradingRecord,
      assignmentScore: numericScore,
      teacherFeedback: gradeFeedbackInput,
    };

    const nextList = records.map((r) => {
      if (normalizeStdId(r.stdId || r.stdid) === normId && String(r.lessonId || '').trim() === targetLid) {
        updatedRec = { ...r, assignmentScore: numericScore, teacherFeedback: gradeFeedbackInput };
        return updatedRec;
      }
      return r;
    });

    setRecords(nextList);
    saveCachedRecords(nextList);
    await syncToCloud(updatedRec);
    setGradeBusy(false);
    setGradingRecord(null);
    showNotice('บันทึกผลการตรวจใบงานลงฐานข้อมูลเรียบร้อย', 'บันทึกสำเร็จ');
  };

  // Attendance Modal
  const uniqueStudentsList = useMemo(() => {
    const map: Record<string, { stdId: string; stdName: string }> = {};
    records.forEach((r) => {
      const sId = String(r.stdId || r.stdid || '').trim();
      const sName = String(r.stdName || r.stdname || '').trim();
      if (!sId || sId.startsWith('__')) return;
      const key = normalizeStdId(sId) || sId;
      if (!map[key]) {
        map[key] = { stdId: sId, stdName: sName };
      } else if (!map[key].stdName && sName) {
        map[key].stdName = sName;
      }
    });

    const termStore = getTermAttendanceStore();
    Object.values(termStore).forEach((entry) => {
      const sId = String(entry.stdId || '').trim();
      const sName = String(entry.stdName || '').trim();
      if (!sId || sId.startsWith('__')) return;
      const key = normalizeStdId(sId) || sId;
      if (!map[key]) {
        map[key] = { stdId: sId, stdName: sName };
      } else if (!map[key].stdName && sName) {
        map[key].stdName = sName;
      }
    });

    return Object.values(map).sort((a, b) => a.stdId.localeCompare(b.stdId));
  }, [records, attSavedEntries]);

  const openAttendanceModal = async () => {
    setAttStdId('');
    setAttStdName('');
    setAttScore('');
    setAttListSearch('');
    setAttSavedEntries(Object.values(getTermAttendanceStore()));
    setAttModalOpen(true);
    const res = await syncFromCloud(false);
    if (res) {
      setAttSavedEntries(Object.values(getTermAttendanceStore()));
    }
  };

  const saveAttendanceScore = async () => {
    const idCheck = validateStudentId(attStdId);
    if (!idCheck.valid) {
      showNotice(idCheck.error, 'รหัสนักศึกษาไม่ถูกต้อง');
      return;
    }
    if (!attStdName.trim()) {
      showNotice('กรุณากรอกชื่อ-นามสกุลนักศึกษาให้ครบถ้วน');
      return;
    }
    if (attScore === '' || isNaN(Number(attScore)) || Number(attScore) < 0) {
      showNotice('กรุณากรอกคะแนนเข้าเรียนเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      return;
    }

    setAttBusy(true);
    const stdId = idCheck.clean;
    const stdName = attStdName.trim();
    const numericScore = Number(attScore);
    saveTermAttendanceToStore(stdId, stdName, numericScore);

    const normId = normalizeStdId(stdId);
    const matchingRecs: StudentRecord[] = [];
    const nextRecords = records.map((r) => {
      if (normalizeStdId(r.stdId || r.stdid) === normId) {
        const updated = { ...r, termAttendanceScore: numericScore };
        matchingRecs.push(updated);
        return updated;
      }
      return r;
    });

    setRecords(nextRecords);
    saveCachedRecords(nextRecords);
    for (const rec of matchingRecs) {
      await syncToCloud(rec);
    }

    const cloudMeta: StudentRecord = {
      stdId,
      stdName,
      level: (matchingRecs[0] && matchingRecs[0].level) || 'm-ton',
      lessonId: '__TERM_ATTENDANCE__',
      courseCode: 'ATTENDANCE',
      session: 'คะแนนเข้าเรียนรวมทั้งเทอม',
      lessonTitle: 'คะแนนเข้าเรียนรวมทั้งเทอม',
      attendedAt: new Date().toLocaleString('th-TH'),
      quizAttempts: 0,
      bestQuizScore: 0,
      quizPassed: false,
      assignmentAnswers: { termAttendanceScore: numericScore },
      assignmentScore: numericScore,
      teacherFeedback: 'TERM_ATTENDANCE:' + numericScore,
      termAttendanceScore: numericScore,
    };
    await syncToCloud(cloudMeta);

    setAttSavedEntries(Object.values(getTermAttendanceStore()));
    setAttBusy(false);
    showNotice(`บันทึกคะแนนเข้าเรียนรวมทั้งเทอมของ ${stdName} (${numericScore} คะแนน) ลงฐานข้อมูลเรียบร้อย`, 'บันทึกสำเร็จ');
  };

  // In-Class Modal
  const openInClassModal = (fromLogin = false) => {
    setInClassAuthed(false);
    setInClassPwd('');
    setInClassStatusMsg('');
    if (fromLogin && currentLesson) {
      setInClassLessonId(currentLesson.id);
      setInClassStdId(lessonStdId);
      setInClassStdName(lessonStdName);
    } else {
      const firstLesson = courses[currentLevel]?.[0] || courses['m-ton'][0];
      setInClassLessonId(firstLesson ? firstLesson.id : '');
      setInClassStdId('');
      setInClassStdName('');
    }
    setInClassScore('');
    setInClassNote('');
    setInClassOpen(true);
  };

  const verifyInClassPwd = async () => {
    if (inClassPwd.trim() !== '954803') {
      showNotice('รหัสผ่านคุณครูไม่ถูกต้อง!');
      return;
    }
    setInClassAuthed(true);
    await syncFromCloud(false);
  };

  const saveInClassScore = async () => {
    const idCheck = validateStudentId(inClassStdId);
    if (!idCheck.valid) {
      showNotice(idCheck.error, 'รหัสนักศึกษาไม่ถูกต้อง');
      return;
    }
    if (!inClassStdName.trim()) {
      showNotice('กรุณากรอกชื่อ-นามสกุลให้ครบถ้วน');
      return;
    }
    if (inClassScore === '' || isNaN(Number(inClassScore)) || Number(inClassScore) < 0 || Number(inClassScore) > 20) {
      showNotice('กรุณากรอกคะแนนในชั้นเรียนเป็นตัวเลขระหว่าง 0 ถึง 20');
      return;
    }

    let targetLesson: Lesson | undefined;
    let targetLevel: CourseLevel = currentLevel;
    for (const lvl of ['m-ton', 'm-ปลาย'] as CourseLevel[]) {
      const found = (courses[lvl] || []).find((l) => l.id === inClassLessonId);
      if (found) {
        targetLesson = found;
        targetLevel = lvl;
        break;
      }
    }
    if (!targetLesson) {
      showNotice('ไม่พบข้อมูลบทเรียนที่เลือก');
      return;
    }

    setInClassBusy(true);
    const stdId = idCheck.clean;
    const stdName = inClassStdName.trim();
    const totalScore = Number(inClassScore);
    const quizPart = Number((totalScore / 2).toFixed(2));
    const assignPart = Number((totalScore - quizPart).toFixed(2));
    const isPassed = totalScore >= 10;
    const existingTermAtt = getTermAttendanceScore(stdId, records);
    const feedbackText = inClassNote.trim() ? `เรียนในชั้นเรียน (${inClassNote.trim()})` : 'เรียนในชั้นเรียน';
    const attendedTime = new Date().toLocaleString('th-TH') + ' (ในชั้นเรียน)';
    const normId = normalizeStdId(stdId);

    const existingIdx = records.findIndex(
      (r) => normalizeStdId(r.stdId || r.stdid) === normId && String(r.lessonId || r.lessonid || '').trim() === targetLesson!.id
    );

    const newRec: StudentRecord = {
      stdId,
      stdName,
      level: targetLevel,
      lessonId: targetLesson.id,
      courseCode: targetLesson.code,
      session: targetLesson.session,
      lessonTitle: `${targetLesson.title} (${targetLesson.code})`,
      attendedAt: attendedTime,
      quizAttempts: 2,
      bestQuizScore: quizPart,
      quizPassed: isPassed,
      assignmentAnswers: { inClass: true, classroomScore: totalScore },
      assignmentScore: assignPart,
      teacherFeedback: feedbackText,
      ...(existingTermAtt !== null ? { termAttendanceScore: existingTermAtt } : {}),
    };

    const nextRecords =
      existingIdx >= 0 ? records.map((r, i) => (i === existingIdx ? newRec : r)) : [...records, newRec];
    setRecords(nextRecords);
    saveCachedRecords(nextRecords);
    await syncToCloud(newRec);

    setInClassBusy(false);
    setInClassStatusMsg(
      `บันทึกคะแนนในชั้นเรียนของ ${stdName} (${stdId}) จำนวน ${totalScore}/20 คะแนน ลงชีตเรียบร้อยแล้ว`
    );
    setInClassStdId('');
    setInClassStdName('');
    setInClassScore('');
    setInClassNote('');
  };

  // Maintenance controls
  const setCloudMaintenance = async (enabled: boolean, customMessage?: string) => {
    const payload: MaintenanceState = {
      enabled,
      message:
        customMessage ||
        'ขณะนี้คุณครูกำลังปรับปรุงและอัปเดตข้อมูลระบบห้องเรียนออนไลน์ เพื่อป้องกันข้อมูลคลาดเคลื่อน กรุณารอสักครู่แล้วกลับมาใช้งานใหม่อีกครั้งครับ',
      updatedAt: new Date().toLocaleString('th-TH'),
    };
    saveMaintenanceStateLocal(payload);
    setMaintenance(payload);

    await syncToCloud({
      stdId: '__SYSTEM_MAINTENANCE__',
      stdName: 'สถานะปิดปรับปรุงระบบ',
      level: 'm-ton',
      lessonId: '__MAINTENANCE_MODE__',
      courseCode: 'SYSTEM',
      session: 'โหมดปรับปรุงระบบ',
      lessonTitle: enabled ? 'ปิดปรับปรุงชั่วคราว' : 'เปิดใช้งานปกติ',
      attendedAt: new Date().toLocaleString('th-TH'),
      quizAttempts: 0,
      bestQuizScore: 0,
      quizPassed: false,
      assignmentAnswers: payload as unknown as Record<string, unknown>,
      assignmentScore: '',
      teacherFeedback: enabled ? 'MAINTENANCE_ON' : 'MAINTENANCE_OFF',
    });
  };

  const handleCmsSaveLesson = async (lvl: CourseLevel, lesson: Lesson) => {
    const nextOverrides = { ...lessonOverrides, [lesson.id]: { level: lvl, lesson } };
    setLessonOverrides(nextOverrides);
    saveLessonOverridesLocal(nextOverrides);
    await saveLessonOverrideToCloud(lvl, lesson);
  };

  const handleCmsDeleteLesson = async (lessonId: string) => {
    const nextDeleted = Array.from(new Set([...(cmsSettings.deletedLessonIds || []), lessonId]));
    const nextSettings: CmsSettings = { ...cmsSettings, deletedLessonIds: nextDeleted };
    setCmsSettings(nextSettings);
    saveCmsSettingsLocal(nextSettings);
    await saveCmsSettingsToCloud(nextSettings);
  };

  const handleCmsSaveSettings = async (settings: CmsSettings) => {
    setCmsSettings(settings);
    saveCmsSettingsLocal(settings);
    await saveCmsSettingsToCloud(settings);
  };

  // Helper render for Student ID validation status
  const renderStdIdValidationHint = (rawVal: string) => {
    if (!rawVal) {
      return (
        <div className="std-id-hint neutral">
          <span>
            <i className="fa-solid fa-circle-info"></i> ต้องขึ้นต้นด้วยเลข <strong>6</strong> และมี <strong>10 หลัก</strong>เท่านั้น (เช่น 6912345678)
          </span>
          <span className="font-mono-num">0/10</span>
        </div>
      );
    }
    const res = validateStudentId(rawVal);
    if (res.valid) {
      return (
        <div className="std-id-hint valid">
          <span>
            <i className="fa-solid fa-circle-check"></i> รูปแบบรหัสนักศึกษาถูกต้อง
          </span>
          <span className="font-mono-num">10/10</span>
        </div>
      );
    }
    return (
      <div className="std-id-hint invalid">
        <span>
          <i className="fa-solid fa-circle-exclamation"></i> {res.error}
        </span>
        <span className="font-mono-num">{rawVal.length}/10</span>
      </div>
    );
  };

  const isLockedScreen = maintenance.enabled && !teacherBypass;

  // Course summary stats for Home View
  const mTonCoursesCount = useMemo(() => new Set((courses['m-ton'] || []).map((l) => l.code)).size, [courses]);
  const mTonSessionsCount = (courses['m-ton'] || []).length;
  const mPlaiCoursesCount = useMemo(() => new Set((courses['m-ปลาย'] || []).map((l) => l.code)).size, [courses]);
  const mPlaiSessionsCount = (courses['m-ปลาย'] || []).length;

  // Group current level lessons
  const groupedLevelCourses = useMemo(() => {
    const list = courses[currentLevel] || [];
    const grouped: Record<string, { code: string; title: string; sessions: Lesson[] }> = {};
    list.forEach((item) => {
      if (!grouped[item.code]) {
        grouped[item.code] = { code: item.code, title: item.title, sessions: [] };
      }
      grouped[item.code].sessions.push(item);
    });
    return Object.values(grouped);
  }, [courses, currentLevel]);

  const ungradedList = useMemo(() => {
    let list = validRecords.filter((r) => hasStudentSubmittedAssignment(r) && getRecordAssignmentScore(r) === null);
    if (ungradedLevel !== 'all') list = list.filter((r) => (r.level || '') === ungradedLevel);
    if (ungradedCourse !== 'all') {
      list = list.filter((r) => r.courseCode === ungradedCourse || (r.lessonTitle && r.lessonTitle.includes(ungradedCourse)));
    }
    return list;
  }, [validRecords, ungradedLevel, ungradedCourse]);

  const allUniqueCourseCodes = useMemo(() => {
    const map: Record<string, string> = {};
    [...(courses['m-ton'] || []), ...(courses['m-ปลาย'] || [])].forEach((l) => {
      if (!map[l.code]) map[l.code] = l.title;
    });
    return Object.entries(map);
  }, [courses]);

  return (
    <>
      {/* Boot Loader */}
      {!bootResolved && !teacherBypass && (
        <div id="maint-boot-loader">
          <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '30px 22px' }}>
            <div
              style={{
                width: '58px',
                height: '58px',
                borderRadius: '16px',
                background: 'var(--pastel-purple-light)',
                color: 'var(--pastel-purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px',
                fontSize: '1.5rem',
              }}
            >
              <i className="fa-solid fa-arrows-rotate fa-spin"></i>
            </div>
            <h2 style={{ color: 'var(--text-dark)', fontSize: '1.15rem', marginBottom: '6px' }}>กำลังตรวจสอบสถานะระบบ</h2>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
              กรุณารอสักครู่ ระบบกำลังเชื่อมต่อข้อมูลล่าสุดจากฐานข้อมูลกลาง...
            </p>
          </div>
        </div>
      )}

      {/* Maintenance Overlay */}
      {bootResolved && isLockedScreen && (
        <div id="maintenance-overlay">
          <div
            className="card"
            style={{
              maxWidth: '470px',
              width: '100%',
              textAlign: 'center',
              padding: '30px 24px',
              border: '1.5px solid #EADFF5',
              background: '#FFFDF9',
            }}
          >
            <div
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '20px',
                background: 'var(--danger-bg)',
                color: 'var(--danger)',
                border: '1px solid #F5CBD6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '1.9rem',
              }}
            >
              <i className="fa-solid fa-lock"></i>
            </div>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--pastel-purple)', marginBottom: '6px' }}>
              ศูนย์การเรียนชุมชน • ปีการศึกษา 2569 ภาคเรียนที่ 2
            </p>
            <h2 style={{ color: 'var(--text-dark)', fontSize: '1.4rem', marginBottom: '10px' }}>ปิดปรับปรุงระบบชั่วคราว</h2>
            <p style={{ fontSize: '0.93rem', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '20px' }}>
              {maintenance.message ||
                'ขณะนี้คุณครูกำลังปรับปรุงและอัปเดตข้อมูลระบบห้องเรียนออนไลน์ เพื่อป้องกันข้อมูลคลาดเคลื่อน กรุณารอสักครู่แล้วกลับมาใช้งานใหม่อีกครั้งครับ'}
            </p>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ flex: 1, padding: '10px 14px', fontSize: '0.86rem' }}
                disabled={maintBusy}
                onClick={async () => {
                  setMaintBusy(true);
                  const res = await syncFromCloud(false);
                  setMaintBusy(false);
                  if (res && !res.maintenance.enabled && res.cmsSettings.kpcEnabled) {
                    setKpcOpen(true);
                  }
                }}
              >
                <i className={`fa-solid fa-arrows-rotate ${maintBusy ? 'fa-spin' : ''}`}></i>{' '}
                {maintBusy ? 'กำลังตรวจสอบ...' : 'ตรวจสอบสถานะอีกครั้ง'}
              </button>
              <button
                type="button"
                className="btn"
                style={{ flex: 1, padding: '10px 14px', fontSize: '0.86rem' }}
                onClick={() => setMaintPanelOpen((p) => !p)}
              >
                <i className="fa-solid fa-key"></i> สำหรับคุณครู
              </button>
            </div>

            {maintPanelOpen && (
              <div
                style={{
                  marginTop: '12px',
                  textAlign: 'left',
                  background: 'var(--pastel-pink-light)',
                  padding: '14px',
                  borderRadius: '14px',
                  border: '1px solid #F5CBD6',
                }}
              >
                {!maintAuthed ? (
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                      กรอกรหัสผ่านคุณครูเพื่อเข้าทดสอบหรือเปิดระบบ
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="password"
                        value={maintPwd}
                        onChange={(e) => setMaintPwd(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (maintPwd.trim() === '954803') {
                              setMaintAuthed(true);
                              setMaintPwd('');
                            } else {
                              showNotice('รหัสผ่านคุณครูไม่ถูกต้อง!');
                            }
                          }
                        }}
                        placeholder="รหัสผ่านคุณครู"
                        style={{
                          flex: 1,
                          padding: '9px 12px',
                          border: '1px solid #DFCFEA',
                          borderRadius: '10px',
                          outline: 'none',
                          background: 'white',
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ padding: '9px 16px' }}
                        onClick={() => {
                          if (maintPwd.trim() === '954803') {
                            setMaintAuthed(true);
                            setMaintPwd('');
                          } else {
                            showNotice('รหัสผ่านคุณครูไม่ถูกต้อง!');
                          }
                        }}
                      >
                        ยืนยัน
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ width: '100%', padding: '10px', fontSize: '0.86rem' }}
                      onClick={() => {
                        sessionStorage.setItem('clc_teacher_bypass', '1');
                        setTeacherBypass(true);
                      }}
                    >
                      <i className="fa-solid fa-eye"></i> เข้าทดสอบเว็บเฉพาะเครื่องครู (นักศึกษายังถูกล็อคอยู่)
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ width: '100%', background: 'var(--success)', padding: '10px', fontSize: '0.86rem' }}
                      disabled={maintBusy}
                      onClick={async () => {
                        if (FORCE_MAINTENANCE_MODE) {
                          showNotice('ตอนนี้ในโค้ดตั้งค่า FORCE_MAINTENANCE_MODE = true ไว้ กรุณาแก้เป็น false ด้วยนะครับ');
                          return;
                        }
                        setMaintBusy(true);
                        sessionStorage.removeItem('clc_teacher_bypass');
                        setTeacherBypass(false);
                        await setCloudMaintenance(false);
                        setMaintBusy(false);
                        showNotice('เปิดเว็บไซต์ให้นักศึกษาเข้าใช้งานตามปกติแล้วครับ');
                      }}
                    >
                      <i className="fa-solid fa-circle-check"></i>{' '}
                      {maintBusy ? 'กำลังเปิดเว็บไซต์...' : 'เปิดเว็บไซต์ให้นักศึกษาเข้าใช้งานทันที'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* APP SHELL */}
      {bootResolved && !isLockedScreen && (
        <div id="app-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {maintenance.enabled && teacherBypass && (
            <div className="teacher-bypass-bar">
              <span>
                <i className="fa-solid fa-eye"></i> โหมดทดสอบสำหรับคุณครู (หน้าเว็บจริงยังคงล็อคปิดระบบสำหรับนักศึกษาอยู่)
              </span>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem('clc_teacher_bypass');
                  setTeacherBypass(false);
                  setMaintAuthed(false);
                  navigate('view-home');
                }}
              >
                กลับไปหน้าล็อคระบบ
              </button>
            </div>
          )}

          {/* Header */}
          <header className="site-header">
            <div className="header-inner">
              <div className="brand" onClick={() => navigate('view-home')}>
                <span className="brand-icon">
                  <i className="fa-solid fa-graduation-cap"></i>
                </span>
                <span>ศรช. ออนไลน์ 2/2569</span>
              </div>

              <nav className="header-nav">
                <button
                  type="button"
                  className={`nav-link-btn ${view === 'view-home' ? 'active' : ''}`}
                  onClick={() => navigate('view-home')}
                >
                  หน้าแรก
                </button>
                <button
                  type="button"
                  className={`nav-link-btn ${
                    view === 'view-student-login' || view === 'view-student-result' ? 'active' : ''
                  }`}
                  onClick={() => navigate('view-student-login')}
                >
                  ตรวจสอบคะแนน
                </button>
              </nav>

              <div className="header-btns">
                <button
                  type="button"
                  className="btn-header-mobile-score"
                  onClick={() => navigate('view-student-login')}
                >
                  ดูคะแนน
                </button>
                <button
                  type="button"
                  className="btn-header-teacher"
                  onClick={() => navigate('view-teacher-login')}
                >
                  <i className="fa-solid fa-shield-halved"></i>
                  <span>ระบบคุณครู</span>
                </button>
              </div>
            </div>

            <div className="mobile-quick-nav">
              <button
                type="button"
                className={`mobile-nav-chip ${view === 'view-home' ? 'active' : ''}`}
                onClick={() => navigate('view-home')}
              >
                <i className="fa-solid fa-house"></i> หน้าแรก
              </button>
              <button
                type="button"
                className={`mobile-nav-chip ${
                  view === 'view-student-login' || view === 'view-student-result' ? 'active' : ''
                }`}
                onClick={() => navigate('view-student-login')}
              >
                <i className="fa-solid fa-award"></i> ดูผลคะแนน
              </button>
            </div>
          </header>

          <div className="container">
            {/* 1. HOME VIEW */}
            {view === 'view-home' && (
              <div className="view-panel">
                <section className="gemini-hero-card">
                  <div className="gemini-hero-left">
                    <div>
                      <p className="gemini-hero-eyebrow">ปีการศึกษา 2569 · ภาคเรียนที่ 2</p>
                      <h1 className="gemini-hero-title">ห้องเรียนออนไลน์ ศูนย์การเรียนชุมชน</h1>
                      <p className="gemini-hero-desc">
                        ระบบการเรียนรู้ครบวงจร เช็คชื่อเข้าเรียนอัตโนมัติ ศึกษาเนื้อหาและอินโฟกราฟิก
                        เล่นเกมจับคู่ทบทวนความรู้ ทำใบงาน และทำแบบทดสอบออนไลน์พร้อมตรวจผลคะแนนได้ทันที
                      </p>
                    </div>
                  </div>

                  <div className="gemini-hero-visual">
                    {!coverFailed ? (
                      <div className="gemini-hero-img-box">
                        <SmartImage
                          src={cmsSettings.coverImageUrl || 'images/cover.png'}
                          alt="ภาพปกห้องเรียนออนไลน์ ศูนย์การเรียนชุมชน"
                          onAllFailed={() => setCoverFailed(true)}
                        />
                        <div className="gemini-hero-img-overlay">
                          <p style={{ fontSize: '0.78rem', color: '#FCE7F3', fontWeight: 500 }}>ยินดีต้อนรับนักศึกษา ศรช.</p>
                          <p style={{ marginTop: '2px', fontFamily: 'Prompt, sans-serif', fontSize: '1.15rem', fontWeight: 600 }}>
                            เรียนรู้ได้ทุกที่ ทุกเวลา
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="gemini-hero-fallback">
                        <div className="gemini-hero-fallback-icon">
                          <i className="fa-solid fa-graduation-cap"></i>
                        </div>
                        <div>
                          <p style={{ fontSize: '0.78rem', color: '#FFF1E6', fontWeight: 500 }}>ศูนย์การเรียนชุมชน</p>
                          <h2 style={{ marginTop: '4px', fontSize: '1.25rem', fontWeight: 600 }}>ระบบห้องเรียนออนไลน์ 2/2569</h2>
                          <p style={{ marginTop: '6px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.92)', lineHeight: 1.55 }}>
                            ครบครันทั้ง {mTonCoursesCount + mPlaiCoursesCount} รายวิชา ระดับ ม.ต้น และ ม.ปลาย บันทึกคะแนนเข้าสู่ระบบคลาวด์อัตโนมัติ
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* News Board */}
                <section className="news-board-card">
                  <div className="news-board-header">
                    <i className="fa-solid fa-bullhorn" style={{ color: '#B95D78', fontSize: '1.1rem' }}></i>
                    <h2 style={{ fontSize: '1.12rem', color: 'var(--text-dark)', fontWeight: 600 }}>กระดานข่าวประชาสัมพันธ์</h2>
                  </div>

                  <div className="news-board-grid">
                    <div>
                      {!newsImgFailed ? (
                        <div
                          className="news-board-img-wrap"
                          onClick={() =>
                            setLightboxSrc(
                              resolveFallbackImageUrl(cmsSettings.newsImageUrl) || cmsSettings.newsImageUrl || 'images/news.png'
                            )
                          }
                        >
                          <SmartImage
                            src={cmsSettings.newsImageUrl || 'images/news.png'}
                            alt="ภาพกระดานข่าวประชาสัมพันธ์"
                            onAllFailed={() => setNewsImgFailed(true)}
                          />
                          <div className="news-zoom-hint">
                            <i className="fa-solid fa-magnifying-glass-plus"></i> แตะดูภาพใหญ่
                          </div>
                        </div>
                      ) : (
                        <div className="news-board-fallback">
                          <i className="fa-solid fa-bullhorn" style={{ fontSize: '1.8rem', color: '#B95D78', marginBottom: '8px' }}></i>
                          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>
                            ประชาสัมพันธ์ภาคเรียนที่ 2/2569
                          </p>
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>ศูนย์การเรียนชุมชน</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 style={{ fontSize: '1.02rem', fontWeight: 600, color: 'var(--text-dark)' }}>
                        {cmsSettings.newsHeading || DEFAULT_CMS_SETTINGS.newsHeading}
                      </h3>
                      <p className="news-board-caption">{cmsSettings.newsBody || DEFAULT_CMS_SETTINGS.newsBody}</p>
                    </div>
                  </div>
                </section>

                {/* Level Selection */}
                <section style={{ marginBottom: '24px' }}>
                  <div className="gemini-section-head">
                    <div>
                      <h2>เลือกระดับชั้นเพื่อเข้าเรียน</h2>
                      <p>เลือกหมวดระดับชั้นของนักศึกษาเพื่อดูรายวิชาและครั้งที่เปิดสอน</p>
                    </div>
                  </div>

                  <div className="level-selection">
                    <button type="button" className="btn-level-card" onClick={() => openLevel('m-ton')}>
                      <div className="btn-level-icon pink">
                        <i className="fa-solid fa-school"></i>
                      </div>
                      <div className="btn-level-body">
                        <div className="btn-level-title-row">
                          <h3>ระดับมัธยมศึกษาตอนต้น (ม.ต้น)</h3>
                          <i className="fa-solid fa-arrow-right" style={{ color: '#9B8CA8' }}></i>
                        </div>
                        <p style={{ marginTop: '4px', fontSize: '0.88rem', color: 'var(--text-body)' }}>
                          {mTonCoursesCount} รายวิชาหลัก · รวมทั้งหมด {mTonSessionsCount} ครั้ง
                        </p>
                        <p style={{ marginTop: '6px', fontSize: '0.76rem', color: '#8A7B99' }}>
                          การค้าขายออนไลน์ · สังคมศึกษาฯ · ภาษาอังกฤษ
                        </p>
                      </div>
                    </button>

                    <button type="button" className="btn-level-card purple-theme" onClick={() => openLevel('m-ปลาย')}>
                      <div className="btn-level-icon purple">
                        <i className="fa-solid fa-building-columns"></i>
                      </div>
                      <div className="btn-level-body">
                        <div className="btn-level-title-row">
                          <h3>ระดับมัธยมศึกษาตอนปลาย (ม.ปลาย)</h3>
                          <i className="fa-solid fa-arrow-right" style={{ color: '#9B8CA8' }}></i>
                        </div>
                        <p style={{ marginTop: '4px', fontSize: '0.88rem', color: 'var(--text-body)' }}>
                          {mPlaiCoursesCount} รายวิชาหลัก · รวมทั้งหมด {mPlaiSessionsCount} ครั้ง
                        </p>
                        <p style={{ marginTop: '6px', fontSize: '0.76rem', color: '#8A7B99' }}>
                          สังคมศึกษาฯ · คุณธรรมอาชีพบริการ · สุขภาพฯ · ภาษาอังกฤษ
                        </p>
                      </div>
                    </button>
                  </div>

                  <div className="inclass-strip">
                    <span style={{ fontSize: '0.84rem', color: 'var(--text-body)' }}>
                      <i className="fa-solid fa-key" style={{ color: 'var(--pastel-purple)' }}></i>{' '}
                      <strong>สำหรับผู้เข้าเรียนในชั้นเรียน:</strong> คุณครูสามารถเปิดหน้าต่างกรอกคะแนนในคาบเรียนได้จากตรงนี้ทันที
                    </span>
                    <button type="button" className="btn btn-sm" onClick={() => openInClassModal(false)}>
                      <i className="fa-solid fa-key"></i> กรอกคะแนนสำหรับเรียนในชั้นเรียน
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* 2. LESSON LIST VIEW */}
            {view === 'view-lessons' && (
              <div className="view-panel">
                <span className="back-btn" onClick={() => navigate('view-home')}>
                  <i className="fa-solid fa-arrow-left"></i> หน้าแรก
                </span>
                <div className="card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                      marginBottom: '16px',
                    }}
                  >
                    <h2 style={{ color: 'var(--pastel-purple)', fontSize: '1.25rem', margin: 0 }}>
                      {currentLevel === 'm-ton' ? 'ระดับมัธยมศึกษาตอนต้น (ม.ต้น)' : 'ระดับมัธยมศึกษาตอนปลาย (ม.ปลาย)'}
                    </h2>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => openInClassModal(false)}>
                      <i className="fa-solid fa-chalkboard-user"></i> กรอกคะแนนในชั้นเรียน
                    </button>
                  </div>

                  <div>
                    {groupedLevelCourses.map((course) => (
                      <div key={course.code} className="course-card">
                        <div className="course-header">
                          <span>
                            <i className="fa-solid fa-book-bookmark"></i> {course.title} ({course.code})
                          </span>
                          <small style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            เรียน {course.sessions.length} ครั้ง
                          </small>
                        </div>
                        <div className="session-badge-list">
                          {course.sessions.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className={`session-btn ${s.isLocked ? 'locked' : ''}`}
                              onClick={() => selectLesson(s)}
                            >
                              {s.isLocked ? (
                                <>
                                  <i className="fa-solid fa-lock"></i> {s.session}{' '}
                                  <small style={{ fontSize: '0.7rem' }}>(ล็อค)</small>
                                </>
                              ) : (
                                <>
                                  <i className="fa-solid fa-book-open" style={{ fontSize: '0.75rem' }}></i> {s.session}
                                </>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="inclass-strip">
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      <i className="fa-solid fa-chalkboard-user" style={{ color: 'var(--pastel-purple)' }}></i>{' '}
                      <strong>สำหรับเรียนในชั้นเรียน</strong> (สำหรับนักศึกษาที่เรียนในคาบกับครู)
                    </span>
                    <button type="button" className="btn btn-sm" onClick={() => openInClassModal(false)}>
                      <i className="fa-solid fa-key"></i> ครูกรอกคะแนนในชั้นเรียน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. STUDENT LOGIN FOR ATTENDANCE */}
            {view === 'view-lesson-login' && currentLesson && (
              <div className="view-panel">
                <span className="back-btn" onClick={() => navigate('view-lessons')}>
                  <i className="fa-solid fa-arrow-left"></i> ย้อนกลับ
                </span>
                <div className="card" style={{ textAlign: 'center', maxWidth: '560px', margin: '0 auto' }}>
                  <div
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '16px',
                      background: 'var(--pastel-pink-light)',
                      color: 'var(--pastel-pink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                      fontSize: '1.5rem',
                    }}
                  >
                    <i className="fa-solid fa-id-card"></i>
                  </div>
                  <h2 style={{ marginBottom: '6px', fontSize: '1.15rem', color: 'var(--text-dark)' }}>
                    {currentLesson.title} ({currentLesson.code}) - {currentLesson.session}
                  </h2>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    กรอกรหัสนักศึกษาเพื่อเช็คชื่อเข้าเรียนอัตโนมัติ
                  </p>

                  <div className="std-id-warning-box">
                    <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--warning)' }}></i>{' '}
                    <strong>คำเตือน:</strong> รหัสนักศึกษาต้อง<strong>ขึ้นต้นด้วยเลข 6 และมี 10 หลักเท่านั้น</strong> (เช่น 69xxxxxxxx) กรอกให้ถูกต้องทุกครั้ง มิเช่นนั้นระบบจะไม่บันทึกคะแนน
                  </div>

                  <div className="input-group">
                    <label>รหัสนักศึกษา (ขึ้นต้นด้วย 6 · จำนวน 10 หลัก)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      value={lessonStdId}
                      onChange={(e) => setLessonStdId(sanitizeStudentIdInput(e.target.value))}
                      placeholder="เช่น 6912345678"
                    />
                    {renderStdIdValidationHint(lessonStdId)}
                  </div>
                  <div className="input-group">
                    <label>ชื่อ - นามสกุล นักศึกษา</label>
                    <input
                      type="text"
                      value={lessonStdName}
                      onChange={(e) => setLessonStdName(e.target.value)}
                      placeholder="ชื่อ นามสกุล จริง"
                    />
                  </div>
                  <button type="button" className="btn" disabled={lessonStartBusy} onClick={startLearningLesson}>
                    {lessonStartBusy ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i> กำลังตรวจสอบประวัติเดิม...
                      </>
                    ) : (
                      'เช็คชื่อและเริ่มศึกษาเนื้อหา'
                    )}
                  </button>

                  <div className="inclass-strip">
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'left' }}>
                      <i className="fa-solid fa-chalkboard-user" style={{ color: 'var(--pastel-purple)' }}></i>{' '}
                      <strong>สำหรับเรียนในชั้นเรียน</strong> (ครูกรอกคะแนนในคาบ)
                    </span>
                    <button type="button" className="btn btn-sm" onClick={() => openInClassModal(true)}>
                      <i className="fa-solid fa-key"></i> กรอกคะแนนในชั้นเรียน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. STEP 1: READING */}
            {view === 'view-step-read' && currentLesson && (
              <div className="view-panel">
                <div className="step-indicator">
                  <div className="step-item active">
                    <div className="step-circle">1</div>อ่านเนื้อหา
                  </div>
                  <div className="step-item">
                    <div className="step-circle">2</div>เกมจับคู่
                  </div>
                  <div className="step-item">
                    <div className="step-circle">3</div>ทำใบงาน
                  </div>
                  <div className="step-item">
                    <div className="step-circle">4</div>แบบทดสอบ
                  </div>
                </div>

                {(() => {
                  const pages = currentLesson.pages || [{ title: 'เนื้อหาบทเรียน', content: '', infographicUrl: '' }];
                  const page = pages[currentPageIndex] || pages[0];
                  const totalPages = pages.length;
                  return (
                    <>
                      <div className="fb-post-card">
                        <div className="fb-post-header">
                          <div className="fb-avatar">
                            <i className="fa-solid fa-graduation-cap"></i>
                          </div>
                          <div className="fb-meta" style={{ flex: 1 }}>
                            <h4>คุณครูผู้สอน • ศูนย์การเรียนชุมชน</h4>
                            <span>
                              <i className="fa-solid fa-book-bookmark"></i> {currentLesson.code} • {currentLesson.session} •{' '}
                              <i className="fa-solid fa-earth-americas"></i> สาธารณะ
                            </span>
                          </div>
                          <div className="page-badge-counter">
                            หน้า {currentPageIndex + 1} / {totalPages}
                          </div>
                        </div>

                        <div
                          className="fb-content no-copy-zone"
                          onCopy={(e) => e.preventDefault()}
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          <span className="fb-tags-badge">
                            #{currentLesson.title} ({currentLesson.session})
                          </span>
                          <h3 style={{ color: 'var(--pastel-purple)', fontSize: '1.08rem', marginBottom: '8px', fontWeight: 600 }}>
                            {page.title || `ตอนที่ ${currentPageIndex + 1}`}
                          </h3>
                          <div style={{ whiteSpace: 'pre-wrap', marginTop: '4px' }}>{page.content || ''}</div>
                        </div>

                        {page.infographicUrl && page.infographicUrl.trim() !== '' && (
                          <div
                            className="fb-read-media"
                            onClick={() =>
                              setLightboxSrc(resolveFallbackImageUrl(page.infographicUrl) || page.infographicUrl)
                            }
                          >
                            <SmartImage src={page.infographicUrl} alt="ภาพอินโฟกราฟิก" />
                            <div className="fb-read-media-overlay">
                              <i className="fa-solid fa-magnifying-glass-plus"></i> แตะเพื่อซูมภาพเต็มจอ
                            </div>
                          </div>
                        )}

                        <div className="fb-actions-bar">
                          <button
                            type="button"
                            className={`fb-action-btn ${readLiked ? 'liked' : ''}`}
                            onClick={() => setReadLiked((l) => !l)}
                          >
                            <i className={readLiked ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up'}></i>{' '}
                            <span>{readLiked ? 'ถูกใจแล้ว (1)' : 'ถูกใจ'}</span>
                          </button>
                          <span className="fb-action-btn" style={{ cursor: 'default' }}>
                            <i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--pastel-purple)' }}></i>{' '}
                            บังคับอ่านทีละหน้า
                          </span>
                        </div>
                      </div>

                      <div className="card" style={{ padding: '16px 18px', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                          <i className="fa-solid fa-book-reader" style={{ color: 'var(--pastel-purple)' }}></i> บังคับอ่านหน้านี้อย่างน้อย{' '}
                          <span style={{ fontWeight: 600, color: 'var(--pastel-purple)' }}>{readTimeLeft}</span> วินาที ก่อนเปิดหน้าถัดไป
                        </p>
                        <button
                          type="button"
                          className="btn"
                          disabled={readTimeLeft > 0}
                          onClick={() => {
                            if (currentPageIndex < totalPages - 1) {
                              startReadingPage(currentPageIndex + 1);
                              window.scrollTo(0, 0);
                            } else {
                              goToMatchingGameStep();
                            }
                          }}
                        >
                          {readTimeLeft > 0 ? (
                            <>
                              หน้าถัดไป <i className="fa-solid fa-arrow-right"></i>
                            </>
                          ) : currentPageIndex < totalPages - 1 ? (
                            <>
                              หน้าถัดไป: อ่านหน้า {currentPageIndex + 2}/{totalPages} <i className="fa-solid fa-arrow-right"></i>
                            </>
                          ) : (
                            <>
                              จบการอ่าน: ไปเล่นเกมจับคู่ความรู้ <i className="fa-solid fa-arrow-right"></i>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* 5. STEP 2: MATCHING GAME / FLIP CARD GAME */}
            {view === 'view-step-matching' && currentLesson && (
              <div className="view-panel">
                <div className="step-indicator">
                  <div className="step-item completed">
                    <div className="step-circle">
                      <i className="fa-solid fa-check"></i>
                    </div>
                    อ่านเนื้อหา
                  </div>
                  <div className="step-item active">
                    <div className="step-circle">2</div>เกมจับคู่
                  </div>
                  <div className="step-item">
                    <div className="step-circle">3</div>ทำใบงาน
                  </div>
                  <div className="step-item">
                    <div className="step-circle">4</div>แบบทดสอบ
                  </div>
                </div>

                {(() => {
                  const flipMode = isFlipGameLesson(currentLesson);
                  const total = matchingPairs.length;
                  const done = matchedPairIds.length;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                  return (
                    <div className="card">
                      <div className="matching-toolbar">
                        <div>
                          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--pastel-pink)', marginBottom: '2px' }}>
                            <i className="fa-solid fa-gamepad"></i> ภารกิจบังคับก่อนทำใบงาน (ไม่สามารถกดข้ามได้)
                          </p>
                          <h2 style={{ fontSize: '1.18rem', color: 'var(--text-dark)' }}>
                            {flipMode ? 'เกมเปิดการ์ดจับคู่ความจำประจำบทเรียน' : 'เกมจับคู่ทบทวนความรู้ประจำบทเรียน'}
                          </h2>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {currentLesson.code} • {currentLesson.title} ({currentLesson.session})
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span className="matching-stats-box">
                            {flipMode
                              ? `เจอแล้ว ${done}/${total} คู่ · พลาด ${matchingMistakes} ครั้ง`
                              : `จับคู่แล้ว ${done}/${total} · ผิด ${matchingMistakes} ครั้ง`}
                          </span>
                          {!matchingCompleted && (
                            <button type="button" className="btn btn-sm btn-outline" onClick={shuffleMatchingBoard}>
                              <i className="fa-solid fa-shuffle"></i> สลับการ์ด
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => setMatchingMuted((m) => !m)}
                            title="เปิด/ปิดเสียง"
                          >
                            <i className={matchingMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high'}></i>
                          </button>
                        </div>
                      </div>

                      <div className="matching-progress-wrap">
                        <div className="matching-progress-header">
                          <span>ความคืบหน้าในการจับคู่</span>
                          <strong style={{ color: 'var(--pastel-purple)' }}>{pct}%</strong>
                        </div>
                        <div className="matching-progress-bar">
                          <div
                            className={`matching-progress-fill ${done === total && total > 0 ? 'done' : ''}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div
                        className={`matching-feedback ${
                          matchingFeedback.type === 'success'
                            ? 'success'
                            : matchingFeedback.type === 'error'
                              ? 'error'
                              : ''
                        }`}
                      >
                        {matchingFeedback.type === 'success' ? (
                          <i className="fa-solid fa-circle-check"></i>
                        ) : matchingFeedback.type === 'error' ? (
                          <i className="fa-solid fa-circle-xmark"></i>
                        ) : (
                          <i className="fa-solid fa-puzzle-piece" style={{ color: 'var(--pastel-purple)' }}></i>
                        )}
                        <span>{matchingFeedback.text}</span>
                      </div>

                      {!flipMode ? (
                        <div className="matching-board">
                          <div className="matching-col">
                            <div className="matching-col-title">
                              <span>ฝั่งซ้าย · หัวข้อ</span>
                              <span className="matching-col-hint">แตะเลือก</span>
                            </div>
                            <div className="matching-card-list">
                              {matchingLeftOrder.map((item) => {
                                const isMatched = matchedPairIds.includes(item.id);
                                const isSelected = selectedLeftId === item.id;
                                const isMismatch = mismatchPair.left === item.id;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    disabled={isMatched}
                                    className={`match-card left-side ${
                                      isMatched
                                        ? 'matched'
                                        : isMismatch
                                          ? 'mismatch animate-shake'
                                          : isSelected
                                            ? 'selected-left'
                                            : ''
                                    }`}
                                    onClick={() => onPickLeftCard(item.id)}
                                  >
                                    <span>{item.term}</span>
                                    {isMatched && <i className="fa-solid fa-circle-check"></i>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="matching-col">
                            <div className="matching-col-title">
                              <span>ฝั่งขวา · คำตอบที่คู่กัน</span>
                              <span className="matching-col-hint">แตะจับคู่</span>
                            </div>
                            <div className="matching-card-list">
                              {matchingRightOrder.map((item) => {
                                const isMatched = matchedPairIds.includes(item.id);
                                const isSelected = selectedRightId === item.id;
                                const isMismatch = mismatchPair.right === item.id;
                                return (
                                  <button
                                    key={item.id}
                                    type="button"
                                    disabled={isMatched}
                                    className={`match-card right-side ${
                                      isMatched
                                        ? 'matched'
                                        : isMismatch
                                          ? 'mismatch animate-shake'
                                          : isSelected
                                            ? 'selected-right'
                                            : ''
                                    }`}
                                    onClick={() => onPickRightCard(item.id)}
                                  >
                                    <span>{item.match}</span>
                                    {isMatched && <i className="fa-solid fa-circle-check"></i>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flip-card-grid">
                          {flipDeck.map((card, idx) => {
                            const isMatched = matchedPairIds.includes(card.pairId);
                            const isFlipped = isMatched || flippedCardUids.includes(card.uid);
                            const isMismatch = flipMismatchUids.includes(card.uid);
                            return (
                              <button
                                key={card.uid}
                                type="button"
                                disabled={isMatched}
                                className={`flip-card-btn ${
                                  !isFlipped
                                    ? 'face-down'
                                    : isMatched
                                      ? 'matched'
                                      : isMismatch
                                        ? 'mismatch animate-shake'
                                        : card.side === 'term'
                                          ? 'flipped-term'
                                          : 'flipped-match'
                                }`}
                                onClick={() => onFlipCardClick(card.uid)}
                              >
                                {!isFlipped ? (
                                  <>
                                    <i className="fa-solid fa-circle-question" style={{ fontSize: '1.35rem', opacity: 0.92 }}></i>
                                    <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>การ์ด #{idx + 1}</span>
                                  </>
                                ) : (
                                  <>
                                    <span className={`flip-card-tag ${isMatched ? 'done' : card.side}`}>
                                      {card.side === 'term' ? 'หัวข้อ' : 'ความหมาย'}
                                    </span>
                                    <span className="flip-card-text">{card.text}</span>
                                    {isMatched && (
                                      <i className="fa-solid fa-circle-check" style={{ color: '#059669', fontSize: '0.9rem' }}></i>
                                    )}
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <button type="button" className="btn" disabled={!matchingCompleted} onClick={goToAssignmentStep}>
                        {matchingCompleted ? (
                          <>
                            <i className="fa-solid fa-circle-check"></i>{' '}
                            {flipMode ? 'ผ่านเกมเปิดการ์ดแล้ว' : 'ผ่านเกมจับคู่แล้ว'} • ไปทำใบงานประจำครั้ง{' '}
                            <i className="fa-solid fa-arrow-right"></i>
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-lock"></i>{' '}
                            {flipMode
                              ? `เปิดการ์ดจับคู่ให้ครบทุกคู่ก่อนทำใบงาน (${done}/${total} คู่)`
                              : `จับคู่ให้ครบทุกคู่ก่อนทำใบงาน (${done}/${total} คู่)`}
                          </>
                        )}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 6. STEP 3: ASSIGNMENT */}
            {view === 'view-step-assignment' && currentLesson && (
              <div className="view-panel">
                <div className="step-indicator">
                  <div className="step-item completed">
                    <div className="step-circle">
                      <i className="fa-solid fa-check"></i>
                    </div>
                    อ่านเนื้อหา
                  </div>
                  <div className="step-item completed">
                    <div className="step-circle">
                      <i className="fa-solid fa-check"></i>
                    </div>
                    เกมจับคู่
                  </div>
                  <div className="step-item active">
                    <div className="step-circle">3</div>ทำใบงาน
                  </div>
                  <div className="step-item">
                    <div className="step-circle">4</div>แบบทดสอบ
                  </div>
                </div>

                <div className="fb-post-card">
                  <div className="fb-post-header">
                    <div className="fb-avatar">
                      <i className="fa-solid fa-chalkboard-user"></i>
                    </div>
                    <div className="fb-meta">
                      <h4>คุณครูผู้สอน • ศูนย์การเรียนชุมชน</h4>
                      <span>
                        <i className="fa-solid fa-clock"></i> ภารกิจใบงานประจำครั้ง •{' '}
                        <i className="fa-solid fa-earth-americas"></i> สาธารณะ
                      </span>
                    </div>
                  </div>

                  <div className="fb-content">
                    <div className="fb-tags-badge">
                      #{currentLesson.code} • {currentLesson.session}
                    </div>
                    <p style={{ marginBottom: '8px' }}>
                      สวัสดีนักศึกษาทุกคน ให้นักศึกษาอ่านโจทย์และพิมพ์คำตอบใบงานด้วยตนเองลงในช่องข้อความใต้แต่ละข้อได้เลยครับ
                    </p>

                    <div className="anti-paste-banner">
                      <i
                        className="fa-solid fa-keyboard"
                        style={{ color: 'var(--pastel-purple)', fontSize: '1.15rem', marginTop: '2px' }}
                      ></i>
                      <div>
                        <strong>ระบบฝึกทักษะการอ่านและพิมพ์ตอบด้วยตนเอง (ห้ามคัดลอก-วาง):</strong>
                        <br />
                        ไม่อนุญาตให้กด Copy / Paste (Ctrl+V / คลิกขวาวาง / ลากวาง) ลงในช่องใบงาน เพื่อให้นักศึกษาได้อ่านทำความเข้าใจและเรียบเรียงคำตอบด้วยตนเองครับ
                      </div>
                    </div>

                    {pasteWarningCount > 0 && (
                      <div className="paste-warning-alert">
                        <span>
                          <i className="fa-solid fa-shield-halved"></i> {pasteWarningText}
                        </span>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>แจ้งเตือน {pasteWarningCount} ครั้ง</span>
                      </div>
                    )}

                    {(currentLesson.assignmentTasks || ['ให้นักศึกษาสรุปสิ่งที่ได้เรียนรู้']).map((taskText, index) => {
                      const val = assignAnswers[index] || '';
                      return (
                        <div key={index} className="fb-task-callout">
                          <div
                            className="no-copy-zone"
                            onCopy={(e) => e.preventDefault()}
                            onContextMenu={(e) => e.preventDefault()}
                          >
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--pastel-pink)', marginBottom: '5px' }}>
                              📌 ภารกิจข้อที่ {index + 1}:
                            </div>
                            <div style={{ fontSize: '0.92rem', color: 'var(--text-dark)', marginBottom: '8px', lineHeight: 1.6 }}>
                              {taskText}
                            </div>
                          </div>
                          <div className="fb-comment-box">
                            <textarea
                              autoComplete="off"
                              spellCheck={false}
                              placeholder={`พิมพ์คำตอบข้อที่ ${index + 1} ด้วยตนเองที่นี่ (ห้ามวางข้อความ)...`}
                              value={val}
                              onCompositionStart={() => {
                                isThaiComposingRef.current = true;
                              }}
                              onCompositionEnd={() => {
                                isThaiComposingRef.current = false;
                              }}
                              onPaste={(e) => {
                                e.preventDefault();
                                triggerPasteWarning('ไม่อนุญาตให้วางข้อความ (Paste) ในใบงาน กรุณาอ่านและพิมพ์คำตอบด้วยตนเองครับ');
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                triggerPasteWarning('ไม่อนุญาตให้ลากวางข้อความลงในช่องคำตอบครับ');
                              }}
                              onCopy={(e) => {
                                e.preventDefault();
                                triggerPasteWarning('ไม่อนุญาตให้คัดลอกข้อความในหน้าใบงานครับ');
                              }}
                              onCut={(e) => e.preventDefault()}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                triggerPasteWarning('ปิดใช้งานเมนูคลิกขวาในช่องตอบใบงานเพื่อป้องกันการคัดลอกวางครับ');
                              }}
                              onKeyDown={(e) => {
                                const isMod = e.ctrlKey || e.metaKey;
                                const k = (e.key || '').toLowerCase();
                                if ((isMod && (k === 'v' || k === 'c' || k === 'x')) || (e.shiftKey && e.key === 'Insert')) {
                                  e.preventDefault();
                                  triggerPasteWarning('ไม่อนุญาตให้ใช้คีย์ลัด Copy / Paste กรุณาพิมพ์คำตอบด้วยตนเองครับ');
                                }
                              }}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                const nativeEvent = e.nativeEvent as InputEvent;
                                const inputType = nativeEvent?.inputType ? String(nativeEvent.inputType) : '';
                                if (
                                  inputType === 'insertFromPaste' ||
                                  inputType === 'insertFromDrop' ||
                                  inputType === 'insertFromPasteAsQuotation'
                                ) {
                                  triggerPasteWarning('ไม่อนุญาตให้วางข้อความ (Paste) ในใบงาน กรุณาพิมพ์คำตอบด้วยตนเองครับ');
                                  return;
                                }
                                const diff = nextVal.length - val.length;
                                if (!isThaiComposingRef.current && diff > 25) {
                                  triggerPasteWarning('ตรวจพบการวางข้อความจำนวนมากพร้อมกัน ระบบไม่อนุญาตให้วางคำตอบครับ');
                                  return;
                                }
                                setAssignAnswers((prev) => ({ ...prev, [index]: nextVal }));
                              }}
                            />
                            <div className="fb-comment-footer">
                              <span>
                                <i className="fa-solid fa-pen-nib"></i> คำตอบของ: {currentStudent ? currentStudent.name : 'นักศึกษา'}
                              </span>
                              <span style={{ color: 'var(--pastel-purple)', fontWeight: 500 }}>
                                {val.trim().length} ตัวอักษร
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="fb-actions-bar">
                    <button
                      type="button"
                      className={`fb-action-btn ${assignLiked ? 'liked' : ''}`}
                      onClick={() => setAssignLiked((l) => !l)}
                    >
                      <i className={assignLiked ? 'fa-solid fa-thumbs-up' : 'fa-regular fa-thumbs-up'}></i>{' '}
                      <span>{assignLiked ? 'ถูกใจแล้ว (1)' : 'ถูกใจ'}</span>
                    </button>
                    <span className="fb-action-btn" style={{ cursor: 'default' }}>
                      <i className="fa-solid fa-cloud-arrow-up" style={{ color: 'var(--pastel-purple)' }}></i> เชื่อมต่อคลาวด์
                    </span>
                  </div>
                </div>

                <button type="button" className="btn" disabled={assignSaveBusy} onClick={saveAssignmentAndNext}>
                  {assignSaveBusy ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกงานขึ้นระบบคลาวด์...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-paper-plane"></i> ส่งคำตอบใบงาน และทำแบบทดสอบ{' '}
                      <i className="fa-solid fa-arrow-right"></i>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* 7. STEP 4: QUIZ */}
            {view === 'view-step-quiz' && currentLesson && currentStudent && (
              <div className="view-panel">
                <div className="step-indicator">
                  <div className="step-item completed">
                    <div className="step-circle">
                      <i className="fa-solid fa-check"></i>
                    </div>
                    อ่านเนื้อหา
                  </div>
                  <div className="step-item completed">
                    <div className="step-circle">
                      <i className="fa-solid fa-check"></i>
                    </div>
                    เกมจับคู่
                  </div>
                  <div className="step-item completed">
                    <div className="step-circle">
                      <i className="fa-solid fa-check"></i>
                    </div>
                    ทำใบงาน
                  </div>
                  <div className="step-item active">
                    <div className="step-circle">4</div>แบบทดสอบ
                  </div>
                </div>

                {(() => {
                  const normId = normalizeStdId(currentStudent.id);
                  const rec = records.find(
                    (r) =>
                      normalizeStdId(r.stdId || r.stdid) === normId &&
                      String(r.lessonId || '').trim() === currentLesson.id
                  );
                  const attempts = rec ? Number(rec.quizAttempts) || 0 : 0;
                  const bestScore = rec ? Number(rec.bestQuizScore) || 0 : 0;
                  const totalQ = currentLesson.questions.length;
                  const passScore = Math.ceil(totalQ * 0.6);

                  return (
                    <div className="card">
                      <div
                        style={{
                          background: 'var(--pastel-purple-light)',
                          border: '1px solid #DFCFEA',
                          padding: '12px 14px',
                          borderRadius: '12px',
                          marginBottom: '16px',
                          fontSize: '0.85rem',
                        }}
                      >
                        <i className="fa-solid fa-circle-info" style={{ color: 'var(--pastel-purple)' }}></i> แบบทดสอบ {totalQ}{' '}
                        ข้อ (ข้อละ 1 คะแนน) | สอบได้ 2 ครั้ง (คิดคะแนนสูงสุด) | เกณฑ์ผ่าน {passScore} คะแนน
                        <div style={{ fontWeight: 600, color: 'var(--pastel-purple)', marginTop: '4px' }}>
                          สิทธิ์การสอบ: ครั้งที่ {attempts + 1} จาก 2 ครั้ง (คะแนนสูงสุดเดิม: {bestScore}/{totalQ})
                        </div>
                      </div>

                      {currentLesson.questions.map((qItem, qIdx) => (
                        <div key={qIdx} className="question-card">
                          <p style={{ fontWeight: 500, marginBottom: '8px' }}>{qItem.q}</p>
                          {qItem.options.map((opt, optIdx) => (
                            <label key={optIdx} className="option-label">
                              <input
                                type="radio"
                                name={`question_${qIdx}`}
                                checked={quizSelected[qIdx] === optIdx}
                                onChange={() => setQuizSelected((prev) => ({ ...prev, [qIdx]: optIdx }))}
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>
                      ))}

                      <button type="button" className="btn" disabled={quizSubmitBusy} onClick={submitQuiz}>
                        {quizSubmitBusy ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกคะแนนลงระบบ...
                          </>
                        ) : (
                          'ส่งคำตอบแบบทดสอบ'
                        )}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 8. STUDENT LOGIN TO VIEW SCORE */}
            {view === 'view-student-login' && (
              <div className="view-panel">
                <span className="back-btn" onClick={() => navigate('view-home')}>
                  <i className="fa-solid fa-arrow-left"></i> กลับหน้าแรก
                </span>
                <div className="card" style={{ textAlign: 'center', maxWidth: '480px', margin: '0 auto' }}>
                  <div
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '16px',
                      background: 'var(--pastel-pink-light)',
                      color: 'var(--pastel-pink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                      fontSize: '1.5rem',
                    }}
                  >
                    <i className="fa-solid fa-award"></i>
                  </div>
                  <h2 style={{ fontSize: '1.2rem', marginBottom: '5px' }}>ตรวจสอบผลการเรียนและคะแนน</h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    เข้าสู่ระบบด้วยรหัสนักศึกษา 10 หลักที่ขึ้นต้นด้วยเลข 6 (รหัสผ่านคือรหัสเดียวกัน)
                  </p>

                  <div className="input-group">
                    <label>รหัสนักศึกษา (ขึ้นต้นด้วย 6 · 10 หลัก)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={10}
                      value={checkStdId}
                      onChange={(e) => setCheckStdId(sanitizeStudentIdInput(e.target.value))}
                      placeholder="เช่น 6912345678"
                    />
                    {renderStdIdValidationHint(checkStdId)}
                  </div>
                  <div className="input-group">
                    <label>รหัสผ่าน</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={10}
                      value={checkStdPwd}
                      onChange={(e) => setCheckStdPwd(sanitizeStudentIdInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') loginCheckScore();
                      }}
                      placeholder="กรอกรหัสนักศึกษา 10 หลัก"
                    />
                  </div>
                  <button type="button" className="btn" disabled={checkLoginBusy} onClick={loginCheckScore}>
                    {checkLoginBusy ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i> กำลังค้นหาข้อมูล...
                      </>
                    ) : (
                      'เข้าสู่ระบบดูผลคะแนน'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* 9. STUDENT SCORE RESULT VIEW */}
            {view === 'view-student-result' && studentResultData && (
              <div className="view-panel">
                <span className="back-btn" onClick={() => navigate('view-student-login')}>
                  <i className="fa-solid fa-arrow-left"></i> ออกจากระบบ
                </span>
                <div className="card">
                  <h3 style={{ color: 'var(--pastel-purple)', fontSize: '1.18rem' }}>
                    ผู้เรียน: {studentResultData.stdName}
                  </h3>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    รหัสนักศึกษา: {studentResultData.stdId}
                  </p>
                  <div
                    style={{
                      background: 'var(--pastel-purple-light)',
                      border: '1px solid #DFCFEA',
                      padding: '11px 15px',
                      borderRadius: '12px',
                      marginBottom: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--pastel-purple)' }}>
                      <i className="fa-solid fa-user-check"></i> คะแนนเข้าเรียนรวมทั้งเทอม
                    </span>
                    {studentResultData.termAttScore !== null ? (
                      <span className="badge badge-pass" style={{ fontSize: '0.9rem' }}>
                        {studentResultData.termAttScore} คะแนน
                      </span>
                    ) : (
                      <span className="badge badge-wait" style={{ fontSize: '0.85rem' }}>
                        รอครูกรอก
                      </span>
                    )}
                  </div>

                  <h4 style={{ marginBottom: '6px', fontSize: '0.96rem', color: 'var(--text-dark)' }}>
                    ผลการเข้าเรียนและคะแนนสะสม
                  </h4>
                  <p className="mobile-scroll-hint">
                    <i className="fa-solid fa-arrows-left-right"></i> ปัดซ้าย-ขวาบนตารางเพื่อดูข้อมูลทั้งหมด
                  </p>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>วิชา / ครั้งที่</th>
                          <th>เช็คชื่อ</th>
                          <th>คะแนนสอบ (10)</th>
                          <th>ใบงาน (10)</th>
                          <th>คำแนะนำจากครู</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentResultData.records.map((r, i) => {
                          const isPassed =
                            r.quizPassed === true || r.quizPassed === 'ผ่าน' || Number(r.bestQuizScore) >= 6;
                          const assignScore = getRecordAssignmentScore(r);
                          return (
                            <tr key={getRecordTrashKey(r) + '_' + i}>
                              <td>
                                <strong>{r.lessonTitle}</strong>
                                <br />
                                <small>{r.session}</small>
                              </td>
                              <td>
                                <i className="fa-solid fa-circle-check" style={{ color: 'var(--success)' }}></i> {r.attendedAt}
                              </td>
                              <td>
                                {isPassed ? (
                                  <span className="badge badge-pass">{r.bestQuizScore}/10 (ผ่าน)</span>
                                ) : (
                                  <span className="badge badge-fail">{r.bestQuizScore}/10 (ไม่ผ่าน)</span>
                                )}
                              </td>
                              <td>
                                {assignScore !== null ? (
                                  <span className="badge badge-pass">{assignScore}/10 คะแนน</span>
                                ) : (
                                  <span className="badge badge-wait">รอครูตรวจ</span>
                                )}
                              </td>
                              <td>
                                {r.teacherFeedback ? (
                                  <small style={{ color: 'var(--pastel-purple)' }}>{r.teacherFeedback}</small>
                                ) : (
                                  <small style={{ color: 'var(--text-muted)' }}>-</small>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: '26px', paddingTop: '16px', borderTop: '2px dashed var(--border-hairline)' }}>
                    <h4 style={{ marginBottom: '10px', fontSize: '0.98rem', color: 'var(--pastel-purple)' }}>
                      <i className="fa-solid fa-graduation-cap"></i> สรุปผลคะแนนรวมรายวิชา
                    </h4>
                    <div className="std-id-warning-box" style={{ marginBottom: '12px' }}>
                      <i className="fa-solid fa-circle-info" style={{ color: 'var(--warning)' }}></i>{' '}
                      <strong>หมายเหตุ:</strong> คะแนนด้านล่างเป็นเพียงคะแนนเก็บทั้งเทอม 40 คะแนน ไม่รวมคะแนนเข้าเรียน 10 คะแนน สอบกลางภาค 10 และสอบปลายภาค 40
                    </div>
                    <p className="mobile-scroll-hint">
                      <i className="fa-solid fa-arrows-left-right"></i> ปัดซ้าย-ขวาบนตารางเพื่อดูข้อมูลทั้งหมด
                    </p>
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>รหัสวิชา / รายวิชา</th>
                            <th>คะแนนเก็บดิบ</th>
                            <th>คะแนนรวมปลายภาค (40)</th>
                            <th>ผลการประเมิน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentCourseSummaries.length === 0 ? (
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)' }}>
                                ยังไม่มีข้อมูลวิชาที่เข้าเรียน
                              </td>
                            </tr>
                          ) : (
                            studentCourseSummaries.map((c) => (
                              <tr key={c.code}>
                                <td>
                                  <strong>{c.code}</strong>
                                  <br />
                                  <small style={{ color: 'var(--text-muted)' }}>{c.title}</small>
                                </td>
                                <td>{c.rawScoreText}</td>
                                <td>
                                  <strong style={{ color: 'var(--pastel-purple)', fontSize: '1rem' }}>{c.finalScore40}</strong> / 40
                                </td>
                                <td>
                                  {c.passed ? (
                                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                                      <i className="fa-solid fa-circle-check"></i> ผ่าน
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                                      <i className="fa-solid fa-circle-xmark"></i> ไม่ผ่าน
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 10. TEACHER LOGIN */}
            {view === 'view-teacher-login' && (
              <div className="view-panel">
                <span className="back-btn" onClick={() => navigate('view-home')}>
                  <i className="fa-solid fa-arrow-left"></i> กลับหน้าแรก
                </span>
                <div className="card" style={{ textAlign: 'center', maxWidth: '460px', margin: '0 auto' }}>
                  <div
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '16px',
                      background: 'var(--pastel-purple-light)',
                      color: 'var(--pastel-purple)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                      fontSize: '1.5rem',
                    }}
                  >
                    <i className="fa-solid fa-shield-halved"></i>
                  </div>
                  <h2 style={{ fontSize: '1.2rem', marginBottom: '6px' }}>ระบบจัดการศูนย์การเรียน (คุณครู)</h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    ระบุรหัสผ่านประจำตัวเพื่อเข้าใช้งาน
                  </p>
                  <div className="input-group">
                    <label>รหัสผ่านคุณครู</label>
                    <input
                      type="password"
                      value={teacherPwd}
                      onChange={(e) => setTeacherPwd(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') loginTeacher();
                      }}
                      placeholder="กรอกรหัสผ่านประจำตัวครู"
                    />
                  </div>
                  <button type="button" className="btn" onClick={loginTeacher}>
                    เข้าสู่ระบบจัดการ
                  </button>
                </div>
              </div>
            )}

            {/* 11. TEACHER DASHBOARD */}
            {view === 'view-teacher-dashboard' && (
              <div className="view-panel">
                <span className="back-btn" onClick={() => navigate('view-home')}>
                  <i className="fa-solid fa-arrow-left"></i> ออกจากระบบครู
                </span>
                <div className="card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                      marginBottom: '10px',
                    }}
                  >
                    <h2 style={{ color: 'var(--pastel-purple)', fontSize: '1.22rem' }}>
                      <i className="fa-solid fa-gauge"></i> แผงควบคุมระบบคลาวด์
                    </h2>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: 'var(--warning)', color: 'white' }}
                        onClick={() => setUngradedOpen(true)}
                      >
                        <i className="fa-solid fa-clipboard-list"></i> งานรอตรวจ ({ungradedCount})
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setCmsModalOpen(true)}>
                        <i className="fa-solid fa-sliders"></i> จัดการบทเรียน / หลังบ้าน
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        style={{ borderColor: '#F5CBD6', color: '#9F1239' }}
                        onClick={() => setTrashModalOpen(true)}
                      >
                        <i className="fa-solid fa-trash-can"></i> ถังขยะ ({trashItems.length})
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: 'var(--success)' }}
                        onClick={openAttendanceModal}
                      >
                        <i className="fa-solid fa-user-check"></i> กรอกคะแนนเข้าเรียน
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => openInClassModal(false)}
                      >
                        <i className="fa-solid fa-chalkboard-user"></i> คะแนนในชั้นเรียน
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => syncFromCloud(true)}>
                        <i className="fa-solid fa-arrows-rotate"></i> ซิงค์ข้อมูลล่าสุด
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: maintenance.enabled ? 'var(--success)' : 'var(--danger)' }}
                        onClick={() => {
                          if (maintenance.enabled) {
                            if (FORCE_MAINTENANCE_MODE) {
                              showNotice('ตอนนี้ในโค้ดตั้งค่า FORCE_MAINTENANCE_MODE = true ไว้ กรุณาแก้เป็น false ด้วยนะครับ');
                              return;
                            }
                            setConfirmDialog({
                              title: 'เปิดเว็บไซต์ให้นักศึกษาเข้าใช้งาน',
                              message: 'ต้องการ "เปิดเว็บไซต์ให้นักศึกษาเข้าใช้งานตามปกติ" ใช่หรือไม่?',
                              confirmLabel: 'เปิดใช้งานปกติ',
                              onConfirm: async () => {
                                sessionStorage.removeItem('clc_teacher_bypass');
                                setTeacherBypass(false);
                                await setCloudMaintenance(false);
                                showNotice('เปิดเว็บไซต์ให้นักศึกษาเข้าใช้งานตามปกติแล้ว');
                              },
                            });
                          } else {
                            setMaintPromptOpen(true);
                          }
                        }}
                      >
                        {maintenance.enabled ? (
                          <>
                            <i className="fa-solid fa-circle-check"></i> เปิดใช้งานเว็บตามปกติ
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-screwdriver-wrench"></i> ปิดปรับปรุงเว็บ
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                    เช็คชื่อ ตรวจใบงาน ลบตัวเทสลงถังขยะ และจัดการเนื้อหา/ข้อสอบ/การล็อคครั้งเรียนได้จากหน้านี้ทั้งหมด
                  </p>

                  <div className="teacher-metrics-grid">
                    <div className="teacher-metric-box">
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>รายการส่งงานทั้งหมด (ไม่รวมถังขยะ)</p>
                      <p className="font-mono-num" style={{ fontSize: '1.55rem', fontWeight: 700, color: 'var(--text-dark)', marginTop: '4px' }}>
                        {validRecords.length}
                      </p>
                    </div>
                    <div className="teacher-metric-box pink">
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>ใบงานที่รอครูตรวจ</p>
                      <p className="font-mono-num" style={{ fontSize: '1.55rem', fontWeight: 700, color: '#B45309', marginTop: '4px' }}>
                        {ungradedCount}
                      </p>
                    </div>
                    <div className="teacher-metric-box purple">
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>สถานะเว็บไซต์</p>
                      <p
                        style={{
                          fontSize: '0.98rem',
                          fontWeight: 600,
                          color: maintenance.enabled ? '#BE123C' : 'var(--success)',
                          marginTop: '6px',
                        }}
                      >
                        {maintenance.enabled ? (
                          <>
                            <i className="fa-solid fa-lock"></i> ปิดปรับปรุง (ล็อคหน้าแรก)
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-circle-check"></i> เปิดใช้งานปกติ
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="teacher-filter-grid">
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        ระดับชั้น:
                      </label>
                      <select
                        value={filterLevel}
                        onChange={(e) => {
                          setFilterLevel(e.target.value);
                          setFilterSession('all');
                        }}
                      >
                        <option value="all">-- ทุกระดับชั้น --</option>
                        <option value="m-ton">มัธยมศึกษาตอนต้น</option>
                        <option value="m-ปลาย">มัธยมศึกษาตอนปลาย</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        รายวิชาและครั้งที่:
                      </label>
                      <select value={filterSession} onChange={(e) => setFilterSession(e.target.value)}>
                        <option value="all">-- ทุกรายวิชา/ครั้งที่ --</option>
                        {teacherFilterSessions.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.code} - {l.session}: {l.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        สถานะการตรวจ:
                      </label>
                      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                        <option value="all">-- ทั้งหมด --</option>
                        <option value="ungraded">⏳ รอตรวจ (ยังไม่ได้ตรวจ)</option>
                        <option value="graded">✅ ตรวจแล้ว</option>
                        <option value="not_submitted">📝 ยังไม่ส่งงาน</option>
                        <option value="invalid_id">⚠️ รหัสเก่า / ผิดรูปแบบ ({invalidIdCount})</option>
                      </select>
                    </div>
                  </div>

                  {invalidIdCount > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        background: '#FFF7ED',
                        border: '1px solid #FDBA74',
                        color: '#9A3412',
                        fontSize: '0.82rem',
                        marginBottom: '12px',
                      }}
                    >
                      <span>
                        <i className="fa-solid fa-triangle-exclamation"></i>{' '}
                        พบข้อมูลนักศึกษารหัสเก่า/ผิดรูปแบบ (ยังไม่ตรง 6xxxxxxxxx) จำนวน <strong>{invalidIdCount}</strong> รายการ — ครูสามารถกดปุ่ม <strong>&ldquo;แก้รหัส&rdquo;</strong> เพื่อย้ายคะแนนและใบงานเดิมทั้งหมดไปรหัสใหม่ได้โดยข้อมูลไม่หาย
                      </span>
                      <button
                        type="button"
                        className="btn btn-xs"
                        style={{ background: filterStatus === 'invalid_id' ? 'var(--pastel-purple)' : '#EA580C' }}
                        onClick={() => setFilterStatus(filterStatus === 'invalid_id' ? 'all' : 'invalid_id')}
                      >
                        {filterStatus === 'invalid_id' ? 'แสดงทั้งหมด' : `กรองดูเฉพาะรหัสเก่า (${invalidIdCount})`}
                      </button>
                    </div>
                  )}

                  {/* Search & Bulk Trash bar */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <input
                      type="text"
                      value={teacherSearch}
                      onChange={(e) => setTeacherSearch(e.target.value)}
                      placeholder="ค้นหารหัส / ชื่อนักศึกษา (เช่น 12345, ตัวเทส, รหัสผิด)..."
                      style={{
                        flex: '1 1 260px',
                        padding: '9px 12px',
                        borderRadius: '11px',
                        border: '1px solid var(--border-soft)',
                        fontSize: '0.86rem',
                        background: 'white',
                      }}
                    />
                    {selectedTrashKeys.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: 'var(--danger)' }}
                        onClick={() => {
                          const targets = filteredTeacherRecords.filter((r) =>
                            selectedTrashKeys.includes(getRecordTrashKey(r))
                          );
                          setConfirmDialog({
                            title: 'ย้ายรายการที่เลือกไปถังขยะ',
                            message: `ต้องการย้ายข้อมูลที่เลือกจำนวน ${targets.length} รายการลงในถังขยะใช่หรือไม่? (ยังสามารถกู้คืนได้จากปุ่ม "ถังขยะ")`,
                            confirmLabel: `ย้าย ${targets.length} รายการลงถังขยะ`,
                            danger: true,
                            onConfirm: () => moveRecordsToTrash(targets),
                          });
                        }}
                      >
                        <i className="fa-solid fa-trash-can"></i> ย้ายที่เลือกไปถังขยะ ({selectedTrashKeys.length})
                      </button>
                    )}
                  </div>

                  <p className="mobile-scroll-hint">
                    <i className="fa-solid fa-arrows-left-right"></i> ปัดซ้าย-ขวาบนตารางเพื่อดูข้อมูลทั้งหมด
                  </p>
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '34px' }}>
                            <input
                              type="checkbox"
                              checked={
                                filteredTeacherRecords.length > 0 &&
                                filteredTeacherRecords.every((r) => selectedTrashKeys.includes(getRecordTrashKey(r)))
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTrashKeys(filteredTeacherRecords.map((r) => getRecordTrashKey(r)));
                                } else {
                                  setSelectedTrashKeys([]);
                                }
                              }}
                            />
                          </th>
                          <th>รหัส / ผู้เรียน</th>
                          <th>วิชา / ครั้งที่</th>
                          <th>เช็คชื่อเมื่อ</th>
                          <th>สอบ (10)</th>
                          <th>ใบงาน (10)</th>
                          <th>รวม (20)</th>
                          <th>การตรวจงาน</th>
                          <th>จัดการข้อมูล</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTeacherRecords.length === 0 ? (
                          <tr>
                            <td colSpan={9} style={{ textAlign: 'center', padding: '15px', color: 'var(--text-muted)' }}>
                              ไม่พบรายการตามเงื่อนไขที่เลือก
                            </td>
                          </tr>
                        ) : (
                          filteredTeacherRecords.map((r, idx) => {
                            const key = getRecordTrashKey(r);
                            const stdId = r.stdId || r.stdid || '-';
                            const stdName = r.stdName || r.stdname || 'ไม่ระบุชื่อ';
                            const bestQuizScore =
                              r.bestQuizScore !== undefined && String(r.bestQuizScore) !== '' ? r.bestQuizScore : 0;
                            const assignScore = getRecordAssignmentScore(r);
                            const total = Number(bestQuizScore) + (assignScore !== null ? assignScore : 0);
                            const hasAnswers = hasStudentSubmittedAssignment(r);
                            const invalidIdFlag = !validateStudentId(String(stdId)).valid;

                            return (
                              <tr key={key + '_' + idx}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={selectedTrashKeys.includes(key)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedTrashKeys((prev) => Array.from(new Set([...prev, key])));
                                      } else {
                                        setSelectedTrashKeys((prev) => prev.filter((k) => k !== key));
                                      }
                                    }}
                                  />
                                </td>
                                <td>
                                  <strong>{stdId}</strong>{' '}
                                  {invalidIdFlag && (
                                    <span
                                      className="badge badge-fail"
                                      style={{ fontSize: '0.66rem', padding: '1px 6px' }}
                                      title="รหัสไม่ตรงรูปแบบ 6xxxxxxxxx (10 หลัก)"
                                    >
                                      รหัสเก่า/ผิดรูป
                                    </span>
                                  )}
                                  <br />
                                  <small>{stdName}</small>
                                </td>
                                <td>
                                  <span
                                    className="badge"
                                    style={{ background: 'var(--pastel-purple-light)', color: 'var(--pastel-purple)' }}
                                  >
                                    {r.session || '-'}
                                  </span>
                                  <br />
                                  <small>{r.lessonTitle || r.lessontitle || '-'}</small>
                                </td>
                                <td>
                                  <small>{r.attendedAt || r.attendedat || '-'}</small>
                                </td>
                                <td>
                                  <strong>{bestQuizScore}</strong>/10
                                </td>
                                <td>{assignScore !== null ? <><strong>{assignScore}</strong>/10</> : '-'}</td>
                                <td>
                                  <strong style={{ color: 'var(--pastel-purple)' }}>{total}</strong>/20
                                </td>
                                <td>
                                  {!hasAnswers && assignScore === null ? (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>ยังไม่ส่งงาน</span>
                                  ) : assignScore === null ? (
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      style={{ background: 'var(--warning)', color: 'white' }}
                                      onClick={() => openGradingModal(r)}
                                    >
                                      <i className="fa-solid fa-pen"></i> รอตรวจ
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-sm"
                                      style={{ background: 'var(--pastel-purple)' }}
                                      onClick={() => openGradingModal(r)}
                                    >
                                      <i className="fa-solid fa-check"></i> ตรวจแล้ว ({assignScore})
                                    </button>
                                  )}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button
                                      type="button"
                                      className="btn btn-xs"
                                      style={{ background: invalidIdFlag ? '#EA580C' : 'var(--pastel-purple)' }}
                                      title="แก้ไขรหัสนักศึกษา/ชื่อ และย้ายคะแนน+ใบงานเดิมทั้งหมดโดยข้อมูลไม่หาย"
                                      onClick={() => openEditStudentModal(r)}
                                    >
                                      <i className="fa-solid fa-user-pen"></i> แก้รหัส
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-xs"
                                      style={{ background: 'var(--danger)' }}
                                      title="ย้ายข้อมูลนี้ลงถังขยะ (กู้คืนได้)"
                                      onClick={() =>
                                        setConfirmDialog({
                                          title: 'ย้ายข้อมูลไปถังขยะ',
                                          message: `ต้องการลบข้อมูลของ "${stdName} (${stdId})" ใน "${r.session}" ใช่หรือไม่?\n(ข้อมูลจะถูกย้ายไปที่ถังขยะและสามารถกู้คืนได้)`,
                                          confirmLabel: 'ย้ายลงถังขยะ',
                                          danger: true,
                                          onConfirm: () => moveRecordsToTrash([r]),
                                        })
                                      }
                                    >
                                      <i className="fa-solid fa-trash-can"></i> ลบ
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer>ศูนย์การเรียนชุมชน · ปีการศึกษา 2569 ภาคเรียนที่ 2</footer>

          {/* MODAL: GRADING */}
          {gradingRecord && (
            <div
              className="modal active"
              onClick={(e) => {
                if (e.target === e.currentTarget) setGradingRecord(null);
              }}
            >
              <div className="modal-content">
                <h3 style={{ color: 'var(--pastel-purple)', marginBottom: '8px' }}>
                  <i className="fa-solid fa-pen-to-square"></i> ตรวจและให้คะแนนใบงาน
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  ผู้เรียน: {gradingRecord.stdName} ({gradingRecord.stdId}) - {gradingRecord.lessonTitle} {gradingRecord.session}
                </p>

                <div style={{ marginBottom: '12px' }}>
                  {(() => {
                    let lesson: Lesson | undefined;
                    for (const lvl of ['m-ton', 'm-ปลาย'] as CourseLevel[]) {
                      const hit = (courses[lvl] || []).find((l) => l.id === gradingRecord.lessonId);
                      if (hit) {
                        lesson = hit;
                        break;
                      }
                    }
                    const tasks = lesson ? lesson.assignmentTasks || [] : [];
                    let ansObj: unknown = gradingRecord.assignmentAnswers || gradingRecord.assignmentanswers || {};
                    if (typeof ansObj === 'string' && ansObj.startsWith('{')) {
                      try {
                        ansObj = JSON.parse(ansObj);
                      } catch {
                        // ignore
                      }
                    }
                    if (tasks.length === 0) {
                      return <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>(ไม่มีคำตอบในใบงาน)</p>;
                    }
                    return tasks.map((taskText, idx) => {
                      const ans =
                        typeof ansObj === 'object' && ansObj !== null
                          ? String((ansObj as Record<string, unknown>)[idx] ?? '(ยังไม่ได้ตอบข้อนี้)')
                          : String(ansObj || '(ยังไม่ได้ตอบข้อนี้)');
                      return (
                        <div
                          key={idx}
                          style={{
                            background: '#FFF8F2',
                            border: '1px solid var(--border-hairline)',
                            borderRadius: '10px',
                            padding: '10px',
                            marginBottom: '8px',
                            fontSize: '0.88rem',
                          }}
                        >
                          <strong style={{ color: 'var(--pastel-purple)' }}>
                            <i className="fa-solid fa-angle-right"></i> {taskText}
                          </strong>
                          <p
                            style={{
                              marginTop: '5px',
                              color: 'var(--text-dark)',
                              whiteSpace: 'pre-wrap',
                              background: '#fff',
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-hairline)',
                            }}
                          >
                            {ans}
                          </p>
                        </div>
                      );
                    });
                  })()}
                </div>

                <div className="input-group">
                  <label>คะแนนใบงาน (เต็ม 10 คะแนน)</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={gradeScoreInput}
                    onChange={(e) => setGradeScoreInput(e.target.value)}
                    placeholder="0 - 10"
                  />
                </div>
                <div className="input-group">
                  <label>คำแนะนำ / ข้อเสนอแนะของคุณครู</label>
                  <textarea
                    rows={3}
                    value={gradeFeedbackInput}
                    onChange={(e) => setGradeFeedbackInput(e.target.value)}
                    placeholder="เขียนคำแนะนำ..."
                  />
                </div>
                <div className="modal-actions-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setGradingRecord(null)}>
                    ยกเลิก
                  </button>
                  <button type="button" className="btn" disabled={gradeBusy} onClick={saveAssignmentGrade}>
                    {gradeBusy ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกลงชีต...
                      </>
                    ) : (
                      'บันทึกผลการตรวจ'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL: UNGRADED LIST */}
          {ungradedOpen && (
            <div
              className="modal active"
              onClick={(e) => {
                if (e.target === e.currentTarget) setUngradedOpen(false);
              }}
            >
              <div className="modal-content" style={{ maxWidth: '640px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <h3 style={{ color: 'var(--pastel-purple)' }}>
                    <i className="fa-solid fa-clipboard-question"></i> งานที่ยังไม่ได้ตรวจ
                  </h3>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => syncFromCloud(false)}>
                    <i className="fa-solid fa-arrows-rotate"></i> รีเฟรช
                  </button>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  แสดงเฉพาะนักศึกษาที่ส่งคำตอบใบงานแล้ว และรอคุณครูให้คะแนน
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <select
                    value={ungradedLevel}
                    onChange={(e) => setUngradedLevel(e.target.value)}
                    style={{
                      padding: '9px 10px',
                      border: '1px solid var(--border-soft)',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      background: 'white',
                    }}
                  >
                    <option value="all">-- ทุกระดับชั้น --</option>
                    <option value="m-ton">มัธยมศึกษาตอนต้น</option>
                    <option value="m-ปลาย">มัธยมศึกษาตอนปลาย</option>
                  </select>
                  <select
                    value={ungradedCourse}
                    onChange={(e) => setUngradedCourse(e.target.value)}
                    style={{
                      padding: '9px 10px',
                      border: '1px solid var(--border-soft)',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      background: 'white',
                    }}
                  >
                    <option value="all">-- ทุกรายวิชา --</option>
                    {allUniqueCourseCodes.map(([code, title]) => (
                      <option key={code} value={code}>
                        {code} - {title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>รหัส / ผู้เรียน</th>
                        <th>วิชา / ครั้งที่</th>
                        <th>ส่งเมื่อ</th>
                        <th>จัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ungradedList.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '18px', color: 'var(--success)', fontWeight: 500 }}>
                            <i className="fa-solid fa-circle-check"></i> เยี่ยมมาก! ไม่มีงานค้างตรวจแล้ว
                          </td>
                        </tr>
                      ) : (
                        ungradedList.map((r, i) => (
                          <tr key={getRecordTrashKey(r) + '_' + i}>
                            <td>
                              <strong>{r.stdId || '-'}</strong>
                              <br />
                              <small>{r.stdName || 'ไม่ระบุชื่อ'}</small>
                            </td>
                            <td>
                              <span
                                className="badge"
                                style={{ background: 'var(--pastel-purple-light)', color: 'var(--pastel-purple)' }}
                              >
                                {r.session || '-'}
                              </span>
                              <br />
                              <small>{r.lessonTitle || '-'}</small>
                            </td>
                            <td>
                              <small>{r.attendedAt || '-'}</small>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-sm"
                                style={{ background: 'var(--warning)', color: 'white' }}
                                onClick={() => openGradingModal(r)}
                              >
                                <i className="fa-solid fa-pen"></i> ตรวจงานนี้
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: '14px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setUngradedOpen(false)}>
                    ปิดหน้าต่าง
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL: TERM ATTENDANCE (ค้นหาด้วยรหัสทันที) */}
          {attModalOpen && (
            <div
              className="modal active"
              onClick={(e) => {
                if (e.target === e.currentTarget) setAttModalOpen(false);
              }}
            >
              <div className="modal-content">
                <h3 style={{ color: 'var(--pastel-purple)', marginBottom: '8px' }}>
                  <i className="fa-solid fa-user-check"></i> กรอกคะแนนเข้าเรียนรวมทั้งเทอม
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  พิมพ์รหัสนักศึกษาหรือชื่อเพื่อค้นหาและดึงข้อมูลทันที (ไม่ต้องเลื่อนหาในแถบรายการ)
                </p>

                <StudentQuickLookup
                  students={uniqueStudentsList}
                  getExtraBadge={(sid) => {
                    const norm = normalizeStdId(sid);
                    const sc = getTermAttendanceScore(
                      sid,
                      records.filter((r) => normalizeStdId(r.stdId || r.stdid) === norm)
                    );
                    return sc !== null ? `เดิม: ${sc} คะแนน` : null;
                  }}
                  onSelectStudent={(u) => {
                    const cleanId = sanitizeStudentIdInput(u.stdId);
                    setAttStdId(cleanId);
                    setAttStdName(u.stdName);
                    const norm = normalizeStdId(u.stdId);
                    const existingScore = getTermAttendanceScore(
                      u.stdId,
                      records.filter((r) => normalizeStdId(r.stdId || r.stdid) === norm)
                    );
                    setAttScore(existingScore !== null ? String(existingScore) : '');
                    setTimeout(() => attScoreInputRef.current?.focus(), 50);
                  }}
                  onUseNewId={(newId) => {
                    setAttStdId(sanitizeStudentIdInput(newId));
                    setAttStdName('');
                    setAttScore('');
                  }}
                />

                <div className="input-group">
                  <label>รหัสนักศึกษา (พิมพ์ครบ 10 หลักเพื่อดึงชื่ออัตโนมัติได้ทันที)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={attStdId}
                    onChange={(e) => {
                      const cleanVal = sanitizeStudentIdInput(e.target.value);
                      setAttStdId(cleanVal);
                      if (cleanVal.length === 10) {
                        const norm = normalizeStdId(cleanVal);
                        const hit = uniqueStudentsList.find((u) => normalizeStdId(u.stdId) === norm);
                        if (hit) {
                          setAttStdName(hit.stdName);
                          const sc = getTermAttendanceScore(
                            hit.stdId,
                            records.filter((r) => normalizeStdId(r.stdId || r.stdid) === norm)
                          );
                          setAttScore(sc !== null ? String(sc) : '');
                          setTimeout(() => attScoreInputRef.current?.focus(), 50);
                        }
                      }
                    }}
                    placeholder="เช่น 6912345678"
                  />
                  {renderStdIdValidationHint(attStdId)}
                </div>
                <div className="input-group">
                  <label>ชื่อ - นามสกุล นักศึกษา</label>
                  <input
                    type="text"
                    value={attStdName}
                    onChange={(e) => setAttStdName(e.target.value)}
                    placeholder="ชื่อ นามสกุล จริง"
                  />
                </div>
                <div className="input-group">
                  <label>คะแนนเข้าเรียนรวมทั้งเทอม</label>
                  <input
                    ref={attScoreInputRef}
                    type="number"
                    min={0}
                    step={0.5}
                    value={attScore}
                    onChange={(e) => setAttScore(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !attBusy) saveAttendanceScore();
                    }}
                    placeholder="กรอกคะแนนเข้าเรียนรวมทั้งเทอม"
                  />
                </div>

                <div className="modal-actions-row" style={{ marginBottom: '15px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setAttModalOpen(false)}>
                    ปิด
                  </button>
                  <button type="button" className="btn" disabled={attBusy} onClick={saveAttendanceScore}>
                    {attBusy ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกลงชีต...
                      </>
                    ) : (
                      'บันทึกคะแนนเข้าเรียน'
                    )}
                  </button>
                </div>

                <div style={{ borderTop: '1px dashed var(--border-hairline)', paddingTop: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                      marginBottom: '8px',
                    }}
                  >
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--pastel-purple)', margin: 0 }}>
                      รายการคะแนนเข้าเรียนที่บันทึกไว้ ({attSavedEntries.length})
                    </h4>
                    <input
                      type="text"
                      value={attListSearch}
                      onChange={(e) => setAttListSearch(e.target.value)}
                      placeholder="ค้นหารหัส/ชื่อในรายการ..."
                      style={{
                        padding: '6px 10px',
                        borderRadius: '9px',
                        border: '1px solid var(--border-soft)',
                        fontSize: '0.82rem',
                        width: '210px',
                        background: 'white',
                      }}
                    />
                  </div>
                  <div className="table-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>รหัส / ชื่อนักศึกษา</th>
                          <th>คะแนนเข้าเรียนทั้งเทอม</th>
                          <th>แก้ไข</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const q = attListSearch.trim().toLowerCase();
                          const shown = q
                            ? attSavedEntries.filter(
                                (item) =>
                                  item.stdId.toLowerCase().includes(q) ||
                                  (item.stdName || '').toLowerCase().includes(q)
                              )
                            : attSavedEntries;
                          if (shown.length === 0) {
                            return (
                              <tr>
                                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                  {q ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีรายการคะแนนเข้าเรียนที่บันทึกไว้'}
                                </td>
                              </tr>
                            );
                          }
                          return shown.map((item) => (
                            <tr key={item.stdId}>
                              <td>
                                <strong>{item.stdId}</strong>
                                <br />
                                <small>{item.stdName || '-'}</small>
                              </td>
                              <td>
                                <span className="badge badge-pass">{item.score} คะแนน</span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  style={{ background: 'var(--pastel-purple)' }}
                                  onClick={() => {
                                    setAttStdId(sanitizeStudentIdInput(item.stdId));
                                    setAttStdName(item.stdName || '');
                                    setAttScore(String(item.score));
                                    setTimeout(() => attScoreInputRef.current?.focus(), 50);
                                  }}
                                >
                                  <i className="fa-solid fa-pen"></i>
                                </button>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODAL: IN-CLASS SCORING (ค้นหาด้วยรหัสทันที) */}
          {inClassOpen && (
            <div
              className="modal active"
              onClick={(e) => {
                if (e.target === e.currentTarget) setInClassOpen(false);
              }}
            >
              <div className="modal-content">
                <h3 style={{ color: 'var(--pastel-purple)', marginBottom: '6px' }}>
                  <i className="fa-solid fa-chalkboard-user"></i> สำหรับเรียนในชั้นเรียน
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  บันทึกคะแนนสำหรับนักศึกษาที่เข้าเรียนในชั้นเรียนกับครู (นำไปคำนวณเหมือนใบงานและแบบทดสอบ)
                </p>

                {!inClassAuthed ? (
                  <div>
                    <div className="input-group">
                      <label>กรอกรหัสผ่านคุณครูเพื่อเปิดช่องกรอกคะแนน</label>
                      <input
                        type="password"
                        value={inClassPwd}
                        onChange={(e) => setInClassPwd(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') verifyInClassPwd();
                        }}
                        placeholder="กรอกรหัสผ่านคุณครู"
                      />
                    </div>
                    <div className="modal-actions-row">
                      <button type="button" className="btn btn-secondary" onClick={() => setInClassOpen(false)}>
                        ยกเลิก
                      </button>
                      <button type="button" className="btn" onClick={verifyInClassPwd}>
                        <i className="fa-solid fa-unlock"></i> ยืนยันรหัสผ่าน
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {inClassStatusMsg && (
                      <div
                        style={{
                          background: 'var(--success-bg)',
                          color: '#065F46',
                          border: '1px solid #A7F3D0',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          fontSize: '0.85rem',
                          marginBottom: '12px',
                        }}
                      >
                        <i className="fa-solid fa-circle-check"></i> {inClassStatusMsg}
                      </div>
                    )}

                    <div className="input-group">
                      <label>รายวิชา และครั้งที่เรียน</label>
                      <select value={inClassLessonId} onChange={(e) => setInClassLessonId(e.target.value)}>
                        {(['m-ton', 'm-ปลาย'] as CourseLevel[]).map((lvl) => (
                          <optgroup key={lvl} label={lvl === 'm-ton' ? 'ระดับ ม.ต้น' : 'ระดับ ม.ปลาย'}>
                            {(courses[lvl] || []).map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.code} {l.title} - {l.session}
                                {l.isLocked ? ' (ล็อคออนไลน์)' : ''}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <StudentQuickLookup
                      students={uniqueStudentsList}
                      getExtraBadge={(sid) => {
                        const norm = normalizeStdId(sid);
                        const existing = records.find(
                          (r) =>
                            normalizeStdId(r.stdId || r.stdid) === norm &&
                            String(r.lessonId || r.lessonid || '').trim() === inClassLessonId
                        );
                        if (!existing) return null;
                        const qSc = Number(existing.bestQuizScore) || 0;
                        const aSc = getRecordAssignmentScore(existing) ?? 0;
                        return `ในคาบนี้: ${qSc + aSc}/20`;
                      }}
                      onSelectStudent={(u) => {
                        setInClassStdId(sanitizeStudentIdInput(u.stdId));
                        setInClassStdName(u.stdName);
                        const norm = normalizeStdId(u.stdId);
                        const existing = records.find(
                          (r) =>
                            normalizeStdId(r.stdId || r.stdid) === norm &&
                            String(r.lessonId || r.lessonid || '').trim() === inClassLessonId
                        );
                        if (existing) {
                          const qSc = Number(existing.bestQuizScore) || 0;
                          const aSc = getRecordAssignmentScore(existing);
                          if (aSc !== null) {
                            setInClassScore(String(qSc + aSc));
                          } else {
                            setInClassScore('');
                          }
                        } else {
                          setInClassScore('');
                        }
                        setTimeout(() => inClassScoreInputRef.current?.focus(), 50);
                      }}
                      onUseNewId={(newId) => {
                        setInClassStdId(sanitizeStudentIdInput(newId));
                        setInClassStdName('');
                        setInClassScore('');
                      }}
                    />

                    <div className="input-group">
                      <label>รหัสนักศึกษา (พิมพ์ครบ 10 หลักเพื่อดึงชื่ออัตโนมัติได้ทันที)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={10}
                        value={inClassStdId}
                        onChange={(e) => {
                          const cleanVal = sanitizeStudentIdInput(e.target.value);
                          setInClassStdId(cleanVal);
                          if (cleanVal.length === 10) {
                            const norm = normalizeStdId(cleanVal);
                            const hit = uniqueStudentsList.find((u) => normalizeStdId(u.stdId) === norm);
                            if (hit) {
                              setInClassStdName(hit.stdName);
                              const existing = records.find(
                                (r) =>
                                  normalizeStdId(r.stdId || r.stdid) === norm &&
                                  String(r.lessonId || r.lessonid || '').trim() === inClassLessonId
                              );
                              if (existing) {
                                const qSc = Number(existing.bestQuizScore) || 0;
                                const aSc = getRecordAssignmentScore(existing);
                                if (aSc !== null) setInClassScore(String(qSc + aSc));
                              }
                              setTimeout(() => inClassScoreInputRef.current?.focus(), 50);
                            }
                          }
                        }}
                        placeholder="เช่น 6912345678"
                      />
                      {renderStdIdValidationHint(inClassStdId)}
                    </div>

                    <div className="input-group">
                      <label>ชื่อ - นามสกุล นักศึกษา</label>
                      <input
                        type="text"
                        value={inClassStdName}
                        onChange={(e) => setInClassStdName(e.target.value)}
                        placeholder="ชื่อ นามสกุล จริง"
                      />
                    </div>

                    <div className="input-group">
                      <label>คะแนนในชั้นเรียน (เต็ม 20 คะแนน)</label>
                      <input
                        ref={inClassScoreInputRef}
                        type="number"
                        min={0}
                        max={20}
                        step={0.5}
                        value={inClassScore}
                        onChange={(e) => setInClassScore(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !inClassBusy) saveInClassScore();
                        }}
                        placeholder="กรอกคะแนน 0 - 20"
                      />
                      <small style={{ display: 'block', marginTop: '5px', color: 'var(--pastel-purple)', fontSize: '0.8rem' }}>
                        {inClassScore === '' ||
                        isNaN(Number(inClassScore)) ||
                        Number(inClassScore) < 0 ||
                        Number(inClassScore) > 20
                          ? 'ระบบจะแบ่งคะแนนเทียบเท่าแบบทดสอบ (10) + ใบงาน (10) เพื่อนำไปคำนวณรวมปลายภาคอัตโนมัติ'
                          : (() => {
                              const total = Number(inClassScore);
                              const quizPart = Number((total / 2).toFixed(2));
                              const assignPart = Number((total - quizPart).toFixed(2));
                              return `ระบบจะบันทึกเทียบเท่า: แบบทดสอบ ${quizPart}/10 + ใบงาน ${assignPart}/10 = รวม ${total}/20 คะแนน`;
                            })()}
                      </small>
                    </div>

                    <div className="input-group">
                      <label>หมายเหตุ / คำแนะนำเพิ่มเติม (ไม่บังคับ)</label>
                      <input
                        type="text"
                        value={inClassNote}
                        onChange={(e) => setInClassNote(e.target.value)}
                        placeholder="เช่น ตั้งใจเรียนดีมาก (ค่าเริ่มต้น: เรียนในชั้นเรียน)"
                      />
                    </div>

                    <div className="modal-actions-row">
                      <button type="button" className="btn btn-secondary" onClick={() => setInClassOpen(false)}>
                        ปิดหน้าต่าง
                      </button>
                      <button type="button" className="btn" disabled={inClassBusy} onClick={saveInClassScore}>
                        {inClassBusy ? (
                          <>
                            <i className="fa-solid fa-spinner fa-spin"></i> กำลังบันทึกลงชีต...
                          </>
                        ) : (
                          <>
                            <i className="fa-solid fa-cloud-arrow-up"></i> บันทึกคะแนนในชั้นเรียนลงชีต
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MODAL: TRASH (กู้คืน / ลบถาวร) */}
          <TrashModal
            isOpen={trashModalOpen}
            onClose={() => setTrashModalOpen(false)}
            trashItems={trashItems}
            hasV2SheetTrash={hasV2SheetTrash}
            onRestore={restoreFromTrash}
            onPermanentDelete={permanentDeleteFromTrash}
            onRefresh={async () => {
              await syncFromCloud(true);
            }}
          />

          {/* MODAL: TEACHER CMS (แก้ล็อค, เนื้อหา, ข้อสอบรูปแบบเดิม, ข่าวสาร) */}
          <TeacherCmsModal
            isOpen={cmsModalOpen}
            onClose={() => setCmsModalOpen(false)}
            courses={courses}
            cmsSettings={cmsSettings}
            onSaveLesson={handleCmsSaveLesson}
            onDeleteLesson={handleCmsDeleteLesson}
            onSaveCmsSettings={handleCmsSaveSettings}
          />

          {/* MODAL: EDIT / MIGRATE STUDENT ID (แก้รหัสเก่า/ผิด โดยข้อมูลและใบงานไม่หาย) */}
          {editStdRecord && (
            <div
              className="modal active"
              onClick={(e) => {
                if (e.target === e.currentTarget && !editStdBusy) setEditStdRecord(null);
              }}
            >
              <div className="modal-content" style={{ maxWidth: '520px' }}>
                <h3 style={{ color: 'var(--pastel-purple)', marginBottom: '6px' }}>
                  <i className="fa-solid fa-user-pen"></i> แก้ไขรหัสนักศึกษา / ย้ายข้อมูล (ไม่เสียใบงาน)
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.55 }}>
                  คะแนนสอบ ใบงานที่ส่งแล้ว ผลการตรวจ และคะแนนเข้าเรียนทั้งหมดจะถูกย้ายไปรหัสใหม่ให้ครบถ้วนโดยไม่สูญหาย (และหากรหัสใหม่เคยส่งครั้งอื่นไว้แล้ว ระบบจะรวมคะแนนให้อัตโนมัติ)
                </p>

                <div
                  style={{
                    background: 'var(--pastel-purple-light)',
                    border: '1px solid var(--border-soft)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    marginBottom: '14px',
                    fontSize: '0.84rem',
                  }}
                >
                  <div>
                    รหัสเดิม: <strong style={{ color: 'var(--danger)' }}>{editStdRecord.stdId || '-'}</strong> | ชื่อเดิม:{' '}
                    <strong>{editStdRecord.stdName || '-'}</strong>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginTop: '3px' }}>
                    รายการที่เลือก: {editStdRecord.session} ({editStdRecord.lessonTitle})
                  </div>
                </div>

                <div className="input-group">
                  <label>รหัสนักศึกษาใหม่ (ต้องขึ้นต้นด้วย 6 และครบ 10 หลัก)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={editStdIdInput}
                    onChange={(e) => setEditStdIdInput(sanitizeStudentIdInput(e.target.value))}
                    placeholder="เช่น 6812000123"
                  />
                  {renderStdIdValidationHint(editStdIdInput)}
                </div>

                <div className="input-group">
                  <label>ชื่อ-นามสกุลนักศึกษา</label>
                  <input
                    type="text"
                    value={editStdNameInput}
                    onChange={(e) => setEditStdNameInput(e.target.value)}
                    placeholder="ระบุชื่อ-นามสกุลที่ถูกต้อง"
                  />
                </div>

                {(() => {
                  const oldNorm =
                    normalizeStdId(editStdRecord.stdId || editStdRecord.stdid) ||
                    String(editStdRecord.stdId || editStdRecord.stdid || '').trim();
                  const sameIdCount = oldNorm
                    ? records.filter((r) => {
                        const rNorm = normalizeStdId(r.stdId || r.stdid) || String(r.stdId || r.stdid || '').trim();
                        return rNorm === oldNorm;
                      }).length
                    : 1;

                  if (sameIdCount <= 1) return null;
                  return (
                    <div
                      style={{
                        background: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        marginBottom: '14px',
                        fontSize: '0.83rem',
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={editStdAllSessions}
                          onChange={(e) => setEditStdAllSessions(e.target.checked)}
                          style={{ marginTop: '3px' }}
                        />
                        <span>
                          <strong>ย้ายทุกครั้งที่ใช้รหัสเดิม &ldquo;{editStdRecord.stdId}&rdquo; ทั้งหมด ({sameIdCount} รายการ)</strong>
                          <br />
                          <small style={{ color: '#166534' }}>
                            (แนะนำ) ระบบจะย้ายประวัติของเด็กคนนี้ทุกวิชาและทุกครั้งที่เคยทำไว้ไปรหัสใหม่พร้อมกันในคลิกเดียว
                          </small>
                        </span>
                      </label>
                    </div>
                  );
                })()}

                <div className="modal-actions-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={editStdBusy}
                    onClick={() => setEditStdRecord(null)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={editStdBusy}
                    onClick={saveMigratedStudentRecords}
                  >
                    {editStdBusy ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i> กำลังย้ายข้อมูล...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-cloud-arrow-up"></i> บันทึกและย้ายข้อมูลทั้งหมด
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL: KPC ALERT */}
          {kpcOpen && (
            <div
              className="modal active"
              onClick={(e) => {
                if (e.target === e.currentTarget) setKpcOpen(false);
              }}
            >
              <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center', padding: '28px 22px' }}>
                <div
                  style={{
                    width: '62px',
                    height: '62px',
                    borderRadius: '18px',
                    background: 'var(--pastel-pink-light)',
                    color: 'var(--pastel-pink)',
                    border: '1px solid #F5CBD6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px',
                    fontSize: '1.75rem',
                  }}
                >
                  <i className="fa-solid fa-bell"></i>
                </div>
                <h3 style={{ color: 'var(--text-dark)', fontSize: '1.25rem', marginBottom: '8px' }}>
                  {cmsSettings.kpcTitle || 'แจ้งเตือนสำคัญ'}
                </h3>
                <p style={{ fontSize: '1.15rem', fontWeight: 600, color: '#BE123C', marginBottom: '18px' }}>
                  {cmsSettings.kpcMessage || 'อย่าลืมเก็บคะแนน กพช.!'}
                </p>
                <button type="button" className="btn" onClick={() => setKpcOpen(false)}>
                  รับทราบ
                </button>
              </div>
            </div>
          )}

          {/* MODAL: LIGHTBOX */}
          {lightboxSrc && (
            <div className="modal active" onClick={() => setLightboxSrc(null)}>
              <div style={{ position: 'relative', maxWidth: '92%', maxHeight: '92%' }}>
                <SmartImage
                  src={lightboxSrc}
                  alt="ภาพขยายเต็มจอ"
                  style={{
                    width: '100%',
                    height: 'auto',
                    maxHeight: '85vh',
                    objectFit: 'contain',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                  }}
                />
                <p style={{ color: 'white', textAlign: 'center', fontSize: '0.85rem', marginTop: '10px' }}>
                  (คลิกพื้นที่ว่างเพื่อปิดหน้าต่าง)
                </p>
              </div>
            </div>
          )}

          {/* MODAL: MAINTENANCE MESSAGE PROMPT */}
          {maintPromptOpen && (
            <div
              className="modal active"
              onClick={(e) => {
                if (e.target === e.currentTarget) setMaintPromptOpen(false);
              }}
            >
              <div className="modal-content" style={{ maxWidth: '480px' }}>
                <h3 style={{ color: 'var(--danger)', marginBottom: '8px' }}>
                  <i className="fa-solid fa-screwdriver-wrench"></i> เปิดโหมดปิดปรับปรุงเว็บไซต์
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  นักศึกษาทุกเครื่องจะถูกล็อคตั้งแต่หน้าแรกทันที จนกว่าคุณครูจะกด &ldquo;เปิดใช้งานเว็บตามปกติ&rdquo;
                </p>
                <div className="input-group">
                  <label>ข้อความแจ้งเตือนนักศึกษา</label>
                  <textarea
                    rows={3}
                    value={maintPromptMsg}
                    onChange={(e) => setMaintPromptMsg(e.target.value)}
                  />
                </div>
                <div className="modal-actions-row">
                  <button type="button" className="btn btn-secondary" onClick={() => setMaintPromptOpen(false)}>
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ background: 'var(--danger)' }}
                    onClick={async () => {
                      setMaintPromptOpen(false);
                      sessionStorage.setItem('clc_teacher_bypass', '1');
                      setTeacherBypass(true);
                      await setCloudMaintenance(true, maintPromptMsg.trim());
                      showNotice('เปิดโหมดปิดปรับปรุงเว็บไซต์แล้ว! นักศึกษาทุกเครื่องจะถูกล็อคตั้งแต่หน้าแรกทันที');
                    }}
                  >
                    ยืนยันปิดปรับปรุงเว็บ
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* IN-APP NOTICE DIALOG */}
      {noticeDialog && (
        <div
          className="modal active"
          style={{ zIndex: 3000 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setNoticeDialog(null);
          }}
        >
          <div className="modal-content" style={{ maxWidth: '420px', textAlign: 'center', padding: '24px 20px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '15px',
                background: 'var(--pastel-purple-light)',
                color: 'var(--pastel-purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
                fontSize: '1.4rem',
              }}
            >
              <i className="fa-solid fa-circle-info"></i>
            </div>
            <h3 style={{ color: 'var(--text-dark)', fontSize: '1.1rem', marginBottom: '8px' }}>{noticeDialog.title}</h3>
            <p
              style={{
                fontSize: '0.9rem',
                color: 'var(--text-body)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                marginBottom: '18px',
              }}
            >
              {noticeDialog.message}
            </p>
            <button type="button" className="btn" onClick={() => setNoticeDialog(null)}>
              ตกลง
            </button>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRM DIALOG */}
      {confirmDialog && (
        <div
          className="modal active"
          style={{ zIndex: 3000 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDialog(null);
          }}
        >
          <div className="modal-content" style={{ maxWidth: '440px', padding: '24px 20px' }}>
            <h3 style={{ color: confirmDialog.danger ? 'var(--danger)' : 'var(--pastel-purple)', marginBottom: '8px' }}>
              <i className={`fa-solid ${confirmDialog.danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}`}></i>{' '}
              {confirmDialog.title}
            </h3>
            <p
              style={{
                fontSize: '0.9rem',
                color: 'var(--text-body)',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                marginBottom: '18px',
              }}
            >
              {confirmDialog.message}
            </p>
            <div className="modal-actions-row">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDialog(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: confirmDialog.danger ? 'var(--danger)' : undefined }}
                onClick={async () => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await fn();
                }}
              >
                {confirmDialog.confirmLabel || 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
