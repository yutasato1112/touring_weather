/** 緯度経度 */
export interface LatLng {
  lat: number;
  lng: number;
}

/** ORS経路計算に使う基本ルート種別 */
export type BaseRouteType = 'fastest' | 'no_highway' | 'scenic';

/** ルート種別（雨回避を含む） */
export type RouteType = BaseRouteType | 'rain_avoid';

/** ルート種別のラベル */
export const ROUTE_TYPE_LABELS: Record<RouteType, string> = {
  fastest: '最速ルート',
  no_highway: '一般道ルート',
  scenic: 'ワインディング',
  rain_avoid: '雨回避ルート',
};

/** ルート種別の色 */
export const ROUTE_TYPE_COLORS: Record<RouteType, string> = {
  fastest: '#3b82f6',
  no_highway: '#10b981',
  scenic: '#f59e0b',
  rain_avoid: '#8b5cf6',
};

/** 渋滞レベル（Apple Maps準拠: 順調 / 混雑 / 渋滞） */
export type CongestionLevel = 'normal' | 'congested' | 'heavy';

/** 経由地 */
export interface Waypoint {
  position: LatLng;
  label: string;
}

/** 経路上の通過ポイント */
export interface RoutePoint {
  position: LatLng;
  /** 出発地からの距離 (km) */
  distanceFromStart: number;
  /** 到達予定時刻 (ISO 8601) */
  estimatedArrival: string;
  /** 渋滞レベル */
  congestionLevel?: CongestionLevel;
}

/** 天気情報 */
export interface WeatherData {
  /** 気温 (°C) */
  temperature: number;
  /** 降水確率 (%) */
  precipitationProbability: number;
  /** 風速 (km/h) */
  windSpeed: number;
  /** WMO Weather Code */
  weatherCode: number;
  /** 天気の説明 */
  weatherDescription: string;
}

/** 経路ポイント + 天気 */
export interface RouteWeatherPoint {
  point: RoutePoint;
  weather: WeatherData | null;
  /** 地点名（県名・市区町村名） */
  locationName?: string;
}

/** 経路全体の情報 */
export interface RouteInfo {
  /** 経路のジオメトリ [lng, lat][] */
  geometry: [number, number][];
  /** 総距離 (km) */
  totalDistance: number;
  /** 総所要時間 (秒) */
  totalDuration: number;
  /** 渋滞考慮後の所要時間 (秒) */
  adjustedDuration?: number;
  /** 累積標高 (m) */
  elevationGain?: number;
}

/** ルート種別付き経路情報 */
export interface RouteInfoWithType extends RouteInfo {
  routeType: RouteType;
  /** 雨回避ルートの場合、元のルート種別 */
  baseRouteType?: BaseRouteType;
  /** 雨スコア（低いほど良い） */
  rainScore?: number;
}

/** マルチルート結果 */
export interface MultiRouteResult {
  fastest: RouteInfoWithType | null;
  no_highway: RouteInfoWithType | null;
  scenic: RouteInfoWithType | null;
  rain_avoid: RouteInfoWithType | null;
}

/** ルート推薦マッピング（各タブが実際にどのベースルートを表示するか） */
export interface RouteRecommendation {
  /** 全体で最速のルート */
  fastest: BaseRouteType;
  /** 一般道系で最速（'no_highway' | 'scenic'） */
  no_highway: BaseRouteType;
}

/** 渋滞区間セグメント（地図上の色分け用） */
export interface CongestionSegment {
  /** セグメントの座標列 [lat, lng][] (Leaflet形式) */
  positions: [number, number][];
  /** 渋滞レベル */
  level: CongestionLevel;
}

/** 検索フォームの入力値 */
export interface SearchInput {
  origin: LatLng | null;
  destination: LatLng | null;
  originText: string;
  destinationText: string;
  departureTime: string;
  waypoints: Waypoint[];
}
