import { ImageResponse } from 'next/og'

export const size = {
  width: 180,
  height: 180,
}

export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 38,
          background: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Sun accent (top-right) */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: '#f59e0b',
            boxShadow: '0 0 14px rgba(245,158,11,0.4)',
            display: 'flex',
          }}
        />

        {/* T + W logo */}
        <div
          style={{
            position: 'absolute',
            top: 30,
            left: 14,
            width: 152,
            height: 124,
            display: 'flex',
          }}
        >
          <svg viewBox="0 0 160 130" width="152" height="124">
            {/* T - bold geometric */}
            <rect x="0" y="0" width="68" height="18" rx="4" fill="#e2e8f0" />
            <rect x="22" y="0" width="24" height="118" rx="4" fill="#e2e8f0" />

            {/* W - winding road */}
            <path
              d="M72 0
               L82 68
               Q86 88, 92 68
               L100 32
               Q104 14, 110 32
               L120 68
               Q124 88, 130 68
               L138 0"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="16"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Road center dashes */}
            <path
              d="M72 0
               L82 68
               Q86 88, 92 68
               L100 32
               Q104 14, 110 32
               L120 68
               Q124 88, 130 68
               L138 0"
              fill="none"
              stroke="#93c5fd"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="6 10"
            />
          </svg>
        </div>
      </div>
    ),
    { ...size }
  )
}
