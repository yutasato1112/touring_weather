import { LatLng, Waypoint, AvoidArea } from '@/types';
import { geocodeSearch } from '@/lib/geocode';

/** resolveRoutePreference の戻り値 */
export interface RoutePreferenceResult {
  waypoints: Waypoint[];
  avoidAreas: AvoidArea[];
  /** 周回ルートかどうか */
  isLoop?: boolean;
  /** 周回ラベル（例: "琵琶湖一周"） */
  loopLabel?: string;
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
    waypoints: [
      { lat: 35.4590, lng: 139.4430 }, // 横浜町田IC付近
      { lat: 34.9740, lng: 138.3890 }, // 静岡IC付近
      { lat: 35.0820, lng: 137.1580 }, // 豊田JCT付近
    ],
    label: '東名高速',
  },
  {
    names: ['新東名', '新東名高速', '新東名高速道路'],
    waypoints: [
      { lat: 35.3700, lng: 139.2600 }, // 厚木南IC付近
      { lat: 35.0100, lng: 138.3200 }, // 新静岡IC付近
      { lat: 34.9400, lng: 137.5600 }, // 浜松いなさJCT付近
    ],
    label: '新東名高速',
  },
  {
    names: ['中央道', '中央自動車道', '中央高速'],
    waypoints: [
      { lat: 35.6560, lng: 139.3190 }, // 八王子JCT付近
      { lat: 35.6200, lng: 138.5100 }, // 甲府昭和IC付近
      { lat: 35.5100, lng: 137.8200 }, // 飯田IC付近
    ],
    label: '中央自動車道',
  },
  {
    names: ['関越', '関越道', '関越自動車道'],
    waypoints: [
      { lat: 35.9320, lng: 139.3930 }, // 鶴ヶ島JCT付近
      { lat: 36.4900, lng: 139.0100 }, // 渋川伊香保IC付近
      { lat: 36.9300, lng: 138.8100 }, // 湯沢IC付近
    ],
    label: '関越自動車道',
  },
  {
    names: ['東北道', '東北自動車道'],
    waypoints: [
      { lat: 36.3200, lng: 139.7800 }, // 佐野SA付近
      { lat: 36.5600, lng: 139.8800 }, // 宇都宮IC付近
      { lat: 37.0200, lng: 140.0200 }, // 那須IC付近
    ],
    label: '東北自動車道',
  },
  {
    names: ['常磐道', '常磐自動車道'],
    waypoints: [
      { lat: 35.8300, lng: 139.8700 }, // 三郷JCT付近
      { lat: 36.0800, lng: 140.1100 }, // つくばJCT付近
      { lat: 36.3700, lng: 140.4500 }, // 水戸IC付近
    ],
    label: '常磐自動車道',
  },
  {
    names: ['圏央道', '首都圏中央連絡自動車道'],
    waypoints: [{ lat: 35.5500, lng: 139.3400 }], // 相模原付近
    label: '圏央道',
  },
  {
    names: ['名神', '名神高速', '名神高速道路'],
    waypoints: [
      { lat: 35.2600, lng: 136.9400 }, // 小牧JCT付近
      { lat: 35.3700, lng: 136.4700 }, // 関ヶ原IC付近
      { lat: 34.9600, lng: 135.7600 }, // 京都南IC付近
    ],
    label: '名神高速',
  },
  {
    names: ['新名神', '新名神高速', '新名神高速道路'],
    waypoints: [
      { lat: 34.8600, lng: 136.3700 }, // 亀山JCT付近
      { lat: 34.9200, lng: 136.1800 }, // 甲南IC付近
    ],
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
    waypoints: [
      { lat: 36.2500, lng: 139.0700 }, // 藤岡JCT付近
      { lat: 36.3300, lng: 138.6300 }, // 軽井沢IC付近
      { lat: 36.6300, lng: 138.2100 }, // 長野IC付近
    ],
    label: '上信越自動車道',
  },
  {
    names: ['長野道', '長野自動車道'],
    waypoints: [{ lat: 36.2400, lng: 137.9700 }], // 松本付近
    label: '長野自動車道',
  },
  {
    names: ['北陸道', '北陸自動車道'],
    waypoints: [
      { lat: 35.3800, lng: 136.2700 }, // 米原JCT付近
      { lat: 36.0600, lng: 136.2200 }, // 福井IC付近
      { lat: 36.7000, lng: 137.2100 }, // 富山IC付近
    ],
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
    waypoints: [
      { lat: 35.0500, lng: 137.0600 }, // 豊田東JCT付近
      { lat: 35.0100, lng: 136.8700 }, // 東海IC付近
    ],
    label: '伊勢湾岸自動車道',
  },
  {
    names: ['山陽道', '山陽自動車道'],
    waypoints: [
      { lat: 34.8000, lng: 135.1000 }, // 神戸JCT付近
      { lat: 34.6700, lng: 133.9200 }, // 岡山IC付近
      { lat: 34.4500, lng: 132.4600 }, // 広島IC付近
    ],
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
export const PROXIMITY_THRESHOLD_KM = 15;

/**
 * 2点間の距離を簡易計算する (km)
 * Haversine公式
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
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

/** 回避ポリゴンのデフォルト半径 (km)
 * Valhalla の exclude_polygons 周長上限は 100km → 半径 ≈ 15.9km */
export const DEFAULT_AVOID_RADIUS_KM = 15;

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

// === 周回ルート ===

/** 周回意図を検出するパターン */
const LOOP_PATTERNS: RegExp[] = [
  /[をの]?一周したい$/,
  /[をの]?一周して$/,
  /[をの]?一周$/,
  /[をの]?1周$/,
  /[をの]?周遊$/,
  /[をの]?周回$/,
  /[をの]?ぐるっと(回りたい|一周|回って)?$/,
  /[をの]?(まわりたい|回りたい)$/,
  /(一周|周遊|周回)(コース|ルート)$/,
];

/** 周回ロケーション定義 */
export interface LoopLocation {
  names: string[];
  center: LatLng;
  /** 円形生成用の半径 (km) — perimeterPoints がある場合は不要 */
  radiusKm?: number;
  /** 手動定義の周囲ポイント（不規則な形状用） */
  perimeterPoints?: LatLng[];
  /** 円形生成時の経由地数（デフォルト 6） */
  numPoints?: number;
  label: string;
}

export const LOOP_LOCATIONS: LoopLocation[] = [
  // --- 湖 ---
  {
    names: ['琵琶湖', 'びわ湖', 'びわこ', 'ビワイチ'],
    center: { lat: 35.25, lng: 136.10 },
    perimeterPoints: [
      { lat: 35.00, lng: 135.90 },  // 南西（大津）
      { lat: 35.15, lng: 136.05 },  // 南東（草津）
      { lat: 35.30, lng: 136.20 },  // 東（近江八幡）
      { lat: 35.45, lng: 136.25 },  // 北東（彦根）
      { lat: 35.55, lng: 136.15 },  // 北（長浜）
      { lat: 35.50, lng: 136.00 },  // 北西（マキノ）
      { lat: 35.35, lng: 135.95 },  // 西（高島）
      { lat: 35.20, lng: 135.90 },  // 南西（堅田）
      { lat: 35.05, lng: 135.87 },  // 南（大津港）
    ],
    label: '琵琶湖一周',
  },
  {
    names: ['霞ヶ浦', 'かすみがうら', '霞ケ浦'],
    center: { lat: 36.03, lng: 140.40 },
    perimeterPoints: [
      { lat: 36.08, lng: 140.22 },  // 西（土浦）
      { lat: 36.13, lng: 140.35 },  // 北西（かすみがうら）
      { lat: 36.12, lng: 140.50 },  // 北東（行方）
      { lat: 36.00, lng: 140.55 },  // 東（潮来）
      { lat: 35.93, lng: 140.45 },  // 南東（稲敷）
      { lat: 35.95, lng: 140.30 },  // 南（美浦）
      { lat: 36.02, lng: 140.20 },  // 南西（阿見）
    ],
    label: '霞ヶ浦一周',
  },
  {
    names: ['浜名湖', 'はまなこ'],
    center: { lat: 34.75, lng: 137.58 },
    perimeterPoints: [
      { lat: 34.72, lng: 137.52 },  // 南西
      { lat: 34.78, lng: 137.52 },  // 北西（三ケ日）
      { lat: 34.80, lng: 137.58 },  // 北
      { lat: 34.78, lng: 137.65 },  // 北東
      { lat: 34.72, lng: 137.64 },  // 東（舘山寺）
      { lat: 34.68, lng: 137.58 },  // 南
    ],
    label: '浜名湖一周',
  },
  {
    names: ['山中湖', 'やまなかこ'],
    center: { lat: 35.41, lng: 138.87 },
    radiusKm: 3,
    numPoints: 6,
    label: '山中湖一周',
  },
  {
    names: ['河口湖', 'かわぐちこ'],
    center: { lat: 35.51, lng: 138.75 },
    radiusKm: 3.5,
    numPoints: 6,
    label: '河口湖一周',
  },
  {
    names: ['諏訪湖', 'すわこ'],
    center: { lat: 36.05, lng: 138.08 },
    radiusKm: 4,
    numPoints: 6,
    label: '諏訪湖一周',
  },
  {
    names: ['十和田湖', 'とわだこ'],
    center: { lat: 40.46, lng: 140.87 },
    radiusKm: 6,
    numPoints: 6,
    label: '十和田湖一周',
  },
  {
    names: ['洞爺湖', 'とうやこ'],
    center: { lat: 42.60, lng: 140.85 },
    radiusKm: 5,
    numPoints: 6,
    label: '洞爺湖一周',
  },
  {
    names: ['中禅寺湖', 'ちゅうぜんじこ'],
    center: { lat: 36.74, lng: 139.48 },
    radiusKm: 3.5,
    numPoints: 6,
    label: '中禅寺湖一周',
  },
  // --- 山 ---
  {
    names: ['富士山', 'ふじさん'],
    center: { lat: 35.3606, lng: 138.7274 },
    perimeterPoints: [
      { lat: 35.22, lng: 138.62 },  // 南西（富士宮）
      { lat: 35.22, lng: 138.80 },  // 南東（御殿場）
      { lat: 35.35, lng: 138.90 },  // 東（須走）
      { lat: 35.48, lng: 138.85 },  // 北東（山中湖）
      { lat: 35.50, lng: 138.70 },  // 北（河口湖）
      { lat: 35.42, lng: 138.58 },  // 北西（精進湖）
      { lat: 35.30, lng: 138.55 },  // 西（白糸の滝）
    ],
    label: '富士山一周',
  },
  {
    names: ['阿蘇', '阿蘇山', 'あそさん'],
    center: { lat: 32.88, lng: 131.10 },
    perimeterPoints: [
      { lat: 32.80, lng: 131.00 },  // 南西
      { lat: 32.80, lng: 131.20 },  // 南東
      { lat: 32.92, lng: 131.25 },  // 東
      { lat: 33.00, lng: 131.15 },  // 北東
      { lat: 33.00, lng: 131.00 },  // 北西
      { lat: 32.90, lng: 130.95 },  // 西
    ],
    label: '阿蘇山一周',
  },
  // --- 半島・島 ---
  {
    names: ['三浦半島', 'みうらはんとう'],
    center: { lat: 35.22, lng: 139.65 },
    perimeterPoints: [
      { lat: 35.32, lng: 139.62 },  // 北西（鎌倉）
      { lat: 35.25, lng: 139.58 },  // 西（逗子）
      { lat: 35.15, lng: 139.60 },  // 南西（葉山）
      { lat: 35.13, lng: 139.62 },  // 南（三崎）
      { lat: 35.15, lng: 139.70 },  // 南東（城ヶ島）
      { lat: 35.23, lng: 139.73 },  // 東（横須賀）
      { lat: 35.33, lng: 139.70 },  // 北東（金沢八景）
    ],
    label: '三浦半島一周',
  },
  {
    names: ['房総半島', 'ぼうそうはんとう', '房総'],
    center: { lat: 35.10, lng: 140.00 },
    perimeterPoints: [
      { lat: 35.35, lng: 139.95 },  // 北西（木更津）
      { lat: 35.15, lng: 139.85 },  // 西（鋸山）
      { lat: 34.95, lng: 139.85 },  // 南西（館山）
      { lat: 34.92, lng: 140.00 },  // 南（白浜）
      { lat: 35.05, lng: 140.20 },  // 東（勝浦）
      { lat: 35.25, lng: 140.35 },  // 北東（九十九里）
      { lat: 35.40, lng: 140.10 },  // 北（千葉）
    ],
    label: '房総半島一周',
  },
  {
    names: ['伊豆半島', '伊豆一周'],
    center: { lat: 34.90, lng: 139.00 },
    perimeterPoints: [
      { lat: 35.10, lng: 139.08 },  // 北東（熱海）
      { lat: 34.97, lng: 139.10 },  // 東（伊東）
      { lat: 34.82, lng: 139.10 },  // 東南（下田東）
      { lat: 34.68, lng: 138.95 },  // 南（石廊崎）
      { lat: 34.78, lng: 138.85 },  // 西（松崎）
      { lat: 34.90, lng: 138.85 },  // 北西（土肥）
      { lat: 35.05, lng: 138.93 },  // 北（修善寺）
    ],
    label: '伊豆半島一周',
  },
  {
    names: ['淡路島', 'あわじしま'],
    center: { lat: 34.35, lng: 134.85 },
    perimeterPoints: [
      { lat: 34.60, lng: 134.90 },  // 北東（岩屋）
      { lat: 34.45, lng: 134.95 },  // 東（洲本）
      { lat: 34.25, lng: 134.90 },  // 南東
      { lat: 34.15, lng: 134.80 },  // 南（南あわじ）
      { lat: 34.25, lng: 134.75 },  // 南西
      { lat: 34.40, lng: 134.75 },  // 西
      { lat: 34.55, lng: 134.80 },  // 北西
    ],
    label: '淡路島一周',
  },
];

/**
 * キーワードから周回意図を抽出する
 */
function extractLoopIntent(keyword: string): { isLoop: boolean; cleaned: string } {
  for (const pattern of LOOP_PATTERNS) {
    if (pattern.test(keyword)) {
      const cleaned = keyword.replace(pattern, '').trim();
      return { isLoop: true, cleaned };
    }
  }
  return { isLoop: false, cleaned: keyword };
}

/**
 * テキスト全体に周回意図があるかどうか（SearchPanel用）
 */
export function hasLoopIntent(text: string): boolean {
  if (!text.trim()) return false;
  const keywords = splitKeywords(text.trim());
  return keywords.some((kw) => extractLoopIntent(kw).isLoop);
}

/**
 * 中心座標から等間隔の円形経由地を生成する
 */
export function generateCircularWaypoints(
  center: LatLng,
  radiusKm: number,
  numPoints: number = 6
): LatLng[] {
  const points: LatLng[] = [];
  for (let i = 0; i < numPoints; i++) {
    // 北（0°）から時計回り
    const angle = (2 * Math.PI * i) / numPoints - Math.PI / 2;
    const dLat = (radiusKm / 111.32) * Math.sin(angle);
    const dLng =
      (radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))) * Math.cos(angle);
    points.push({ lat: center.lat + dLat, lng: center.lng + dLng });
  }
  return points;
}

