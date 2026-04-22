"use client";
import type { ToastType } from "@/app/page";

interface Props {
  toasts: ToastType[];
}

export default function Toast({ toasts }: Props) {
  if (!toasts.length) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.type === "success" && <span>✅</span>}
          {toast.type === "error" && <span>⚠️</span>}
          {toast.type === "info" && <span>ℹ️</span>}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
