'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { SearchInput, RouteInfo, RoutePoint, RouteWeatherPoint, RouteType, BaseRouteType, MultiRouteResult, RouteInfoWithType, CongestionSegment, RouteRecommendation } from '@/types';
import { calculateMultiRoute, extractRoutePoints, attachTrafficEstimate, computeCongestionSegments, computeRouteRecommendation, resolveTabRoute } from '@/lib/route';
import { fetchWeatherForPoints } from '@/lib/weather';
import { reverseGeocodeShortName } from '@/lib/geocode';
import { analyzeRainAvoidance } from '@/lib/rain';
import { calculateCurvatureScore, getCurvatureRating } from '@/lib/routeAnalysis';
import { fetchElevationGain } from '@/lib/elevation';

interface UseRouteWeatherReturn {
  routeInfo: RouteInfo | null;
  routePoints: RoutePoint[];
  weatherData: RouteWeatherPoint[];
  multiRoute: MultiRouteResult | null;
  selectedRouteType: RouteType;
  routeRecommendation: RouteRecommendation | null;
  congestionSegments: CongestionSegment[];
  isLoadingRoute: boolean;
  isLoadingWeather: boolean;
  isAnalyzingRain: boolean;
  error: string | null;
  search: (input: SearchInput) => Promise<void>;
  setSelectedRouteType: (type: RouteType) => void;
  clearError: () => void;
}