/**
 * 2点間の方位角を計算する (度)
 */
function bearing(from: LatLng, to: LatLng): number {
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * origin に最も近い周囲点を起点として、進入方向に自然な順序で並べる
 */
export function orderPerimeterFromOrigin(
  perimeterPoints: LatLng[],
  origin: LatLng
): LatLng[] {
  if (perimeterPoints.length <= 1) return perimeterPoints;

  // origin に最も近い点を見つける
  let closestIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < perimeterPoints.length; i++) {
    const d = haversineDistance(origin, perimeterPoints[i]);
    if (d < minDist) {
      minDist = d;
      closestIdx = i;
    }
  }

  const n = perimeterPoints.length;

  // 時計回りと反時計回りの最初のポイントへの方位角を比較
  const cwIdx = (closestIdx + 1) % n;
  const ccwIdx = (closestIdx - 1 + n) % n;

  const approachBearing = bearing(origin, perimeterPoints[closestIdx]);
  const cwBearing = bearing(perimeterPoints[closestIdx], perimeterPoints[cwIdx]);
  const ccwBearing = bearing(perimeterPoints[closestIdx], perimeterPoints[ccwIdx]);

  // 進入方向からの転角が小さい方を選ぶ（自然なカーブ）
  const cwTurn = Math.abs(((cwBearing - approachBearing + 540) % 360) - 180);
  const ccwTurn = Math.abs(((ccwBearing - approachBearing + 540) % 360) - 180);

  const clockwise = cwTurn <= ccwTurn;

  const ordered: LatLng[] = [];
  for (let i = 0; i < n; i++) {
    const idx = clockwise
      ? (closestIdx + i) % n
      : (closestIdx - i + n) % n;
    ordered.push(perimeterPoints[idx]);
  }

  return ordered;
}

