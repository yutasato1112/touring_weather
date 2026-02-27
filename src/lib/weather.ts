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

/** Date を JST (UTC+9) の YYYY-MM-DD 文字列にする（Open-Meteo の timezone=Asia/Tokyo に合わせる） */
function toJSTDateString(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}

/** Date を JST の時 (0-23) で返す */
function toJSTHour(d: Date): number {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours();
}

/**
 * Open-Meteo の JST 時刻文字列 "YYYY-MM-DDTHH:MM" を
 * Date.UTC ベースのミリ秒に変換する。
 */
function omTimeToJSTMs(t: string): number {
  const y = parseInt(t.slice(0, 4), 10);
  const m = parseInt(t.slice(5, 7), 10) - 1;
  const d = parseInt(t.slice(8, 10), 10);
  const h = parseInt(t.slice(11, 13), 10);
  return Date.UTC(y, m, d, h, 0, 0);
}

/**
 * Open-Meteo の hourly.time 配列からターゲット時刻に最も近い index を返す。
 * 完全一致 → 最近接マッチ（1時間以内）のフォールバック付き。
 */
function findClosestHourIndex(
  hourlyTimes: string[],
  targetDate: Date
): number {
  const targetJSTMs = targetDate.getTime() + 9 * 60 * 60 * 1000;
  const targetDateStr = toJSTDateString(targetDate);
  const targetHour = toJSTHour(targetDate);

  // 1) 完全一致（日付 + 時）
  for (let i = 0; i < hourlyTimes.length; i++) {
    const t = hourlyTimes[i];
    if (t.slice(0, 10) === targetDateStr && parseInt(t.slice(11, 13), 10) === targetHour) {
      return i;
    }
  }

  // 2) 最近接フォールバック（1時間以内）
  let bestIndex = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < hourlyTimes.length; i++) {
    const omMs = omTimeToJSTMs(hourlyTimes[i]);
    const diff = Math.abs(omMs - targetJSTMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  if (bestDiff <= 3600000) return bestIndex;
  return -1;
}

/** 指定ms待つ */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 429 リトライ付き fetch（最大 maxRetries 回、指数バックオフ） */
async function fetchWithRetry(
  url: string,
  maxRetries: number = 3,
  baseDelayMs: number = 1500
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await delay(baseDelayMs * attempt);
    }
    const response = await fetch(url);
    if (response.status !== 429) return response;
    lastResponse = response;
  }
  return lastResponse!;
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
    const dateStr = toJSTDateString(date);

    const url = `${OPEN_METEO_BASE_URL}?latitude=${position.lat.toFixed(4)}&longitude=${position.lng.toFixed(4)}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&start_date=${dateStr}&end_date=${dateStr}&timezone=Asia%2FTokyo`;

    const response = await fetchWithRetry(url);
    if (!response.ok) return null;

    const data = await response.json();
    const hourly = data.hourly;
    if (!hourly || !hourly.time) return null;

    const index = findClosestHourIndex(hourly.time, date);
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
 * N地点を1リクエストで取得する。
 * 429 レート制限時はリトライ（個別フォールバックは 429 を増幅するため行わない）。
 */
export async function fetchWeatherForPoints(
  points: { position: LatLng; targetTime: string }[]
): Promise<(WeatherData | null)[]> {
  if (points.length === 0) return [];

  // 1地点の場合は単一リクエスト
  if (points.length === 1) {
    const result = await fetchWeatherForPoint(points[0].position, points[0].targetTime);
    return [result];
  }

  try {
    // 全地点の日付範囲を算出（JST基準）
    const dates = points.map((p) => new Date(p.targetTime));
    const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
    const startDate = toJSTDateString(minDate);
    const endDate = toJSTDateString(maxDate);

    const latitudes = points.map((p) => p.position.lat.toFixed(4)).join(',');
    const longitudes = points.map((p) => p.position.lng.toFixed(4)).join(',');

    const url = `${OPEN_METEO_BASE_URL}?latitude=${latitudes}&longitude=${longitudes}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&start_date=${startDate}&end_date=${endDate}&timezone=Asia%2FTokyo`;

    // 429 リトライ付き（最大3回、1.5秒→3秒→4.5秒間隔）
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      // 429 以外のエラー → 個別フォールバック（順次実行）
      if (response.status !== 429) {
        return fallbackSequential(points);
      }
      // 429 でリトライ上限 → 空配列よりはnull配列を返す
      return points.map(() => null);
    }

    const data = await response.json();
    const locations = Array.isArray(data) ? data : [data];

    return points.map((point, i) => {
      try {
        const location = locations[Math.min(i, locations.length - 1)];
        if (!location?.hourly?.time) return null;

        const hourly = location.hourly;
        const targetDate = new Date(point.targetTime);

        const index = findClosestHourIndex(hourly.time, targetDate);
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
    return fallbackSequential(points);
  }
}

/**
 * フォールバック: 個別リクエストを順次実行（429 回避のため 300ms 間隔）
 */
async function fallbackSequential(
  points: { position: LatLng; targetTime: string }[]
): Promise<(WeatherData | null)[]> {
  const results: (WeatherData | null)[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0) await delay(300);
    results.push(await fetchWeatherForPoint(points[i].position, points[i].targetTime));
  }
  return results;
}
