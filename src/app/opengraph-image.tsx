import { ImageResponse } from 'next/og'

export const alt = 'Touring Weather - 経路天気予報'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background decoration */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            left: -60,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 60,
          }}
        >
          {/* Logo icon */}
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 44,
              background: '#0f172a',
              border: '3px solid rgba(59,130,246,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {/* Sun accent */}
            <div
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: '#f59e0b',
                display: 'flex',
              }}
            />
            {/* TW letters */}
            <div
              style={{
                position: 'absolute',
                top: 34,
                left: 18,
                width: 164,
                height: 134,
                display: 'flex',
              }}
            >
              <svg viewBox="0 0 160 130" width="164" height="134">
                <rect x="0" y="0" width="68" height="18" rx="4" fill="#e2e8f0" />
                <rect x="22" y="0" width="24" height="118" rx="4" fill="#e2e8f0" />
                <path
                  d="M72 0 L82 68 Q86 88, 92 68 L100 32 Q104 14, 110 32 L120 68 Q124 88, 130 68 L138 0"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M72 0 L82 68 Q86 88, 92 68 L100 32 Q104 14, 110 32 L120 68 Q124 88, 130 68 L138 0"
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="6 10"
                />
              </svg>
            </div>
          </div>

          {/* Text */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: '#f1f5f9',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              Touring Weather
            </div>
            <div
              style={{
                fontSize: 32,
                color: '#94a3b8',
                letterSpacing: '0.05em',
              }}
            >
              経路天気予報
            </div>
            <div
              style={{
                display: 'flex',
                gap: 12,
                marginTop: 8,
              }}
            >
              {['ルート比較', '渋滞予測', '雨回避'].map((tag) => (
                <div
                  key={tag}
                  style={{
                    fontSize: 18,
                    color: '#93c5fd',
                    background: 'rgba(59,130,246,0.15)',
                    padding: '6px 16px',
                    borderRadius: 20,
                    border: '1px solid rgba(59,130,246,0.3)',
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
