export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block flex-shrink-0"
    >
      <rect width="32" height="32" rx="7" fill="#0f172a" />
      {/* Sun accent */}
      <circle cx="27.5" cy="4.5" r="2.8" fill="#f59e0b" />
      {/* T */}
      <rect x="2.5" y="7" width="12" height="3.2" rx="0.8" fill="#e2e8f0" />
      <rect x="6.5" y="7" width="3.8" height="19" rx="0.8" fill="#e2e8f0" />
      {/* W - winding road */}
      <path
        d="M14.5 7 L17 18 Q18 22,20 18 L22 12 Q23 9,24.5 12 L26.5 18 Q28 22,29 18 L29.5 7"
        stroke="#3b82f6"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 7 L17 18 Q18 22,20 18 L22 12 Q23 9,24.5 12 L26.5 18 Q28 22,29 18 L29.5 7"
        stroke="#93c5fd"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeDasharray="1.2 2"
      />
    </svg>
  );
}
