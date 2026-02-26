import { LatLng, WeatherData } from '@/types';

const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * WMO Weather Code to description mapping
 */
const weatherCodeDescriptions: Record<number, string> = {
  0: '快晴',
  1: '晴れ',
  2: '一部曇り',
  3: '曇り',
  45: '霧',
  48: '着氷性の霧',
  51: '弱い霧雨',
  53: '霧雨',
  55: '強い霧雨',
  61: '弱い雨',
  63: '雨',
  65: '強い雨',
  71: '弱い雪',
  73: '雪',
  75: '強い雪',
  77: '霧雪',
  80: '弱いにわか雨',
  81: 'にわか雨',
  82: '激しいにわか雨',
  85: '弱いにわか雪',
  86: '激しいにわか雪',
  95: '雷雨',
  96: '雹を伴う雷雨',
  99: '激しい雹を伴う雷雨',
};

/**
 * WMO Weather Code to emoji mapping
 */
export function getWeatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 65) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  return '⛈️';
}

/** Date をローカル時間の YYYY-MM-DD 文字列にする */
function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Date を JST (UTC+9) の YYYY-MM-DD 文字列にする（Open-Meteo の timezone=Asia/Tokyo に合わせる） */
function toJSTDateString(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}

/**
 * 特定の地点・時刻の天気データを取得する
 */
export async function fetchWeatherForPoint(
  position: LatLng,
  targetTime: string
): Promise<WeatherData | null> {
  try {
    const date = new Date(targetTime);
    const dateStr = date.toISOString().split('T')[0];

    const params = new URLSearchParams({
      latitude: position.lat.toFixed(4),
      longitude: position.lng.toFixed(4),
      hourly: 'temperature_2m,precipitation_probability,wind_speed_10m,weather_code',
      start_date: dateStr,
      end_date: dateStr,
      timezone: 'Asia/Tokyo',
    });

    const response = await fetch(`${OPEN_METEO_BASE_URL}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    const hourly = data.hourly;
    if (!hourly || !hourly.time) return null;

    // Find the closest hour
    const targetHour = date.getHours();
    const index = hourly.time.findIndex((t: string) => {
      const h = new Date(t).getHours();
      return h === targetHour;
    });

    if (index === -1) return null;

    const weatherCode = hourly.weather_code[index] ?? 0;

    return {
      temperature: hourly.temperature_2m[index] ?? 0,
      precipitationProbability: hourly.precipitation_probability[index] ?? 0,
      windSpeed: hourly.wind_speed_10m[index] ?? 0,
      weatherCode,
      weatherDescription: weatherCodeDescriptions[weatherCode] ?? '不明',
    };
  } catch {
    return null;
  }
}

/**
 * 複数地点の天気を一括取得する
 *
 * Open-Meteo のマルチロケーション API を使い、
 * N地点を1リクエストで取得する（地点ごとの個別リクエストを排除）。
 * 日付が複数日にまたがる場合は全日付範囲をカバーするリクエストを送る。
 */
export async function fetchWeatherForPoints(
  points: { position: LatLng; targetTime: string }[]
): Promise<(WeatherData | null)[]> {
  if (points.length === 0) return [];

  // 1地点の場合は単一リクエストで十分
  if (points.length === 1) {
    const result = await fetchWeatherForPoint(points[0].position, points[0].targetTime);
    return [result];
  }

  try {
    // 全地点の日付範囲を算出（JST基準: Open-Meteo の timezone パラメータと一致させる）
    const dates = points.map((p) => new Date(p.targetTime));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const startDate = toJSTDateString(minDate);
    const endDate = toJSTDateString(maxDate);

    // カンマ区切りの座標リスト
    const latitudes = points.map((p) => p.position.lat.toFixed(4)).join(',');
    const longitudes = points.map((p) => p.position.lng.toFixed(4)).join(',');

    // URLSearchParams はカンマを %2C にエンコードするため手動で構築
    const url = `${OPEN_METEO_BASE_URL}?latitude=${latitudes}&longitude=${longitudes}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&start_date=${startDate}&end_date=${endDate}&timezone=Asia%2FTokyo`;

    const response = await fetch(url);
    if (!response.ok) {
      return fallbackIndividual(points);
    }

    const data = await response.json();

    // マルチロケーション: 配列、単一: オブジェクト（ここには来ないが安全策）
    const locations = Array.isArray(data) ? data : [data];

    return points.map((point, i) => {
      try {
        const location = locations[i];
        if (!location?.hourly?.time) return null;

        const hourly = location.hourly;
        const targetDate = new Date(point.targetTime);
        const targetHour = targetDate.getHours();

        // Open-Meteo の time は JST（"2026-02-27T12:00" 形式）。
        // getHours() はブラウザのローカル時間（日本ユーザー=JST）で比較。
        // 複数日にまたがる場合があるため日付も比較する。
        const targetLocalDate = localDateString(targetDate);
        const index = hourly.time.findIndex((t: string) => {
          const d = new Date(t);
          return localDateString(d) === targetLocalDate && d.getHours() === targetHour;
        });

        if (index === -1) return null;

        const weatherCode = hourly.weather_code[index] ?? 0;

        return {
          temperature: hourly.temperature_2m[index] ?? 0,
          precipitationProbability: hourly.precipitation_probability[index] ?? 0,
          windSpeed: hourly.wind_speed_10m[index] ?? 0,
          weatherCode,
          weatherDescription: weatherCodeDescriptions[weatherCode] ?? '不明',
        };
      } catch {
        return null;
      }
    });
  } catch {
    return fallbackIndividual(points);
  }
}

/**
 * 一括取得失敗時のフォールバック: 個別リクエストで並列取得
 */
async function fallbackIndividual(
  points: { position: LatLng; targetTime: string }[]
): Promise<(WeatherData | null)[]> {
  return Promise.all(
    points.map((p) => fetchWeatherForPoint(p.position, p.targetTime))
  );
}
