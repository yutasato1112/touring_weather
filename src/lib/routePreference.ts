import { LatLng, Waypoint, AvoidArea } from '@/types';
import { geocodeSearch } from '@/lib/geocode';

/** resolveRoutePreference の戻り値 */
export interface RoutePreferenceResult {
  waypoints: Waypoint[];
  avoidAreas: AvoidArea[];
}

interface RouteKeyword {
  names: string[];
  waypoints: LatLng[];
  label: string;
}

const ROUTE_KEYWORDS: RouteKeyword[] = [
  // === 高速道路 ===
  {
    names: ['東名', '東名高速', '東名高速道路'],
    waypoints: [{ lat: 35.3192, lng: 139.2700 }], // 海老名SA付近
    label: '東名高速',
  },
  {
    names: ['新東名', '新東名高速', '新東名高速道路'],
    waypoints: [{ lat: 35.1500, lng: 138.9000 }], // 新東名 静岡付近
    label: '新東名高速',
  },
  {
    names: ['中央道', '中央自動車道', '中央高速'],
    waypoints: [{ lat: 35.6600, lng: 138.5700 }], // 甲府付近
    label: '中央自動車道',
  },
  {
    names: ['関越', '関越道', '関越自動車道'],
    waypoints: [{ lat: 36.3900, lng: 139.0600 }], // 渋川伊香保付近
    label: '関越自動車道',
  },
  {
    names: ['東北道', '東北自動車道'],
    waypoints: [{ lat: 36.3200, lng: 139.8200 }], // 佐野付近
    label: '東北自動車道',
  },
  {
    names: ['常磐道', '常磐自動車道'],
    waypoints: [{ lat: 35.8300, lng: 139.8700 }], // 三郷JCT付近（常磐道の戦略的接続点）
    label: '常磐自動車道',
  },
  {
    names: ['圏央道', '首都圏中央連絡自動車道'],
    waypoints: [{ lat: 35.5500, lng: 139.3400 }], // 相模原付近
    label: '圏央道',
  },
  {
    names: ['名神', '名神高速', '名神高速道路'],
    waypoints: [{ lat: 35.2500, lng: 136.8600 }], // 名古屋付近
    label: '名神高速',
  },
  {
    names: ['新名神', '新名神高速', '新名神高速道路'],
    waypoints: [{ lat: 34.9500, lng: 136.4000 }], // 亀山付近
    label: '新名神高速',
  },
  {
    names: ['東海環状', '東海環状道', '東海環状自動車道'],
    waypoints: [{ lat: 35.4200, lng: 137.0500 }], // 土岐付近
    label: '東海環状自動車道',
  },
  {
    names: ['北関東道', '北関東自動車道'],
    waypoints: [{ lat: 36.3900, lng: 139.9300 }], // 太田付近
    label: '北関東自動車道',
  },
  {
    names: ['上信越道', '上信越自動車道'],
    waypoints: [{ lat: 36.3300, lng: 138.1800 }], // 軽井沢付近
    label: '上信越自動車道',
  },
  {
    names: ['長野道', '長野自動車道'],
    waypoints: [{ lat: 36.2400, lng: 137.9700 }], // 松本付近
    label: '長野自動車道',
  },
  {
    names: ['北陸道', '北陸自動車道'],
    waypoints: [{ lat: 36.7600, lng: 137.2100 }], // 富山付近
    label: '北陸自動車道',
  },
  {
    names: ['東関東道', '東関東自動車道'],
    waypoints: [{ lat: 35.7700, lng: 140.3200 }], // 成田付近
    label: '東関東自動車道',
  },
  {
    names: ['中央環状', 'C2', '首都高中央環状'],
    waypoints: [{ lat: 35.6900, lng: 139.7100 }], // 新宿付近
    label: '首都高中央環状',
  },
  {
    names: ['第三京浜', '三京'],
    waypoints: [{ lat: 35.5700, lng: 139.5900 }], // 港北付近
    label: '第三京浜',
  },
  {
    names: ['東名川崎', '東名横浜'],
    waypoints: [{ lat: 35.5500, lng: 139.4600 }], // 横浜町田付近
    label: '東名横浜',
  },
  {
    names: ['伊勢湾岸道', '伊勢湾岸', '伊勢湾岸自動車道'],
    waypoints: [{ lat: 35.0300, lng: 136.8500 }], // 東海付近
    label: '伊勢湾岸自動車道',
  },
  {
    names: ['山陽道', '山陽自動車道'],
    waypoints: [{ lat: 34.6700, lng: 133.9200 }], // 岡山付近
    label: '山陽自動車道',
  },

  // === 一般道・旧街道 ===
  {
    names: ['東海道', '国道1号', 'R1'],
    waypoints: [{ lat: 35.1000, lng: 138.8600 }], // 沼津付近（R1）
    label: '東海道（国道1号）',
  },
  {
    names: ['中山道', '国道19号', 'R19', '国道21号', 'R21'],
    waypoints: [{ lat: 35.8500, lng: 137.9400 }], // 木曽付近
    label: '中山道',
  },
  {
    names: ['甲州街道', '国道20号', 'R20'],
    waypoints: [{ lat: 35.6600, lng: 139.0400 }], // 八王子〜相模湖付近
    label: '甲州街道（国道20号）',
  },
  {
    names: ['日光街道', '国道4号', 'R4'],
    waypoints: [{ lat: 36.7500, lng: 139.6000 }], // 日光付近
    label: '日光街道',
  },
  {
    names: ['国道246号', 'R246', '246'],
    waypoints: [{ lat: 35.4500, lng: 139.2500 }], // 秦野付近
    label: '国道246号',
  },
  {
    names: ['国道17号', 'R17', '三国街道'],
    waypoints: [{ lat: 36.3900, lng: 139.0600 }], // 高崎付近
    label: '国道17号',
  },
  {
    names: ['国道16号', 'R16'],
    waypoints: [{ lat: 35.7900, lng: 139.3500 }], // 八王子付近
    label: '国道16号',
  },

  // === ツーリングスポット・エリア ===
  {
    names: ['箱根', '箱根ターンパイク', '箱根峠'],
    waypoints: [{ lat: 35.2329, lng: 139.0270 }], // 箱根
    label: '箱根',
  },
  {
    names: ['伊豆', '伊豆半島', '伊豆スカイライン'],
    waypoints: [{ lat: 34.9700, lng: 139.0700 }], // 伊豆中部
    label: '伊豆',
  },
  {
    names: ['富士五湖', '河口湖', '山中湖'],
    waypoints: [{ lat: 35.5000, lng: 138.7600 }], // 河口湖付近
    label: '富士五湖',
  },
  {
    names: ['富士山', '富士スバルライン'],
    waypoints: [{ lat: 35.3606, lng: 138.7274 }], // 富士山
    label: '富士山',
  },
  {
    names: ['ビーナスライン', 'ヴィーナスライン'],
    waypoints: [{ lat: 36.1100, lng: 138.1800 }], // 霧ヶ峰付近
    label: 'ビーナスライン',
  },
  {
    names: ['志賀草津', '志賀草津道路', '志賀高原', '草津'],
    waypoints: [{ lat: 36.6500, lng: 138.5800 }], // 志賀草津付近
    label: '志賀草津',
  },
  {
    names: ['奥多摩', '奥多摩周遊道路'],
    waypoints: [{ lat: 35.8100, lng: 139.0900 }], // 奥多摩
    label: '奥多摩',
  },
  {
    names: ['秩父', '秩父高原'],
    waypoints: [{ lat: 35.9900, lng: 139.0800 }], // 秩父
    label: '秩父',
  },
  {
    names: ['道志みち', '道志', '国道413号', 'R413'],
    waypoints: [{ lat: 35.5200, lng: 139.0500 }], // 道志付近
    label: '道志みち',
  },
  {
    names: ['芦ノ湖スカイライン', '芦ノ湖'],
    waypoints: [{ lat: 35.2040, lng: 139.0020 }], // 芦ノ湖
    label: '芦ノ湖',
  },
  {
    names: ['伊豆スカ', '伊豆スカイライン'],
    waypoints: [{ lat: 35.0300, lng: 139.0300 }], // 伊豆スカイライン
    label: '伊豆スカイライン',
  },
  {
    names: ['西湘バイパス', '西湘'],
    waypoints: [{ lat: 35.2700, lng: 139.1600 }], // 小田原付近
    label: '西湘バイパス',
  },
  {
    names: ['軽井沢'],
    waypoints: [{ lat: 36.3480, lng: 138.6360 }], // 軽井沢
    label: '軽井沢',
  },
  {
    names: ['日光', '日光いろは坂', 'いろは坂'],
    waypoints: [{ lat: 36.7376, lng: 139.4960 }], // 日光
    label: '日光',
  },
  {
    names: ['那須', '那須高原'],
    waypoints: [{ lat: 37.0200, lng: 139.9600 }], // 那須
    label: '那須高原',
  },
  {
    names: ['磐梯', '磐梯吾妻スカイライン', '磐梯山'],
    waypoints: [{ lat: 37.6000, lng: 140.0700 }], // 磐梯付近
    label: '磐梯吾妻',
  },
  {
    names: ['榛名', '榛名山', '榛名湖'],
    waypoints: [{ lat: 36.4800, lng: 138.8600 }], // 榛名山
    label: '榛名山',
  },
  {
    names: ['赤城', '赤城山'],
    waypoints: [{ lat: 36.5600, lng: 139.1700 }], // 赤城山
    label: '赤城山',
  },
  {
    names: ['渥美半島', '渥美'],
    waypoints: [{ lat: 34.6300, lng: 137.1200 }], // 渥美半島
    label: '渥美半島',
  },
  {
    names: ['知多半島', '知多'],
    waypoints: [{ lat: 34.8300, lng: 136.8600 }], // 知多半島
    label: '知多半島',
  },
];

