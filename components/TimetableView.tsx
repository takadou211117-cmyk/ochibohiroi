"use client";
import { useState } from "react";
import styles from "./TimetableView.module.css";

interface Props {
  subjects: any[];
  onRefresh: () => void;
  addToast: (msg: string, type?: any) => void;
}

const DAYS = ["月", "火", "水", "木", "金", "土"];
const PERIODS = [1, 2, 3, 4, 5, 6];

export default function TimetableView({ subjects, onRefresh, addToast }: Props) {
  const [editingSlot, setEditingSlot] = useState<{ day: number; period: number } | null>(null);
  const [slotData, setSlotData] = useState({ name: "", room: "", professor: "" });

  // 曜日と時限に一致する科目を検索
  const getSubjectForSlot = (dayIndex: number, period: number) => {
    // データベースの曜日は 日=0, 月=1, 火=2... なので、表示用のインデックス(月=0)に+1する
    const dbDayOfWeek = dayIndex + 1;
    
    for (const subject of subjects) {
      if (subject.schedules) {
        for (const schedule of subject.schedules) {
          if (schedule.dayOfWeek === dbDayOfWeek && schedule.period === period) {
            return subject;
          }
        }
      }
    }
    return null;
  };

  const handleSlotClick = (dayIndex: number, period: number, existingSubject: any) => {
    setEditingSlot({ day: dayIndex + 1, period });
    if (existingSubject) {
      setSlotData({
        name: existingSubject.name,
        room: existingSubject.room || "",
        professor: existingSubject.professor || "",
      });
    } else {
      setSlotData({ name: "", room: "", professor: "" });
    }
  };

  const handleSaveSlot = async () => {
    if (!editingSlot || !slotData.name.trim()) {
      setEditingSlot(null);
      return;
    }

    try {
      const existingSubject = getSubjectForSlot(editingSlot.day - 1, editingSlot.period);
      
      if (existingSubject) {
        // 更新
        const res = await fetch("/api/subjects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: existingSubject.id,
            name: slotData.name.trim(),
            room: slotData.room,
            professor: slotData.professor,
          }),
        });
        if (!res.ok) throw new Error();
        addToast("科目を更新しました");
      } else {
        // 新規作成
        const res = await fetch("/api/subjects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: slotData.name.trim(),
            room: slotData.room,
            professor: slotData.professor,
            dayOfWeek: editingSlot.day,
            period: editingSlot.period,
          }),
        });
        if (!res.ok) throw new Error();
        addToast("科目を追加しました");
      }
      onRefresh();
      setEditingSlot(null);
    } catch (e) {
      addToast("保存に失敗しました", "error");
    }
  };

  const handleDeleteSlot = async () => {
    if (!editingSlot) return;
    const existingSubject = getSubjectForSlot(editingSlot.day - 1, editingSlot.period);
    if (!existingSubject) return;

    if (!confirm("この科目を削除しますか？")) return;

    try {
      const res = await fetch(`/api/subjects?id=${existingSubject.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      addToast("科目を削除しました");
      onRefresh();
      setEditingSlot(null);
    } catch (e) {
      addToast("削除に失敗しました", "error");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>📅 時間割</h1>
          <p className={styles.pageSubtitle}>コマをクリックして編集できます</p>
        </div>
      </div>

      <div className={`glass ${styles.timetableWrapper}`}>
        <div className={styles.timetableGrid}>
          {/* Header Row (Days) */}
          <div className={styles.headerCell}></div>
          {DAYS.map((day) => (
            <div key={day} className={styles.headerCell}>{day}</div>
          ))}

          {/* Time Slots */}
          {PERIODS.map((period) => (
            <React.Fragment key={`row-${period}`}>
              <div className={styles.periodCell}>{period}</div>
              
              {DAYS.map((day, dayIndex) => {
                const subject = getSubjectForSlot(dayIndex, period);
                
                return (
                  <div 
                    key={`slot-${dayIndex}-${period}`} 
                    className={`${styles.slotCell} ${subject ? styles.hasSubject : ''}`}
                    style={subject ? { "--slot-color": subject.color } as any : {}}
                    onClick={() => handleSlotClick(dayIndex, period, subject)}
                  >
                    {subject && (
                      <div className={styles.subjectContent}>
                        <div className={styles.subjectName}>{subject.name}</div>
                        {(subject.room || subject.professor) && (
                          <div className={styles.subjectMeta}>
                            {subject.room && <span>🏫 {subject.room}</span>}
                            {subject.professor && <span>👨‍🏫 {subject.professor}</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {editingSlot && (
        <div className="modal-overlay" onClick={() => setEditingSlot(null)}>
          <div className={`modal-box ${styles.editModal}`} onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setEditingSlot(null)}>×</button>
            <h3 style={{ marginBottom: 20 }}>
              {DAYS[editingSlot.day - 1]}曜 {editingSlot.period}限 の科目
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="label">科目名 *</label>
                <input 
                  className="input" 
                  value={slotData.name} 
                  onChange={e => setSlotData({...slotData, name: e.target.value})}
                  autoFocus
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label className="label">教室</label>
                  <input 
                    className="input" 
                    value={slotData.room} 
                    onChange={e => setSlotData({...slotData, room: e.target.value})}
                  />
                </div>
                <div>
                  <label className="label">担当教員</label>
                  <input 
                    className="input" 
                    value={slotData.professor} 
                    onChange={e => setSlotData({...slotData, professor: e.target.value})}
                  />
                </div>
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                {getSubjectForSlot(editingSlot.day - 1, editingSlot.period) ? (
                  <button className="btn btn-danger" onClick={handleDeleteSlot}>🗑️ 削除</button>
                ) : <div />}
                
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setEditingSlot(null)}>キャンセル</button>
                  <button className="btn btn-primary" onClick={handleSaveSlot} disabled={!slotData.name.trim()}>保存</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
