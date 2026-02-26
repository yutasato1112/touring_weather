'use client';

interface ErrorMessageProps {
  message: string | null;
  onClose: () => void;
}

export default function ErrorMessage({ message, onClose }: ErrorMessageProps) {
  if (!message) return null;

  return (
    <div className="absolute top-4 right-4 z-[1001] max-w-sm">
      <div className="glass-panel !bg-red-950/20 !border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-red-400 text-sm flex-1">{message}</span>
        <button
          onClick={onClose}
          className="text-red-400 hover:text-red-300 text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