/**
 * 周回辞書からロケーションを検索する
 */
export function findLoopLocation(keyword: string): LoopLocation | null {
  // 完全一致
  for (const loc of LOOP_LOCATIONS) {
    for (const name of loc.names) {
      if (name === keyword) return loc;
    }
  }
  // 部分一致（キーワードに名前が含まれる: 最長マッチ優先）
  let bestMatch: LoopLocation | null = null;
  let bestLen = 0;
  for (const loc of LOOP_LOCATIONS) {
    for (const name of loc.names) {
      if (keyword.includes(name) && name.length > bestLen) {
        bestMatch = loc;
        bestLen = name.length;
      }
    }
  }
  if (bestMatch) return bestMatch;
  // 部分一致（名前にキーワードが含まれる: 最短名優先）
  let shortMatch: LoopLocation | null = null;
  let shortLen = Infinity;
  for (const loc of LOOP_LOCATIONS) {
    for (const name of loc.names) {
      if (name.includes(keyword) && name.length < shortLen) {
        shortMatch = loc;
        shortLen = name.length;
      }
    }
  }
  return shortMatch;
}

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
 * ウェイポイント配列を origin→destination 軸への射影でフィルタする。
 * 射影値が -0.1〜1.1 の範囲（ルート区間内＋少しマージン）にあるものだけを残す。
 * 高速道路の複数ウェイポイントから、出発地→目的地の区間に該当するものだけを選ぶ。
 */
