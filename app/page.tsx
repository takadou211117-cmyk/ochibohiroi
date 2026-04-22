"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

// --- Sub Components ---
import Sidebar from "@/components/Sidebar";
import TimetableView from "@/components/TimetableView";
import SubjectList from "@/components/SubjectList";
import SessionView from "@/components/SessionView";
import NoteEditor from "@/components/NoteEditor";
import UploadModal from "@/components/UploadModal";
import Toast from "@/components/Toast";

export type ToastType = { id: string; message: string; type: "success" | "error" | "info" };

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"subjects" | "timetable">("subjects");
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [editingNote, setEditingNote] = useState<any>(null);
  const [uploadModal, setUploadModal] = useState<"timetable" | "board" | null>(null);
  const [toasts, setToasts] = useState<ToastType[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const addToast = useCallback((message: string, type: ToastType["type"] = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/user");
      if (!res.ok) return;
      const data = await res.json();
      setUser(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchUser();
  }, [status, fetchUser]);

  const handleUploadSuccess = (type: "timetable" | "board", data: any) => {
    fetchUser();
    if (type === "timetable") {
      addToast(`✅ 時間割を読み込みました（${data.count || 0}科目）`, "success");
    } else {
      addToast("✅ 写真をアップロードしました", "success");
    }
    setUploadModal(null);
  };

  if (status === "loading" || loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className="spinner" />
        <p>ochibohiroi 起動中...</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className={styles.app}>
      <Sidebar
        user={user}
        activeView={activeView}
        onViewChange={(v) => { setActiveView(v); setSelectedSubject(null); setSelectedSession(null); }}
        onUploadTimetable={() => setUploadModal("timetable")}
        onUploadBoard={() => setUploadModal("board")}
        onSignOut={() => signOut({ callbackUrl: "/login" })}
        onProfileUpdate={fetchUser}
        addToast={addToast}
      />

      <main className={styles.main}>
        {editingNote ? (
          <NoteEditor
            note={editingNote}
            onClose={() => setEditingNote(null)}
            onSave={() => { fetchUser(); setEditingNote(null); addToast("ノートを保存しました"); }}
            addToast={addToast}
          />
        ) : selectedSession ? (
          <SessionView
            session={selectedSession}
            onBack={() => setSelectedSession(null)}
            onEditNote={setEditingNote}
            onRefresh={fetchUser}
            addToast={addToast}
          />
        ) : activeView === "timetable" ? (
          <TimetableView
            subjects={user?.subjects || []}
            onRefresh={fetchUser}
            addToast={addToast}
          />
        ) : (
          <SubjectList
            subjects={user?.subjects || []}
            onSelectSubject={setSelectedSubject}
            onSelectSession={setSelectedSession}
            onRefresh={fetchUser}
            selectedSubject={selectedSubject}
            addToast={addToast}
            onUploadBoard={() => setUploadModal("board")}
            onUploadTimetable={() => setUploadModal("timetable")}
          />
        )}
      </main>

      {uploadModal && (
        <UploadModal
          type={uploadModal}
          subjects={user?.subjects || []}
          onClose={() => setUploadModal(null)}
          onSuccess={(data) => handleUploadSuccess(uploadModal, data)}
          addToast={addToast}
        />
      )}

      <Toast toasts={toasts} />
    </div>
  );
}
