import { RouteType, BaseRouteType } from '@/types';

/** 渋滞レベル（Apple Maps準拠: 順調 / 混雑 / 渋滞） */
export type CongestionLevel = 'normal' | 'congested' | 'heavy';

/** 渋滞レベルのUI情報 */
export const CONGESTION_LABELS: Record<CongestionLevel, string> = {
  normal: '順調',
  congested: '混雑',
  heavy: '渋滞',
};

export const CONGESTION_COLORS: Record<CongestionLevel, string> = {
  normal: '#34C759',    // Apple green
  congested: '#FF9500', // Apple orange
  heavy: '#FF3B30',     // Apple red
};

/**
 * 時間帯別渋滞倍率テーブル（24時間、index=時間帯）
 * 1.0 = 渋滞なし, >1.0 = 所要時間が増加
 *
 * 日本の道路交通の一般的な統計パターンに基づくヒューリスティック値
 */

// 高速道路 × 平日
const HIGHWAY_WEEKDAY: number[] = [
  1.00, // 0時
  1.00, // 1時
  1.00, // 2時
  1.00, // 3時
  1.00, // 4時
  1.05, // 5時
  1.15, // 6時
  1.35, // 7時
  1.45, // 8時 — 朝のピーク
  1.30, // 9時
  1.15, // 10時
  1.10, // 11時
  1.15, // 12時 — 昼
  1.10, // 13時
  1.05, // 14時
  1.10, // 15時
  1.25, // 16時
  1.40, // 17時 — 夕方のピーク
  1.45, // 18時
  1.30, // 19時
  1.15, // 20時
  1.05, // 21時
  1.00, // 22時
  1.00, // 23時
];

// 高速道路 × 休日
const HIGHWAY_WEEKEND: number[] = [
  1.00, // 0時
  1.00, // 1時
  1.00, // 2時
  1.00, // 3時
  1.00, // 4時
  1.05, // 5時
  1.15, // 6時
  1.30, // 7時
  1.40, // 8時 — 行楽ピーク
  1.45, // 9時
  1.40, // 10時
  1.25, // 11時
  1.20, // 12時
  1.15, // 13時
  1.20, // 14時
  1.30, // 15時 — 帰りピーク開始
  1.45, // 16時
  1.50, // 17時 — 帰りピーク
  1.45, // 18時
  1.35, // 19時
  1.20, // 20時
  1.10, // 21時
  1.00, // 22時
  1.00, // 23時
];

// 一般道 × 平日
const LOCAL_WEEKDAY: number[] = [
  1.00, // 0時
  1.00, // 1時
  1.00, // 2時
  1.00, // 3時
  1.00, // 4時
  1.05, // 5時
  1.20, // 6時
  1.50, // 7時 — 通勤ピーク
  1.60, // 8時
  1.40, // 9時
  1.20, // 10時
  1.15, // 11時
  1.20, // 12時 — 昼休み
  1.15, // 13時
  1.10, // 14時
  1.15, // 15時
  1.30, // 16時
  1.50, // 17時 — 退勤ピーク
  1.55, // 18時
  1.40, // 19時
  1.20, // 20時
  1.10, // 21時
  1.05, // 22時
  1.00, // 23時
];

// 一般道 × 休日
const LOCAL_WEEKEND: number[] = [
  1.00, // 0時
  1.00, // 1時
  1.00, // 2時
  1.00, // 3時
  1.00, // 4時
  1.00, // 5時
  1.05, // 6時
  1.10, // 7時
  1.20, // 8時
  1.25, // 9時
  1.30, // 10時 — 買い物・行楽
  1.30, // 11時
  1.25, // 12時
  1.20, // 13時
  1.25, // 14時
  1.30, // 15時
  1.35, // 16時 — 帰宅
  1.40, // 17時
  1.35, // 18時
  1.25, // 19時
  1.15, // 20時
  1.05, // 21時
  1.00, // 22時
  1.00, // 23時
];

/**
 * rain_avoid を元のルート種別に解決する
 */
export function resolveTrafficRouteType(routeType: RouteType): BaseRouteType {
  if (routeType === 'rain_avoid') return 'no_highway';
  return routeType;
}

/**
 * ルート種別が高速道路系か一般道系かを判定
 */
function isHighwayRoute(routeType: RouteType): boolean {
  return resolveTrafficRouteType(routeType) === 'fastest';
}

/**
 * 指定日が休日かどうか（土日）
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * 適切な渋滞テーブルを選択
 */
function selectTable(time: Date, routeType: RouteType): number[] {
  const highway = isHighwayRoute(routeType);
  const weekend = isWeekend(time);

  if (highway && !weekend) return HIGHWAY_WEEKDAY;
  if (highway && weekend) return HIGHWAY_WEEKEND;
  if (!highway && !weekend) return LOCAL_WEEKDAY;
  return LOCAL_WEEKEND;
}

/**
 * 時間帯の渋滞倍率を取得（線形補間あり）
 *
 * 各テーブルエントリは「その時間帯の代表値」として扱い、
 * 30分単位で隣の時間帯と線形補間する。
 */
export function getCongestionMultiplier(time: Date, routeType: RouteType): number {
  const table = selectTable(time, routeType);
  const hour = time.getHours();
  const minutes = time.getMinutes();

  // 線形補間: 30分以降は次の時間帯に向かって補間
  const currentVal = table[hour];
  const nextVal = table[(hour + 1) % 24];
  const t = minutes / 60;

  return currentVal + (nextVal - currentVal) * t;
}

/**
 * 渋滞倍率 + レベル情報を取得（Apple Maps準拠の2段階）
 *
 * Apple Maps基準:
 *   順調: 自由流速度の75%以上 (multiplier < 1.25)
 *   混雑: 自由流速度の55〜75% (1.25 ≤ multiplier < 1.45)
 *   渋滞: 自由流速度の55%未満 (multiplier ≥ 1.45)
 */
export function getCongestionInfo(
  time: Date,
  routeType: RouteType
): { multiplier: number; level: CongestionLevel } {
  const multiplier = getCongestionMultiplier(time, routeType);

  let level: CongestionLevel;
  if (multiplier < 1.25) {
    level = 'normal';
  } else if (multiplier < 1.45) {
    level = 'congested';
  } else {
    level = 'heavy';
  }

  return { multiplier, level };
}

/**
 * 渋滞を考慮した所要時間を計算する
 *
 * ルート全体のbaseDurationを小さな時間ステップに分割し、
 * 各ステップの時点での渋滞倍率を適用する。
 */
export function calculateAdjustedDuration(
  baseDuration: number,
  departureTime: Date,
  routeType: RouteType
): number {
  // 5分ごとのステップで渋滞倍率を適用（細かい予測のため）
  const STEP_SECONDS = 5 * 60;
  let remainingBase = baseDuration;
  let adjustedTotal = 0;
  let currentTime = new Date(departureTime.getTime());

  while (remainingBase > 0) {
    const stepBase = Math.min(remainingBase, STEP_SECONDS);
    const multiplier = getCongestionMultiplier(currentTime, routeType);
    const stepAdjusted = stepBase * multiplier;

    adjustedTotal += stepAdjusted;
    currentTime = new Date(currentTime.getTime() + stepAdjusted * 1000);
    remainingBase -= stepBase;
  }

  return Math.round(adjustedTotal);
}