export function filterWaypointsByAxis(
  waypoints: LatLng[],
  origin: LatLng,
  destination: LatLng
): LatLng[] {
  const dx = destination.lng - origin.lng;
  const dy = destination.lat - origin.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return waypoints;

  return waypoints.filter((wp) => {
    const proj = ((wp.lat - origin.lat) * dy + (wp.lng - origin.lng) * dx) / lenSq;
    return proj >= -0.1 && proj <= 1.1;
  });
}

/**
 * 高速道路名から辞書のマルチポイントウェイポイントを返す。
 * findInDictionary() と同じ名前照合ロジック（完全一致→最長部分一致→最短名部分一致）を使用。
 * origin/destination が渡された場合、ルート区間内のウェイポイントのみに絞り込む。
 * マッチした場合は LatLng[] を返し、マッチしない場合は null を返す。
 */
export function expandHighwayWaypoints(
  placeName: string,
  origin?: LatLng,
  destination?: LatLng
): LatLng[] | null {
  const entry = findInDictionary(placeName);
  if (!entry) return null;
  if (origin && destination && entry.waypoints.length > 1) {
    const filtered = filterWaypointsByAxis(entry.waypoints, origin, destination);
    return filtered.length > 0 ? filtered : entry.waypoints.slice(0, 1);
  }
  return entry.waypoints;
}

