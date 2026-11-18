import React, { useState } from 'react';
import type { TrashedRecord } from '../types/classroom';
import { APPS_SCRIPT_V2_CODE } from '../utils/cloudSync';

interface TrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  trashItems: TrashedRecord[];
  hasV2SheetTrash: boolean;
  onRestore: (item: TrashedRecord) => Promise<void>;
  onPermanentDelete: (item: TrashedRecord) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export const TrashModal: React.FC<TrashModalProps> = ({
  isOpen,
  onClose,
  trashItems,
  hasV2SheetTrash,
  onRestore,
  onPermanentDelete,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showAppsScriptGuide, setShowAppsScriptGuide] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const filtered = trashItems.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const sid = String(item.record.stdId || '').toLowerCase();
    const sname = String(item.record.stdName || '').toLowerCase();
    const ltitle = String(item.record.lessonTitle || '').toLowerCase();
    const sess = String(item.record.session || '').toLowerCase();
    return sid.includes(q) || sname.includes(q) || ltitle.includes(q) || sess.includes(q);
  });

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_V2_CODE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      alert('คัดลอกอัตโนมัติไม่สำเร็จ กรุณากดคลุมดำในกล่องโค้ดแล้วคัดลอกครับ');
    }
  };

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
            <h3 style={{ color: 'var(--pastel-purple)', fontSize: '1.18rem' }}>
              <i className="fa-solid fa-trash-can-arrow-up"></i> ถังขยะ (กู้คืนข้อมูลที่ถูกลบ)
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              รายการที่ครูลบ (เช่น ตัวเทส หรือรหัสที่นักศึกษากรอกผิด) จะถูกเก็บไว้ที่นี่ชั่วคราว และซิงค์เหมือนกันทุกเครื่อง
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setShowAppsScriptGuide((prev) => !prev)}
            >
              <i className="fa-solid fa-table"></i>{' '}
              {showAppsScriptGuide ? 'ซ่อนโค้ดชีตถังขยะ' : 'ตั้งค่าชีต "ถังขยะ" ใน Google Sheets'}
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={onRefresh}>
              <i className="fa-solid fa-arrows-rotate"></i> รีเฟรช
            </button>
          </div>
        </div>

        <div
          style={{
            background: hasV2SheetTrash ? 'var(--success-bg)' : 'var(--pastel-purple-light)',
            border: `1px solid ${hasV2SheetTrash ? '#A7F3D0' : 'var(--border-soft)'}`,
            color: hasV2SheetTrash ? '#065F46' : 'var(--text-dark)',
            borderRadius: '12px',
            padding: '10px 14px',
            fontSize: '0.82rem',
            marginBottom: '12px',
            lineHeight: 1.55,
          }}
        >
          {hasV2SheetTrash ? (
            <span>
              <i className="fa-solid fa-circle-check"></i>{' '}
              <strong>เชื่อมต่อชีต &ldquo;ถังขยะ&rdquo; ใน Google Sheets สมบูรณ์แล้ว:</strong> เมื่อลบหรือกู้คืน แถวข้อมูลจะย้ายระหว่างชีตหลักและชีต &ldquo;ถังขยะ&rdquo; อัตโนมัติ
            </span>
          ) : (
            <span>
              <i className="fa-solid fa-cloud-check" style={{ color: 'var(--pastel-purple)' }}></i>{' '}
              <strong>ซิงค์ถังขยะบนคลาวด์พร้อมใช้งานทันที:</strong> ข้อมูลที่ลบจะถูกซ่อนจากทุกเครื่องและกู้คืนได้จากหน้าต่างนี้ทันที (หากต้องการให้ย้ายแถวไปแท็บชีตชื่อ <strong>&ldquo;ถังขยะ&rdquo;</strong> ในไฟล์ Google Sheets ด้วย ให้กดปุ่ม &ldquo;ตั้งค่าชีตถังขยะ ใน Google Sheets&rdquo; ด้านบนเพื่ออัปเดตโค้ด Apps Script 1 ครั้ง)
            </span>
          )}
        </div>

        {showAppsScriptGuide && (
          <div className="cms-subcard" style={{ marginBottom: '14px' }}>
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
              <strong style={{ fontSize: '0.88rem', color: 'var(--pastel-purple)' }}>
                โค้ด Google Apps Script (สร้างแท็บชีต &ldquo;ถังขยะ&rdquo; อัตโนมัติ)
              </strong>
              <button type="button" className="btn btn-xs" onClick={handleCopyCode}>
                <i className="fa-solid fa-copy"></i> {copiedCode ? 'คัดลอกแล้ว!' : 'คัดลอกโค้ดทั้งหมด'}
              </button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5 }}>
              1. เปิด Google Sheet &gt; ส่วนขยาย (Extensions) &gt; Apps Script &nbsp;|&nbsp; 2. วางโค้ดนี้แทนที่เดิมแล้วบันทึก &nbsp;|&nbsp; 3. กด Deploy &gt; Manage deployments &gt; แก้ไขเป็น New version
            </p>
            <textarea
              readOnly
              value={APPS_SCRIPT_V2_CODE}
              rows={8}
              style={{
                width: '100%',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.75rem',
                padding: '10px',
                borderRadius: '10px',
                border: '1px solid var(--border-soft)',
                background: '#fff',
              }}
            />
          </div>
        )}

        <div className="input-group" style={{ marginBottom: '10px' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาในถังขยะ (รหัสนักศึกษา, ชื่อ, รายวิชา)..."
          />
        </div>

        <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>รหัส / ผู้เรียน</th>
                <th>วิชา / ครั้งที่</th>
                <th>คะแนน (สอบ / ใบงาน)</th>
                <th>ลบเมื่อ / เหตุผล</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '22px', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-box-open"></i> ไม่มีรายการในถังขยะ
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const r = item.record;
                  const isBusy = busyKey === item.trashKey;
                  const assignVal = r.assignmentScore !== undefined && r.assignmentScore !== null && r.assignmentScore !== '' ? r.assignmentScore : '-';
                  return (
                    <tr key={item.trashKey}>
                      <td>
                        <strong>{r.stdId || '-'}</strong>
                        <br />
                        <small>{r.stdName || 'ไม่ระบุชื่อ'}</small>
                      </td>
                      <td>
                        <span className="badge" style={{ background: 'var(--pastel-purple-light)', color: 'var(--pastel-purple)' }}>
                          {r.session || '-'}
                        </span>
                        <br />
                        <small>{r.lessonTitle || '-'}</small>
                      </td>
                      <td>
                        สอบ: <strong>{r.bestQuizScore ?? 0}</strong>/10
                        <br />
                        ใบงาน: <strong>{assignVal}</strong>
                      </td>
                      <td>
                        <small>{item.deletedAt || '-'}</small>
                        {item.deletedReason && (
                          <>
                            <br />
                            <small style={{ color: 'var(--danger)' }}>{item.deletedReason}</small>
                          </>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn btn-xs"
                            style={{ background: 'var(--success)' }}
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyKey(item.trashKey);
                              await onRestore(item);
                              setBusyKey(null);
                            }}
                          >
                            <i className="fa-solid fa-rotate-left"></i> กู้คืน
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs"
                            style={{ background: 'var(--danger)' }}
                            disabled={isBusy}
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  `ยืนยันการลบถาวรของ ${r.stdName || r.stdId} (${r.session})?\nหากลบถาวรแล้วจะไม่สามารถกู้คืนได้อีก`
                                )
                              ) {
                                return;
                              }
                              setBusyKey(item.trashKey);
                              await onPermanentDelete(item);
                              setBusyKey(null);
                            }}
                          >
                            <i className="fa-solid fa-trash"></i> ลบถาวร
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

        <div style={{ marginTop: '14px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ปิดหน้าต่างถังขยะ
          </button>
        </div>
      </div>
    </div>
  );
};
