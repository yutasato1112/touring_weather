import { LatLng, Waypoint, BaseRouteType } from '@/types';

export type NavService = 'google' | 'apple' | 'yahoo';

/** ウェイポイントを最大数に間引く */
function thinWaypoints(waypoints: LatLng[], maxCount: number): LatLng[] {
  if (waypoints.length <= maxCount) return waypoints;
  const result: LatLng[] = [];
  for (let i = 0; i < maxCount; i++) {
    const index = Math.round((i * (waypoints.length - 1)) / (maxCount - 1));
    result.push(waypoints[index]);
  }
  return result;
}

/** ジオメトリを等間隔サンプリングして中間ウェイポイントを抽出（始点・終点除外） */
export function sampleGeometryWaypoints(
  geometry: [number, number][],
  maxPoints: number
): LatLng[] {
  if (geometry.length < 3 || maxPoints <= 0) return [];
  // 始点・終点を除いた内部ポイントから等間隔で選ぶ
  const step = geometry.length / (maxPoints + 1);
  const result: LatLng[] = [];
  for (let i = 1; i <= maxPoints; i++) {
    const idx = Math.min(Math.round(step * i), geometry.length - 2);
    const [lng, lat] = geometry[idx];
    result.push({ lat, lng });
  }
  return result;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export interface NavigationUrlOptions {
  routeType?: BaseRouteType;
  geometry?: [number, number][];
}

export function generateNavigationUrl(
  service: NavService,
  origin: LatLng,
  destination: LatLng,
  waypoints: Waypoint[],
  options?: NavigationUrlOptions
): string {
  const userWp = waypoints.map((w) => w.position);

  switch (service) {
    case 'google': {
      // Google Maps: 最大8経由地（ユーザー経由地優先、残り枠でジオメトリサンプル）
      const MAX_GOOGLE_WP = 8;
      const geoSamples = options?.geometry
        ? sampleGeometryWaypoints(options.geometry, Math.max(0, MAX_GOOGLE_WP - userWp.length))
        : [];
      const allWp = [...userWp, ...geoSamples].slice(0, MAX_GOOGLE_WP);

      // URLSearchParams は | を %7C にエンコードするため手動で組み立て
      const parts = [
        'api=1',
        `origin=${origin.lat},${origin.lng}`,
        `destination=${destination.lat},${destination.lng}`,
        'travelmode=driving',
      ];

      // ルート種別 → avoid パラメータ（カンマ区切り、公式ドキュメント準拠）
      if (options?.routeType === 'no_highway') {
        parts.push('avoid=tolls,highways');
      } else if (options?.routeType === 'scenic') {
        parts.push('avoid=highways');
      }

      if (allWp.length > 0) {
        parts.push('waypoints=' + allWp.map((p) => `${p.lat},${p.lng}`).join('|'));
      }
      return `https://www.google.com/maps/dir/?${parts.join('&')}`;
    }

    case 'apple': {
      // Apple Maps: 経由地非対応、変更なし
      const base = isIOS() ? 'maps://' : 'https://maps.apple.com/';
      const params = new URLSearchParams({
        saddr: `${origin.lat},${origin.lng}`,
        daddr: `${destination.lat},${destination.lng}`,
        dirflg: 'd',
      });
      return `${base}?${params.toString()}`;
    }

    case 'yahoo': {
      // Yahoo!カーナビ: 最大3経由地（ユーザー経由地優先、残り枠でジオメトリサンプル）
      const MAX_YAHOO_WP = 3;
      const yahooGeoSamples = options?.geometry
        ? sampleGeometryWaypoints(options.geometry, Math.max(0, MAX_YAHOO_WP - userWp.length))
        : [];
      const yahooAllWp = [...userWp, ...yahooGeoSamples].slice(0, MAX_YAHOO_WP);
      const thinned = thinWaypoints(yahooAllWp, MAX_YAHOO_WP);
      const points = [
        'current',
        ...thinned.map((p) => `${p.lat},${p.lng},`),
        `${destination.lat},${destination.lng},`,
      ];
      const params = points.map((p) => `point=${p}`).join('&');
      return `yjcarnavi://navi/select?${params}`;
    }
  }
}