/** 出発地/目的地との近接フィルタの閾値 (km) */
const PROXIMITY_THRESHOLD_KM = 15;

/**
 * 2点間の距離を簡易計算する (km)
 * Haversine公式
 */
function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** 回避ポリゴンのデフォルト半径 (km) */
const DEFAULT_AVOID_RADIUS_KM = 25;

/** 否定表現パターン（マッチしたら回避エリアとして扱う） */
const NEGATIVE_PATTERNS: RegExp[] = [
  /[をは]通りたくない$/,
  /[をは]通らない$/,
  /[をは]避けて$/,
  /[をは]避けたい$/,
  /[をは]使わない$/,
  /[をは]使いたくない$/,
  /[にへは]行きたくない$/,
  /[をは]やめて$/,
  /[はが]嫌$/,
  /[はが]いや$/,
  /以外$/,
  /なし$/,
  /NG$/i,
];

/** サフィックス除去パターン（肯定表現） */
const SUFFIX_PATTERNS = [
  /経由$/,
  /を通りたい$/,
  /を通って$/,
  /を通る$/,
  /通り$/,
  /沿い$/,
  /ルート$/,
  /がいい$/,
  /がいいな$/,
  /で行きたい$/,
  /で行って$/,
  /方面$/,
  /回り$/,
  /まわり$/,
];