export function useRouteWeather(): UseRouteWeatherReturn {
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [weatherData, setWeatherData] = useState<RouteWeatherPoint[]>([]);
  const [multiRoute, setMultiRoute] = useState<MultiRouteResult | null>(null);
  const [selectedRouteType, setSelectedRouteTypeState] = useState<RouteType>('fastest');
  const [congestionSegments, setCongestionSegments] = useState<CongestionSegment[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [isAnalyzingRain, setIsAnalyzingRain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep departureTime in ref for route type switching
  const departureTimeRef = useRef<string>('');

  const clearError = useCallback(() => setError(null), []);

  const routeRecommendation = useMemo(() => {
    if (!multiRoute) return null;
    return computeRouteRecommendation(multiRoute);
  }, [multiRoute]);

  const fetchWeatherForRoute = useCallback(async (route: RouteInfoWithType, departureTime: string) => {
    const effectiveType = route.baseRouteType ?? route.routeType;
    const points = extractRoutePoints(
      route.geometry,
      route.totalDistance,
      route.totalDuration,
      departureTime,
      15,
      effectiveType
    );
    setRoutePoints(points);
    setRouteInfo(route);

    // 渋滞区間セグメントを計算
    const segments = computeCongestionSegments(
      route.geometry,
      route.totalDuration,
      departureTime,
      effectiveType
    );
    setCongestionSegments(segments);

    setIsLoadingWeather(true);
    try {
      // 天気データを取得（地名は待たない）
      const weatherResults = await fetchWeatherForPoints(
        points.map((p) => ({
          position: p.position,
          targetTime: p.estimatedArrival,
        }))
      );

      // 天気データだけで即座に表示（地名は未取得）
      const combined: RouteWeatherPoint[] = points.map((point, i) => ({
        point,
        weather: weatherResults[i],
      }));
      setWeatherData(combined);
      setIsLoadingWeather(false);

      // 地名はバックグラウンドで個別取得し、取得できたものから順次表示
      for (let i = 0; i < points.length; i++) {
        reverseGeocodeShortName(points[i].position)
          .then((name) => {
            if (name) {
              setWeatherData((prev) =>
                prev.map((item, idx) =>
                  idx === i ? { ...item, locationName: name } : item
                )
              );
            }
          })
          .catch(() => {});
      }
    } finally {
      setIsLoadingWeather(false);
    }
  }, []);

  const setSelectedRouteType = useCallback(
    (type: RouteType) => {
      setSelectedRouteTypeState(type);
      if (multiRoute && routeRecommendation) {
        const route = resolveTabRoute(type, multiRoute, routeRecommendation);
        if (route) {
          fetchWeatherForRoute(route, departureTimeRef.current);
        }
      }
    },
    [multiRoute, routeRecommendation, fetchWeatherForRoute]
  );

  const search = useCallback(async (input: SearchInput) => {
    if (!input.origin || !input.destination) {
      setError('出発地と目的地を入力してください。');
      return;
    }

    setError(null);
    setIsLoadingRoute(true);
    setWeatherData([]);
    setMultiRoute(null);

    const departureTime = input.departureTime || new Date().toISOString();
    departureTimeRef.current = departureTime;

    try {
      // Calculate 3 route types in parallel
      const rawResult = await calculateMultiRoute(
        input.origin,
        input.destination,
        input.waypoints,
        input.avoidAreas
      );

      // 全ルートに渋滞予測を適用
      const result: MultiRouteResult = {
        fastest: rawResult.fastest ? attachTrafficEstimate(rawResult.fastest, departureTime) : null,
        no_highway: rawResult.no_highway ? attachTrafficEstimate(rawResult.no_highway, departureTime) : null,
        scenic: rawResult.scenic ? attachTrafficEstimate(rawResult.scenic, departureTime) : null,
        rain_avoid: null,
      };
      setMultiRoute(result);

      // Check if any route succeeded
      const availableRoutes = (['fastest', 'no_highway', 'scenic'] as BaseRouteType[]).filter(
        (t) => result[t] !== null
      );

      if (availableRoutes.length === 0) {
        throw new Error('ルートが見つかりませんでした。');
      }

      // 推薦を計算して初期ルートを選択
      const recommendation = computeRouteRecommendation(result);
      const initialType: RouteType = availableRoutes.includes('fastest') ? 'fastest' : availableRoutes[0];
      setSelectedRouteTypeState(initialType);
      setIsLoadingRoute(false);

      // resolveTabRoute で推薦先のルートデータを取得
      const initialRoute = resolveTabRoute(initialType, result, recommendation);
      await fetchWeatherForRoute(initialRoute!, departureTime);

      // バックグラウンドで標高・カーブ度解析を実行
      (async () => {
        const types: BaseRouteType[] = ['fastest', 'no_highway', 'scenic'];
        const enriched: Partial<MultiRouteResult> = {};

        await Promise.allSettled(
          types.map(async (type) => {
            const route = result[type];
            if (!route) return;

            const score = calculateCurvatureScore(route.geometry);
            const { label } = getCurvatureRating(score);
            const elevGain = await fetchElevationGain(route.geometry);

            enriched[type] = {
              ...route,
              curvatureScore: score,
              curvatureRating: label,
              elevationGain: elevGain,
            };
          })
        );

        setMultiRoute((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            ...(enriched.fastest && { fastest: { ...prev.fastest!, ...enriched.fastest } }),
            ...(enriched.no_highway && { no_highway: { ...prev.no_highway!, ...enriched.no_highway } }),
            ...(enriched.scenic && { scenic: { ...prev.scenic!, ...enriched.scenic } }),
          };
        });
      })().catch(() => {});

      // バックグラウンドで雨分析を実行（2ルート以上利用可能な場合のみ）
      if (availableRoutes.length >= 2) {
        setIsAnalyzingRain(true);
        analyzeRainAvoidance(result, departureTime)
          .then((analysis) => {
            const bestRoute = result[analysis.bestRouteType];
            if (!bestRoute) return;
            const rainAvoidRoute: RouteInfoWithType = {
              ...bestRoute,
              routeType: 'rain_avoid',
              baseRouteType: analysis.bestRouteType,
              rainScore: analysis.scores[analysis.bestRouteType],
            };
            setMultiRoute((prev) =>
              prev ? { ...prev, rain_avoid: rainAvoidRoute } : prev
            );
          })
          .catch(() => {
            // 雨分析失敗時は黙って無視
          })
          .finally(() => {
            setIsAnalyzingRain(false);
          });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '不明なエラーが発生しました。';
      setError(message);
    } finally {
      setIsLoadingRoute(false);
      setIsLoadingWeather(false);
    }
  }, [fetchWeatherForRoute]);

  return {
    routeInfo,
    routePoints,
    weatherData,
    multiRoute,
    selectedRouteType,
    routeRecommendation,
    congestionSegments,
    isLoadingRoute,
    isLoadingWeather,
    isAnalyzingRain,
    error,
    search,
    setSelectedRouteType,
    clearError,
  };
}
