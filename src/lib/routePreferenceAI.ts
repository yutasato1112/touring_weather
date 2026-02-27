import { LatLng, Waypoint, RouteCharacteristics } from '@/types';
import { RoutePreferenceResult, resolveRoutePreference } from '@/lib/routePreference';

export interface AIRoutePreferenceResult extends RoutePreferenceResult {
  routeCharacteristics?: RouteCharacteristics;
  /** AIで解析されたか（false = 辞書フォールバック） */
  isAIParsed: boolean;
}

/**
 * AI（GPT-4o-mini）を使ってルート希望テキストを解析する。
 * API未設定・エラー時は既存の辞書パーサーにフォールバック。
 */
export async function resolveRoutePreferenceAI(
  text: string,
  origin: LatLng,
  destination: LatLng,
  existingWaypoints: Waypoint[]
): Promise<AIRoutePreferenceResult> {
  try {
    const response = await fetch('/api/parse-route-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        origin,
        destination,
        existingWaypoints,
      }),
    });

    // 501 = APIキー未設定 → フォールバック
    if (response.status === 501) {
      const result = await resolveRoutePreference(text, origin, destination, existingWaypoints);
      return { ...result, isAIParsed: false };
    }

    // その他のエラー → フォールバック
    if (!response.ok) {
      const result = await resolveRoutePreference(text, origin, destination, existingWaypoints);
      return { ...result, isAIParsed: false };
    }

    const data = await response.json();

    // fallbackフラグが返された場合
    if (data.fallback) {
      const result = await resolveRoutePreference(text, origin, destination, existingWaypoints);
      return { ...result, isAIParsed: false };
    }

    return {
      waypoints: data.waypoints || existingWaypoints,
      avoidAreas: data.avoidAreas || [],
      isLoop: data.isLoop,
      loopLabel: data.loopLabel,
      routeCharacteristics: data.routeCharacteristics,
      isAIParsed: true,
    };
  } catch {
    // ネットワークエラー等 → フォールバック
    const result = await resolveRoutePreference(text, origin, destination, existingWaypoints);
    return { ...result, isAIParsed: false };
  }
}
