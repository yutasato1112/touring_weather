import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Touring Weather - 経路天気予報',
    short_name: 'Touring Weather',
    description: '出発地・目的地・出発日時から、経路上の天気予報を表示するWebアプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  }
}
