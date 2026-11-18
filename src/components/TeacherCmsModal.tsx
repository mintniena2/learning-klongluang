import React, { useEffect, useState } from 'react';
import {
  getLessonMatchingPairs,
  isFlipGameLesson,
  parseLegacyCodeSnippet,
  type ParsedCodeImport,
} from '../data/coursesData';
import type {
  CmsSettings,
  CourseLevel,
  CoursesByLevel,
  Lesson,
  LessonPage,
  MatchingPair,
  QuizQuestion,
} from '../types/classroom';

interface TeacherCmsModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: CoursesByLevel;
  cmsSettings: CmsSettings;
  onSaveLesson: (level: CourseLevel, lesson: Lesson) => Promise<void>;
  onDeleteLesson: (lessonId: string) => Promise<void>;
  onSaveCmsSettings: (settings: CmsSettings) => Promise<void>;
}

type CmsTab = 'locks' | 'content' | 'quiz' | 'settings';

export const TeacherCmsModal: React.FC<TeacherCmsModalProps> = ({
  isOpen,
  onClose,
  courses,
  cmsSettings,
  onSaveLesson,
  onDeleteLesson,
  onSaveCmsSettings,
}) => {
  const [activeTab, setActiveTab] = useState<CmsTab>('locks');
  const [selectedLevel, setSelectedLevel] = useState<CourseLevel>('m-ton');
  const [selectedLessonId, setSelectedLessonId] = useState<string>('mt1_s1');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');

  // Editable draft of the currently selected lesson
  const [draftLesson, setDraftLesson] = useState<Lesson | null>(null);
  const [draftLevel, setDraftLevel] = useState<CourseLevel>('m-ton');

  // New session / course form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLvl, setNewLvl] = useState<CourseLevel>('m-ton');
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSession, setNewSession] = useState('');
  const [newLocked, setNewLocked] = useState(false);

  // Legacy code importer state
  const [codeSnippet, setCodeSnippet] = useState('');
  const [parsedPreview, setParsedPreview] = useState<ParsedCodeImport | null>(null);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');

  // Global settings draft
  const [settingsDraft, setSettingsDraft] = useState<CmsSettings>(cmsSettings);

  useEffect(() => {
    setSettingsDraft(cmsSettings);
  }, [cmsSettings, isOpen]);

  // Keep draftLesson synced when selectedLessonId changes
  useEffect(() => {
    let found: Lesson | undefined;
    let foundLvl: CourseLevel = 'm-ton';
    for (const lvl of ['m-ton', 'm-ปลาย'] as CourseLevel[]) {
      const hit = (courses[lvl] || []).find((l) => l.id === selectedLessonId);
      if (hit) {
        found = hit;
        foundLvl = lvl;
        break;
      }
    }
    if (!found) {
      const fallbackList = courses[selectedLevel] || [];
      found = fallbackList[0];
      foundLvl = selectedLevel;
    }
    if (found) {
      setSelectedLessonId(found.id);
      setDraftLevel(foundLvl);
      setDraftLesson(JSON.parse(JSON.stringify(found)) as Lesson);
    }
  }, [selectedLessonId, courses, selectedLevel, isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 3500);
  };

  const allLessonsFlat: { level: CourseLevel; lesson: Lesson }[] = [
    ...(courses['m-ton'] || []).map((l) => ({ level: 'm-ton' as CourseLevel, lesson: l })),
    ...(courses['m-ปลาย'] || []).map((l) => ({ level: 'm-ปลาย' as CourseLevel, lesson: l })),
  ];

  // Group courses for Lock manager
  const levelLessons = courses[selectedLevel] || [];
  const groupedCourses: Record<string, { code: string; title: string; sessions: Lesson[] }> = {};
  levelLessons.forEach((l) => {
    if (!groupedCourses[l.code]) {
      groupedCourses[l.code] = { code: l.code, title: l.title, sessions: [] };
    }
    groupedCourses[l.code].sessions.push(l);
  });

  const handleToggleLock = async (lvl: CourseLevel, lesson: Lesson) => {
    setSavingId(lesson.id);
    const updated: Lesson = { ...lesson, isLocked: !lesson.isLocked };
    await onSaveLesson(lvl, updated);
    setSavingId(null);
    showToast(
      `${updated.isLocked ? '🔒 ล็อค' : '🔓 เปิดสอน'} ${updated.code} (${updated.session}) และซิงค์ขึ้นฐานข้อมูลกลางแล้ว`
    );
  };

  const handleBulkCourseLock = async (lvl: CourseLevel, sessions: Lesson[], lock: boolean) => {
    setSavingId(`bulk_${sessions[0]?.code || ''}`);
    for (const s of sessions) {
      if (s.isLocked !== lock) {
        await onSaveLesson(lvl, { ...s, isLocked: lock });
      }
    }
    setSavingId(null);
    showToast(`${lock ? '🔒 ล็อคทั้งหมด' : '🔓 เปิดสอนทั้งหมด'} ในวิชา ${sessions[0]?.code} แล้ว`);
  };

  const handleCreateNewLesson = async () => {
    if (!newCode.trim() || !newTitle.trim() || !newSession.trim()) {
      alert('กรุณากรอก รหัสวิชา ชื่อวิชา และชื่อครั้งที่เรียน ให้ครบถ้วน');
      return;
    }
    const newId = `custom_${Date.now()}`;
    const created: Lesson = {
      id: newId,
      code: newCode.trim(),
      title: newTitle.trim(),
      session: newSession.trim(),
      isLocked: newLocked,
      isCustom: true,
      pages: [
        {
          title: 'ตอนที่ 1: เนื้อหาบทเรียน',
          content: 'กรุณาแก้ไขเนื้อหาบทเรียนในแท็บ "แก้ไขเนื้อหา/ใบงาน"',
          infographicUrl: 'images/cover.png',
        },
      ],
      assignmentTasks: ['ข้อ 1: ให้นักศึกษาสรุปความรู้ที่ได้จากบทเรียนนี้'],
      questions: [
        {
          q: 'ข้อที่ 1: ตัวอย่างคำถามข้อสอบ (กรุณาแก้ไขในแท็บจัดการข้อสอบ)',
          options: ['ก. ตัวเลือกที่ 1', 'ข. ตัวเลือกที่ 2', 'ค. ตัวเลือกที่ 3', 'ง. ตัวเลือกที่ 4'],
          ans: 0,
        },
      ],
    };

    setSavingId('creating');
    await onSaveLesson(newLvl, created);
    setSavingId(null);
    setSelectedLevel(newLvl);
    setSelectedLessonId(newId);
    setShowAddForm(false);
    setNewCode('');
    setNewTitle('');
    setNewSession('');
    setNewLocked(false);
    showToast(`เพิ่ม "${created.code} - ${created.session}" ลงฐานข้อมูลกลางสำเร็จ!`);
  };

  const handleSaveDraftLesson = async () => {
    if (!draftLesson) return;
    setSavingId(draftLesson.id);
    await onSaveLesson(draftLevel, draftLesson);
    setSavingId(null);
    showToast(`บันทึก "${draftLesson.code} - ${draftLesson.session}" ลงฐานข้อมูลกลางเรียบร้อย (ทุกเครื่องเห็นเหมือนกันทันที)`);
  };

  const handleParseCode = () => {
    const parsed = parseLegacyCodeSnippet(codeSnippet);
    setParsedPreview(parsed);
  };

  const handleApplyParsedCode = async () => {
    if (!draftLesson || !parsedPreview) return;
    const updated: Lesson = { ...draftLesson };

    if (parsedPreview.pages.length > 0) {
      updated.pages =
        importMode === 'replace' ? parsedPreview.pages : [...(updated.pages || []), ...parsedPreview.pages];
    }
    if (parsedPreview.assignmentTasks.length > 0) {
      updated.assignmentTasks =
        importMode === 'replace'
          ? parsedPreview.assignmentTasks
          : [...(updated.assignmentTasks || []), ...parsedPreview.assignmentTasks];
    }
    if (parsedPreview.questions.length > 0) {
      updated.questions =
        importMode === 'replace'
          ? parsedPreview.questions
          : [...(updated.questions || []), ...parsedPreview.questions];
    }

    setDraftLesson(updated);
    setSavingId(updated.id);
    await onSaveLesson(draftLevel, updated);
    setSavingId(null);
    setCodeSnippet('');
    setParsedPreview(null);
    showToast('นำเข้าโค้ดและบันทึกลงฐานข้อมูลกลางเรียบร้อยแล้ว!');
  };

  const handleSaveGlobalSettings = async () => {
    setSavingId('settings');
    await onSaveCmsSettings(settingsDraft);
    setSavingId(null);
    showToast('บันทึกการตั้งค่าหน้าเว็บลงฐานข้อมูลกลางเรียบร้อย (ทุกเครื่องอัปเดตตรงกัน)');
  };

  // Helpers to edit draft pages / tasks / questions / matching
  const updatePage = (idx: number, patch: Partial<LessonPage>) => {
    if (!draftLesson) return;
    const pages = [...(draftLesson.pages || [])];
    pages[idx] = { ...pages[idx], ...patch };
    setDraftLesson({ ...draftLesson, pages });
  };

  const updateQuestion = (idx: number, patch: Partial<QuizQuestion>) => {
    if (!draftLesson) return;
    const questions = [...(draftLesson.questions || [])];
    questions[idx] = { ...questions[idx], ...patch };
    setDraftLesson({ ...draftLesson, questions });
  };

  const updateQuestionOption = (qIdx: number, optIdx: number, rawText: string) => {
    if (!draftLesson) return;
    const questions = [...(draftLesson.questions || [])];
    const opts = [...questions[qIdx].options];
    const prefixes = ['ก. ', 'ข. ', 'ค. ', 'ง. '];
    const cleaned = rawText.replace(/^[กขคง]\.\s*/, '');
    opts[optIdx] = prefixes[optIdx] + cleaned;
    questions[qIdx] = { ...questions[qIdx], options: opts };
    setDraftLesson({ ...draftLesson, questions });
  };

  const currentPairs: MatchingPair[] = draftLesson ? getLessonMatchingPairs(draftLesson) : [];

  return (
    <div
      className="modal active"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content modal-xl">
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
          <div>
            <h3 style={{ color: 'var(--pastel-purple)', fontSize: '1.2rem' }}>
              <i className="fa-solid fa-sliders"></i> ระบบหลังบ้านคุณครู (แก้ไขได้ทุกอย่างโดยไม่ต้องแก้โค้ด HTML)
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              ทุกการแก้ไขจะถูกบันทึกลงฐานข้อมูลกลาง ใช้เครื่องไหนหรือครูท่านใดเปิดดู ข้อมูลจะตรงกันทั้งหมด
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i> ปิดหน้าต่าง
          </button>
        </div>

        {statusMsg && (
          <div
            style={{
              background: 'var(--success-bg)',
              border: '1px solid #A7F3D0',
              color: '#065F46',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '12px',
            }}
          >
            <i className="fa-solid fa-circle-check"></i> {statusMsg}
          </div>
        )}

        <div className="cms-tabs">
          <button
            type="button"
            className={`cms-tab-btn ${activeTab === 'locks' ? 'active' : ''}`}
            onClick={() => setActiveTab('locks')}
          >
            <i className="fa-solid fa-lock-open"></i> 1. ล็อค/เปิดครั้ง &amp; เพิ่มวิชา-ครั้ง
          </button>
          <button
            type="button"
            className={`cms-tab-btn ${activeTab === 'content' ? 'active' : ''}`}
            onClick={() => setActiveTab('content')}
          >
            <i className="fa-solid fa-book-open"></i> 2. แก้ไขเนื้อหา / ใบงาน / เกม
          </button>
          <button
            type="button"
            className={`cms-tab-btn ${activeTab === 'quiz' ? 'active' : ''}`}
            onClick={() => setActiveTab('quiz')}
          >
            <i className="fa-solid fa-list-check"></i> 3. ข้อสอบ &amp; วางโค้ดรูปแบบเดิม
          </button>
          <button
            type="button"
            className={`cms-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <i className="fa-solid fa-bullhorn"></i> 4. ข่าวสาร / ป๊อปอัป กพช. / อื่นๆ
          </button>
        </div>

        {/* TAB 1: LOCK / UNLOCK & ADD COURSE/SESSION */}
        {activeTab === 'locks' && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${selectedLevel === 'm-ton' ? '' : 'btn-outline'}`}
                  onClick={() => setSelectedLevel('m-ton')}
                >
                  ระดับ ม.ต้น ({(courses['m-ton'] || []).length} ครั้ง)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${selectedLevel === 'm-ปลาย' ? '' : 'btn-outline'}`}
                  onClick={() => setSelectedLevel('m-ปลาย')}
                >
                  ระดับ ม.ปลาย ({(courses['m-ปลาย'] || []).length} ครั้ง)
                </button>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                style={{ background: 'var(--success)' }}
                onClick={() => {
                  setNewLvl(selectedLevel);
                  setShowAddForm((prev) => !prev);
                }}
              >
                <i className="fa-solid fa-plus"></i> เพิ่มครั้งเรียน / รายวิชาใหม่
              </button>
            </div>

            {showAddForm && (
              <div className="cms-subcard" style={{ borderColor: '#A7F3D0', background: '#F6FEF9' }}>
                <h4 style={{ fontSize: '0.96rem', color: '#065F46', marginBottom: '10px' }}>
                  <i className="fa-solid fa-folder-plus"></i> เพิ่มครั้งเรียนหรือรายวิชาใหม่
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label>ระดับชั้น</label>
                    <select value={newLvl} onChange={(e) => setNewLvl(e.target.value as CourseLevel)}>
                      <option value="m-ton">มัธยมศึกษาตอนต้น (ม.ต้น)</option>
                      <option value="m-ปลาย">มัธยมศึกษาตอนปลาย (ม.ปลาย)</option>
                    </select>
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label>รหัสวิชา (ใช้รหัสเดิมเพื่อเพิ่มครั้งในวิชานั้น)</label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="เช่น กอ22002 หรือ สค310001"
                    />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label>ชื่อรายวิชา</label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="เช่น วิชาการค้าขายออนไลน์"
                    />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label>ครั้งที่เรียน / วันที่</label>
                    <input
                      type="text"
                      value={newSession}
                      onChange={(e) => setNewSession(e.target.value)}
                      placeholder="เช่น ครั้งที่ 6 วันที่ 6 ธ.ค. 2569"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '10px' }}>
                  <label style={{ fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newLocked}
                      onChange={(e) => setNewLocked(e.target.checked)}
                    />
                    ตั้งค่าเริ่มต้นเป็น &ldquo;ล็อคไว้ก่อน&rdquo; (ยังไม่ให้นักศึกษาเข้าเรียน)
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowAddForm(false)}>
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ background: 'var(--success)' }}
                      disabled={savingId === 'creating'}
                      onClick={handleCreateNewLesson}
                    >
                      <i className="fa-solid fa-cloud-arrow-up"></i> บันทึกเพิ่มลงระบบ
                    </button>
                  </div>
                </div>
              </div>
            )}

            {Object.values(groupedCourses).map((course) => (
              <div key={course.code} className="cms-subcard">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                    borderBottom: '1px solid var(--border-hairline)',
                    paddingBottom: '8px',
                    marginBottom: '10px',
                  }}
                >
                  <div>
                    <strong style={{ color: 'var(--pastel-purple)', fontSize: '0.96rem' }}>
                      {course.code} — {course.title}
                    </strong>
                    <span style={{ marginLeft: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      ({course.sessions.length} ครั้ง)
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-xs"
                      style={{ background: 'var(--success)' }}
                      disabled={savingId === `bulk_${course.code}`}
                      onClick={() => handleBulkCourseLock(selectedLevel, course.sessions, false)}
                    >
                      <i className="fa-solid fa-lock-open"></i> เปิดสอนทั้งหมด
                    </button>
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      disabled={savingId === `bulk_${course.code}`}
                      onClick={() => handleBulkCourseLock(selectedLevel, course.sessions, true)}
                    >
                      <i className="fa-solid fa-lock"></i> ล็อคทั้งหมด
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  {course.sessions.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                        padding: '9px 12px',
                        background: 'white',
                        borderRadius: '10px',
                        border: '1px solid var(--border-hairline)',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--text-dark)' }}>{s.session}</strong>
                        <span style={{ marginLeft: '8px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          ({s.pages.length} หน้า · {s.questions.length} ข้อสอบ)
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-xs"
                          style={{ background: s.isLocked ? '#8B7D9B' : 'var(--success)' }}
                          disabled={savingId === s.id}
                          onClick={() => handleToggleLock(selectedLevel, s)}
                        >
                          <i className={`fa-solid ${s.isLocked ? 'fa-lock' : 'fa-lock-open'}`}></i>{' '}
                          {savingId === s.id ? 'กำลังบันทึก...' : s.isLocked ? 'ล็อคอยู่ (คลิกเพื่อเปิด)' : 'เปิดสอนอยู่ (คลิกเพื่อล็อค)'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => {
                            setSelectedLessonId(s.id);
                            setActiveTab('content');
                          }}
                        >
                          <i className="fa-solid fa-pen"></i> แก้เนื้อหา
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => {
                            setSelectedLessonId(s.id);
                            setActiveTab('quiz');
                          }}
                        >
                          <i className="fa-solid fa-list-check"></i> แก้ข้อสอบ
                        </button>
                        {s.isCustom && (
                          <button
                            type="button"
                            className="btn btn-xs"
                            style={{ background: 'var(--danger)' }}
                            onClick={async () => {
                              if (!window.confirm(`ต้องการซ่อน/ลบบทเรียน "${s.code} ${s.session}" ออกจากรายการหรือไม่?`)) return;
                              await onDeleteLesson(s.id);
                              showToast(`ลบบทเรียน ${s.session} ออกจากรายการแล้ว`);
                            }}
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: EDIT CONTENT, INFOGRAPHICS, ASSIGNMENT TASKS, GAME */}
        {activeTab === 'content' && draftLesson && (
          <div>
            <div className="input-group">
              <label>เลือกวิชาและครั้งที่ต้องการแก้ไข</label>
              <select
                value={draftLesson.id}
                onChange={(e) => setSelectedLessonId(e.target.value)}
              >
                {allLessonsFlat.map(({ level, lesson }) => (
                  <option key={lesson.id} value={lesson.id}>
                    [{level === 'm-ton' ? 'ม.ต้น' : 'ม.ปลาย'}] {lesson.code} - {lesson.session}: {lesson.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="cms-subcard">
              <h4 style={{ fontSize: '0.94rem', color: 'var(--pastel-purple)', marginBottom: '10px' }}>
                ข้อมูลทั่วไปของครั้งเรียนนี้
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>รหัสวิชา</label>
                  <input
                    type="text"
                    value={draftLesson.code}
                    onChange={(e) => setDraftLesson({ ...draftLesson, code: e.target.value })}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>ชื่อรายวิชา</label>
                  <input
                    type="text"
                    value={draftLesson.title}
                    onChange={(e) => setDraftLesson({ ...draftLesson, title: e.target.value })}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>ชื่อครั้งที่ / วันที่</label>
                  <input
                    type="text"
                    value={draftLesson.session}
                    onChange={(e) => setDraftLesson({ ...draftLesson, session: e.target.value })}
                  />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>สถานะการล็อค</label>
                  <select
                    value={draftLesson.isLocked ? 'locked' : 'open'}
                    onChange={(e) => setDraftLesson({ ...draftLesson, isLocked: e.target.value === 'locked' })}
                  >
                    <option value="open">🔓 เปิดให้นักศึกษาเข้าเรียน</option>
                    <option value="locked">🔒 ล็อค (ยังไม่เปิดเรียน)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Pages Editor */}
            <div className="cms-subcard">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ fontSize: '0.94rem', color: 'var(--pastel-purple)' }}>
                  เนื้อหาบทเรียนทีละหน้า ({draftLesson.pages.length} หน้า)
                </h4>
                <button
                  type="button"
                  className="btn btn-xs"
                  onClick={() =>
                    setDraftLesson({
                      ...draftLesson,
                      pages: [
                        ...draftLesson.pages,
                        {
                          title: `ตอนที่ ${draftLesson.pages.length + 1}: หัวข้อใหม่`,
                          content: '',
                          infographicUrl: 'images/cover.png',
                        },
                      ],
                    })
                  }
                >
                  <i className="fa-solid fa-plus"></i> เพิ่มหน้าเนื้อหา
                </button>
              </div>

              {draftLesson.pages.map((pg, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'white',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: '12px',
                    padding: '12px',
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--pastel-pink)' }}>หน้าที่ {idx + 1}</strong>
                    {draftLesson.pages.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-xs"
                        style={{ background: 'var(--danger)' }}
                        onClick={() => {
                          const next = draftLesson.pages.filter((_, i) => i !== idx);
                          setDraftLesson({ ...draftLesson, pages: next });
                        }}
                      >
                        <i className="fa-solid fa-trash"></i> ลบหน้านี้
                      </button>
                    )}
                  </div>
                  <div className="input-group" style={{ marginBottom: '8px' }}>
                    <label>ชื่อตอน / หัวข้อ</label>
                    <input
                      type="text"
                      value={pg.title}
                      onChange={(e) => updatePage(idx, { title: e.target.value })}
                    />
                  </div>
                  <div className="input-group" style={{ marginBottom: '8px' }}>
                    <label>เนื้อหาสำหรับให้อ่าน</label>
                    <textarea
                      rows={3}
                      value={pg.content}
                      onChange={(e) => updatePage(idx, { content: e.target.value })}
                    />
                  </div>
                  <div className="input-group" style={{ marginBottom: 0 }}>
                    <label>ลิงก์รูปภาพอินโฟกราฟิก (เช่น images/mt1-1.png หรือ URL รูปภาพ)</label>
                    <input
                      type="text"
                      value={pg.infographicUrl}
                      onChange={(e) => updatePage(idx, { infographicUrl: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Assignment Tasks Editor */}
            <div className="cms-subcard">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ fontSize: '0.94rem', color: 'var(--pastel-purple)' }}>
                  โจทย์ใบงาน ({draftLesson.assignmentTasks.length} ข้อ)
                </h4>
                <button
                  type="button"
                  className="btn btn-xs"
                  onClick={() =>
                    setDraftLesson({
                      ...draftLesson,
                      assignmentTasks: [
                        ...draftLesson.assignmentTasks,
                        `ข้อ ${draftLesson.assignmentTasks.length + 1}: `,
                      ],
                    })
                  }
                >
                  <i className="fa-solid fa-plus"></i> เพิ่มข้อใบงาน
                </button>
              </div>
              {draftLesson.assignmentTasks.map((task, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <textarea
                    rows={2}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-soft)',
                      fontSize: '0.88rem',
                      background: 'white',
                    }}
                    value={task}
                    onChange={(e) => {
                      const next = [...draftLesson.assignmentTasks];
                      next[idx] = e.target.value;
                      setDraftLesson({ ...draftLesson, assignmentTasks: next });
                    }}
                  />
                  {draftLesson.assignmentTasks.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-xs"
                      style={{ background: 'var(--danger)', marginTop: '4px' }}
                      onClick={() =>
                        setDraftLesson({
                          ...draftLesson,
                          assignmentTasks: draftLesson.assignmentTasks.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      <i className="fa-solid fa-trash"></i>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Game Mode & Matching Pairs Editor */}
            <div className="cms-subcard">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ fontSize: '0.94rem', color: 'var(--pastel-purple)' }}>
                  รูปแบบเกมทบทวนก่อนทำใบงาน
                </h4>
                <select
                  style={{ padding: '6px 10px', borderRadius: '9px', border: '1px solid var(--border-soft)', fontSize: '0.84rem', background: 'white' }}
                  value={draftLesson.gameMode || (isFlipGameLesson(draftLesson) ? 'flip' : 'matching')}
                  onChange={(e) =>
                    setDraftLesson({
                      ...draftLesson,
                      gameMode: e.target.value as 'matching' | 'flip',
                    })
                  }
                >
                  <option value="matching">เกมจับคู่ซ้าย-ขวา</option>
                  <option value="flip">เกมเปิดการ์ดความจำ (คว่ำไพ่)</option>
                </select>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                คู่คำศัพท์-คำตอบสำหรับเกม (ปรับแก้ได้ หรือกดเพิ่มคู่ใหม่):
              </p>
              {currentPairs.map((pair, idx) => (
                <div
                  key={pair.id + '_' + idx}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'center' }}
                >
                  <input
                    type="text"
                    placeholder="ฝั่งซ้าย (หัวข้อ)"
                    value={pair.term}
                    style={{ padding: '7px 10px', borderRadius: '9px', border: '1px solid var(--border-soft)', fontSize: '0.84rem', background: 'white' }}
                    onChange={(e) => {
                      const next = [...currentPairs];
                      next[idx] = { ...next[idx], term: e.target.value };
                      setDraftLesson({ ...draftLesson, customMatchingPairs: next });
                    }}
                  />
                  <input
                    type="text"
                    placeholder="ฝั่งขวา (คำตอบ)"
                    value={pair.match}
                    style={{ padding: '7px 10px', borderRadius: '9px', border: '1px solid var(--border-soft)', fontSize: '0.84rem', background: 'white' }}
                    onChange={(e) => {
                      const next = [...currentPairs];
                      next[idx] = { ...next[idx], match: e.target.value };
                      setDraftLesson({ ...draftLesson, customMatchingPairs: next });
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-xs"
                    style={{ background: 'var(--danger)' }}
                    onClick={() => {
                      const next = currentPairs.filter((_, i) => i !== idx);
                      setDraftLesson({ ...draftLesson, customMatchingPairs: next });
                    }}
                  >
                    <i className="fa-solid fa-trash"></i>
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-xs btn-outline"
                onClick={() =>
                  setDraftLesson({
                    ...draftLesson,
                    customMatchingPairs: [
                      ...currentPairs,
                      { id: `pair_${Date.now()}`, term: 'หัวข้อใหม่', match: 'คำตอบที่คู่กัน' },
                    ],
                  })
                }
              >
                <i className="fa-solid fa-plus"></i> เพิ่มคู่เกมจับคู่
              </button>
            </div>

            <button
              type="button"
              className="btn"
              disabled={savingId === draftLesson.id}
              onClick={handleSaveDraftLesson}
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>{' '}
              {savingId === draftLesson.id ? 'กำลังบันทึกลงฐานข้อมูลกลาง...' : 'บันทึกเนื้อหา ใบงาน และเกมลงฐานข้อมูลกลาง'}
            </button>
          </div>
        )}

        {/* TAB 3: QUIZ EDITOR + LEGACY CODE IMPORTER */}
        {activeTab === 'quiz' && draftLesson && (
          <div>
            <div className="input-group">
              <label>เลือกวิชาและครั้งที่ต้องการแก้ไขข้อสอบ</label>
              <select
                value={draftLesson.id}
                onChange={(e) => setSelectedLessonId(e.target.value)}
              >
                {allLessonsFlat.map(({ level, lesson }) => (
                  <option key={lesson.id} value={lesson.id}>
                    [{level === 'm-ton' ? 'ม.ต้น' : 'ม.ปลาย'}] {lesson.code} - {lesson.session}: {lesson.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Paste legacy p(...) / q(...) code directly in web UI */}
            <div className="cms-subcard" style={{ background: '#FAF5FF', borderColor: 'var(--border-soft)' }}>
              <h4 style={{ fontSize: '0.96rem', color: 'var(--pastel-purple)', marginBottom: '6px' }}>
                <i className="fa-solid fa-code"></i> เพิ่มเนื้อหา / ข้อสอบด้วยการวางโค้ดรูปแบบเดิม (p / q) ในหน้าเว็บได้เลย
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5 }}>
                สามารถวางโค้ดรูปแบบ <code>p(&apos;ตอนที่...&apos;, &apos;เนื้อหา...&apos;, &apos;images/...&apos;)</code> หรือ{' '}
                <code>q(&apos;ข้อที่ 1: ...&apos;, &apos;ก...&apos;, &apos;ข...&apos;, &apos;ค...&apos;, &apos;ง...&apos;, 0)</code>{' '}
                (เลขท้าย 0=ก, 1=ข, 2=ค, 3=ง) หรือวาง <code>assignmentTasks: [...]</code> ลงในช่องนี้แล้วกดตรวจสอบได้ทันทีครับ
              </p>
              <textarea
                rows={5}
                value={codeSnippet}
                onChange={(e) => {
                  setCodeSnippet(e.target.value);
                  setParsedPreview(null);
                }}
                placeholder={`ตัวอย่าง:\nq('ข้อที่ 1: คำถามทดสอบ?', 'ตัวเลือก ก', 'ตัวเลือก ข', 'ตัวเลือก ค', 'ตัวเลือก ง', 0),\nq('ข้อที่ 2: คำถามที่ 2?', 'ตัวเลือก ก', 'ตัวเลือก ข', 'ตัวเลือก ค', 'ตัวเลือก ง', 1)`}
                style={{
                  width: '100%',
                  fontFamily: 'IBM Plex Mono, Noto Sans Thai, monospace',
                  fontSize: '0.8rem',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-soft)',
                  background: 'white',
                  marginBottom: '8px',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="btn btn-sm" onClick={handleParseCode} disabled={!codeSnippet.trim()}>
                  <i className="fa-solid fa-magnifying-glass"></i> ตรวจสอบโค้ดที่วาง
                </button>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}
                  style={{ padding: '7px 10px', borderRadius: '9px', border: '1px solid var(--border-soft)', fontSize: '0.82rem', background: 'white' }}
                >
                  <option value="append">เพิ่มต่อท้ายข้อเดิม</option>
                  <option value="replace">แทนที่ของเดิมทั้งหมด</option>
                </select>
              </div>

              {parsedPreview && (
                <div
                  style={{
                    marginTop: '10px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'white',
                    border: '1px solid var(--border-hairline)',
                    fontSize: '0.82rem',
                  }}
                >
                  {parsedPreview.errors.length > 0 && (
                    <div style={{ color: '#BE123C', marginBottom: '6px' }}>
                      {parsedPreview.errors.map((err, i) => (
                        <div key={i}>
                          <i className="fa-solid fa-triangle-exclamation"></i> {err}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ color: '#065F46', fontWeight: 600 }}>
                    พบข้อมูลพร้อมนำเข้า: หน้าเนื้อหา {parsedPreview.pages.length} หน้า · ใบงาน {parsedPreview.assignmentTasks.length} ข้อ · ข้อสอบ{' '}
                    {parsedPreview.questions.length} ข้อ
                  </div>
                  {(parsedPreview.pages.length > 0 ||
                    parsedPreview.assignmentTasks.length > 0 ||
                    parsedPreview.questions.length > 0) && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ background: 'var(--success)', marginTop: '8px' }}
                      onClick={handleApplyParsedCode}
                    >
                      <i className="fa-solid fa-cloud-arrow-up"></i> นำเข้าโค้ดและบันทึกลงฐานข้อมูลกลางทันที
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Visual Quiz Editor */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <h4 style={{ fontSize: '0.96rem', color: 'var(--pastel-purple)' }}>
                แก้ไขข้อสอบรายข้อ ({draftLesson.questions.length} ข้อ)
              </h4>
              <button
                type="button"
                className="btn btn-xs"
                onClick={() =>
                  setDraftLesson({
                    ...draftLesson,
                    questions: [
                      ...draftLesson.questions,
                      {
                        q: `ข้อที่ ${draftLesson.questions.length + 1}: `,
                        options: ['ก. ', 'ข. ', 'ค. ', 'ง. '],
                        ans: 0,
                      },
                    ],
                  })
                }
              >
                <i className="fa-solid fa-plus"></i> เพิ่มข้อสอบ 1 ข้อ
              </button>
            </div>

            {draftLesson.questions.map((qItem, qIdx) => (
              <div key={qIdx} className="cms-subcard">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '0.86rem', color: 'var(--pastel-pink)' }}>ข้อสอบที่ {qIdx + 1}</strong>
                  {draftLesson.questions.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-xs"
                      style={{ background: 'var(--danger)' }}
                      onClick={() =>
                        setDraftLesson({
                          ...draftLesson,
                          questions: draftLesson.questions.filter((_, i) => i !== qIdx),
                        })
                      }
                    >
                      <i className="fa-solid fa-trash"></i> ลบข้อนี้
                    </button>
                  )}
                </div>
                <div className="input-group" style={{ marginBottom: '8px' }}>
                  <label>คำถาม</label>
                  <input
                    type="text"
                    value={qItem.q}
                    onChange={(e) => updateQuestion(qIdx, { q: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                  {['ก', 'ข', 'ค', 'ง'].map((letter, optIdx) => (
                    <div key={letter} className="input-group" style={{ marginBottom: 0 }}>
                      <label>ตัวเลือก {letter}.</label>
                      <input
                        type="text"
                        value={(qItem.options[optIdx] || '').replace(/^[กขคง]\.\s*/, '')}
                        onChange={(e) => updateQuestionOption(qIdx, optIdx, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>เฉลยข้อที่ถูกต้อง</label>
                  <select
                    value={qItem.ans}
                    onChange={(e) => updateQuestion(qIdx, { ans: Number(e.target.value) })}
                  >
                    <option value={0}>ก. {(qItem.options[0] || '').replace(/^ก\.\s*/, '')}</option>
                    <option value={1}>ข. {(qItem.options[1] || '').replace(/^ข\.\s*/, '')}</option>
                    <option value={2}>ค. {(qItem.options[2] || '').replace(/^ค\.\s*/, '')}</option>
                    <option value={3}>ง. {(qItem.options[3] || '').replace(/^ง\.\s*/, '')}</option>
                  </select>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="btn"
              disabled={savingId === draftLesson.id}
              onClick={handleSaveDraftLesson}
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>{' '}
              {savingId === draftLesson.id ? 'กำลังบันทึกข้อสอบ...' : 'บันทึกข้อสอบทั้งหมดลงฐานข้อมูลกลาง'}
            </button>
          </div>
        )}

        {/* TAB 4: GLOBAL SITE SETTINGS (NEWS BOARD, KPC POPUP, READ TIMER) */}
        {activeTab === 'settings' && (
          <div>
            <div className="cms-subcard">
              <h4 style={{ fontSize: '0.96rem', color: 'var(--pastel-purple)', marginBottom: '10px' }}>
                <i className="fa-solid fa-bullhorn"></i> กระดานข่าวประชาสัมพันธ์หน้าแรก
              </h4>
              <div className="input-group">
                <label>หัวข้อประกาศข่าว</label>
                <input
                  type="text"
                  value={settingsDraft.newsHeading}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, newsHeading: e.target.value })}
                />
              </div>
              <div className="input-group">
                <label>รายละเอียดข่าวประชาสัมพันธ์</label>
                <textarea
                  rows={4}
                  value={settingsDraft.newsBody}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, newsBody: e.target.value })}
                />
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>ลิงก์รูปภาพข่าวประชาสัมพันธ์ (เช่น images/news.png หรือ URL รูป)</label>
                <input
                  type="text"
                  value={settingsDraft.newsImageUrl}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, newsImageUrl: e.target.value })}
                />
              </div>
            </div>

            <div className="cms-subcard">
              <h4 style={{ fontSize: '0.96rem', color: 'var(--pastel-purple)', marginBottom: '10px' }}>
                <i className="fa-solid fa-bell"></i> ป๊อปอัปแจ้งเตือนเมื่อเข้าเว็บไซต์ (เช่น แจ้งเตือน กพช.) &amp; ตั้งเวลาอ่าน
              </h4>
              <div className="input-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settingsDraft.kpcEnabled}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, kpcEnabled: e.target.checked })}
                  />
                  แสดงหน้าต่างแจ้งเตือนเมื่อนักศึกษาเปิดหน้าเว็บ
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                <div className="input-group">
                  <label>หัวข้อแจ้งเตือน</label>
                  <input
                    type="text"
                    value={settingsDraft.kpcTitle}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, kpcTitle: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label>ข้อความแจ้งเตือน</label>
                  <input
                    type="text"
                    value={settingsDraft.kpcMessage}
                    onChange={(e) => setSettingsDraft({ ...settingsDraft, kpcMessage: e.target.value })}
                  />
                </div>
              </div>
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>เวลาบังคับอ่านเนื้อหาต่อ 1 หน้า (วินาที)</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={settingsDraft.readSecondsPerPage}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      readSecondsPerPage: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </div>
            </div>

            <button
              type="button"
              className="btn"
              disabled={savingId === 'settings'}
              onClick={handleSaveGlobalSettings}
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>{' '}
              {savingId === 'settings' ? 'กำลังบันทึกการตั้งค่า...' : 'บันทึกการตั้งค่าทั้งหมดลงฐานข้อมูลกลาง'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