/**
 * 出発地→目的地の軸上にウェイポイントを射影してソートする
 */
export function sortWaypointsByProjection(
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
  let isLoop = false;
  let loopLabel: string | undefined;

  for (const keyword of keywords) {
    // 1. 周回意図チェック（否定/肯定より先に判定）
    const { isLoop: loopDetected, cleaned: loopCleaned } = extractLoopIntent(keyword);

    if (loopDetected && loopCleaned.length >= 1) {
      isLoop = true;

      // 周回辞書を検索
      const loopLoc = findLoopLocation(loopCleaned);
      if (loopLoc) {
        loopLabel = loopLoc.label;
        let perimeter: LatLng[];
        if (loopLoc.perimeterPoints) {
          perimeter = loopLoc.perimeterPoints;
        } else {
          perimeter = generateCircularWaypoints(
            loopLoc.center,
            loopLoc.radiusKm || 10,
            loopLoc.numPoints || 6
          );
        }
        const ordered = orderPerimeterFromOrigin(perimeter, origin);
        for (const pt of ordered) {
          resolvedWaypoints.push({ position: pt, label: loopLoc.label });
        }
      } else if (loopCleaned.length >= 2) {
        // ジオコードフォールバック
        const results = await geocodeSearch(loopCleaned);
        if (results.length > 0) {
          loopLabel = `${results[0].name || loopCleaned}一周`;
          const center = { lat: results[0].lat, lng: results[0].lng };
          const perimeter = generateCircularWaypoints(center, 10, 6);
          const ordered = orderPerimeterFromOrigin(perimeter, origin);
          for (const pt of ordered) {
            resolvedWaypoints.push({ position: pt, label: loopLabel });
          }
        }
      }
      continue;
    }

    // 2. 否定表現チェック
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
        // 複数ウェイポイントの場合、origin→destination 区間内のものだけに絞る
        const wps = entry.waypoints.length > 1
          ? filterWaypointsByAxis(entry.waypoints, origin, destination)
          : entry.waypoints;
        const effectiveWps = wps.length > 0 ? wps : entry.waypoints.slice(0, 1);
        for (const wp of effectiveWps) {
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
  } else if (isLoop) {
    // 周回ルート: 周回経由地はorderPerimeterFromOriginで並べ済みなのでそのまま使う
    // 近接フィルタは適用しない（周回ポイントは出発地付近にあることが多い）
    const validExisting = existingWaypoints.filter(
      (wp) => wp.position.lat !== 0 || wp.position.lng !== 0
    );
    finalWaypoints = [...resolvedWaypoints, ...validExisting];
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

  return { waypoints: finalWaypoints, avoidAreas, isLoop, loopLabel };
}
