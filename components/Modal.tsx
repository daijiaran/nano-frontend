import React from 'react';

export function Modal(props: {
  open: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidthClassName?: string;
}) {
  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`glass w-full ${props.maxWidthClassName || 'max-w-2xl'} overflow-hidden rounded-xl shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="text-sm font-semibold text-zinc-100">{props.title}</div>
          <button
            onClick={props.onClose}
            className="rounded-lg px-2 py-1 text-zinc-300 hover:bg-white/5"
            aria-label="\u5173\u95ed"
          >
            &times;
          </button>
        </div>
        <div className="max-h-[80vh] overflow-auto p-4 custom-scrollbar">{props.children}</div>
      </div>
    </div>
  );
}