/**
 * テキストをキーワードに分割する
 */
function splitKeywords(text: string): string[] {
  return text
    .split(/[、,，・\s　と]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * サフィックスを除去する
 */
function removeSuffix(keyword: string): string {
  let result = keyword;
  for (const pattern of SUFFIX_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

/**
 * キーワードが否定表現かどうか判定し、否定サフィックスを除去したキーワードを返す
 */
function extractNegative(keyword: string): { isNegative: boolean; cleaned: string } {
  for (const pattern of NEGATIVE_PATTERNS) {
    if (pattern.test(keyword)) {
      const cleaned = keyword.replace(pattern, '').trim();
      return { isNegative: true, cleaned };
    }
  }
  return { isNegative: false, cleaned: keyword };
}

/**
 * 中心座標から円形ポリゴンを生成する（[lng, lat][] 形式）
 */
export function generateCirclePolygon(
  center: LatLng,
  radiusKm: number,
  numPoints: number = 16
): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    const dLat = (radiusKm / 111.32) * Math.cos(angle);
    const dLng =
      (radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angle);
    coords.push([center.lng + dLng, center.lat + dLat]);
  }
  return coords;
}

/**
 * 辞書からキーワードを検索
 * 優先順位: 完全一致 > 部分一致（最長マッチ名を優先）
 *
 * 「新東名」で「東名」が先にヒットする問題を防ぐため、
 * 完全一致を最優先し、部分一致はマッチした名前が最も長いエントリを選ぶ。
 */
function findInDictionary(keyword: string): RouteKeyword | null {
  const cleaned = removeSuffix(keyword);
  if (!cleaned) return null;

  // 1. 完全一致
  for (const entry of ROUTE_KEYWORDS) {
    for (const name of entry.names) {
      if (name === cleaned) {
        return entry;
      }
    }
  }

  // 2. 部分一致: キーワードに名前が含まれるケース（「新東名経由」→「新東名」）
  //    最長マッチを優先（「東名」より「新東名」を優先）
  let bestMatch: RouteKeyword | null = null;
  let bestMatchLength = 0;
  for (const entry of ROUTE_KEYWORDS) {
    for (const name of entry.names) {
      if (cleaned.includes(name) && name.length > bestMatchLength) {
        bestMatch = entry;
        bestMatchLength = name.length;
      }
    }
  }
  if (bestMatch) return bestMatch;

  // 3. 部分一致: 名前にキーワードが含まれるケース（「東名」→「東名高速」）
  //    最短名を優先（「東名高速」と「新東名高速」の両方がヒットする場合、短い方）
  let shortestMatch: RouteKeyword | null = null;
  let shortestNameLength = Infinity;
  for (const entry of ROUTE_KEYWORDS) {
    for (const name of entry.names) {
      if (name.includes(cleaned) && name.length < shortestNameLength) {
        shortestMatch = entry;
        shortestNameLength = name.length;
      }
    }
  }

  return shortestMatch;
}

/**
 * 出発地→目的地の軸上にウェイポイントを射影してソートする
 */
function sortWaypointsByProjection(
  waypoints: Waypoint[],
  origin: LatLng,
  destination: LatLng
): Waypoint[] {
  const dx = destination.lng - origin.lng;
  const dy = destination.lat - origin.lat;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return waypoints;

  return [...waypoints].sort((a, b) => {
    const projA =
      ((a.position.lat - origin.lat) * dy + (a.position.lng - origin.lng) * dx) / lenSq;
    const projB =
      ((b.position.lat - origin.lat) * dy + (b.position.lng - origin.lng) * dx) / lenSq;
    return projA - projB;
  });
}

/**
 * 自然言語ルート要望テキストを経由地ウェイポイント＋回避エリアに変換する
 *
 * 1. テキストから否定表現を検出 → 回避エリアとして処理
 * 2. 肯定表現 → 経由地ウェイポイントとして処理（既存ロジック）
 * 3. 辞書にない場合はジオコードフォールバック
 * 4. 手動経由地とマージし、出発地→目的地の軸でソート
 */
export async function resolveRoutePreference(
  text: string,
  origin: LatLng,
  destination: LatLng,
  existingWaypoints: Waypoint[]
): Promise<RoutePreferenceResult> {
  const trimmed = text.trim();
  if (!trimmed) return { waypoints: existingWaypoints, avoidAreas: [] };

  const keywords = splitKeywords(trimmed);
  const resolvedWaypoints: Waypoint[] = [];
  const avoidAreas: AvoidArea[] = [];

  for (const keyword of keywords) {
    // 否定表現チェック
    const { isNegative, cleaned: negCleaned } = extractNegative(keyword);

    if (isNegative) {
      // 否定 → 回避エリアとして解決
      const cleanedKeyword = removeSuffix(negCleaned);
      const entry = findInDictionary(negCleaned);
      if (entry) {
        for (const wp of entry.waypoints) {
          avoidAreas.push({
            center: wp,
            radiusKm: DEFAULT_AVOID_RADIUS_KM,
            label: entry.label,
          });
        }
      } else if (cleanedKeyword.length >= 2) {
        const results = await geocodeSearch(cleanedKeyword);
        if (results.length > 0) {
          avoidAreas.push({
            center: { lat: results[0].lat, lng: results[0].lng },
            radiusKm: DEFAULT_AVOID_RADIUS_KM,
            label: results[0].label,
          });
        }
      }
    } else {
      // 肯定 → 経由地ウェイポイントとして解決
      const entry = findInDictionary(keyword);
      if (entry) {
        for (const wp of entry.waypoints) {
          resolvedWaypoints.push({ position: wp, label: entry.label });
        }
      } else {
        const cleaned = removeSuffix(keyword);
        if (cleaned.length >= 2) {
          const results = await geocodeSearch(cleaned);
          if (results.length > 0) {
            resolvedWaypoints.push({
              position: { lat: results[0].lat, lng: results[0].lng },
              label: results[0].label,
            });
          }
        }
      }
    }
  }

  // 経由地の処理
  let finalWaypoints: Waypoint[];
  if (resolvedWaypoints.length === 0) {
    finalWaypoints = existingWaypoints;
  } else {
    // 出発地・目的地に近すぎるウェイポイントを除外
    const filtered = resolvedWaypoints.filter((wp) => {
      const distFromOrigin = haversineDistance(wp.position, origin);
      const distFromDest = haversineDistance(wp.position, destination);
      return distFromOrigin >= PROXIMITY_THRESHOLD_KM && distFromDest >= PROXIMITY_THRESHOLD_KM;
    });

    if (filtered.length === 0) {
      finalWaypoints = existingWaypoints;
    } else {
      const validExisting = existingWaypoints.filter(
        (wp) => wp.position.lat !== 0 || wp.position.lng !== 0
      );
      finalWaypoints = sortWaypointsByProjection(
        [...filtered, ...validExisting],
        origin,
        destination
      );
    }
  }

  return { waypoints: finalWaypoints, avoidAreas };
}
