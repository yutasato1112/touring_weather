'use client';

import { MultiRouteResult, RouteType, ROUTE_TYPE_LABELS, ROUTE_TYPE_COLORS, RouteRecommendation } from '@/types';
import { resolveTabRoute, parseDepartureTime } from '@/lib/route';
import { CONGESTION_LABELS, CONGESTION_COLORS, getCongestionInfo } from '@/lib/traffic';

interface RouteComparisonProps {
  multiRoute: MultiRouteResult;
  selectedRouteType: RouteType;
  onSelectRoute: (type: RouteType) => void;
  departureTime: string;
  compact?: boolean;
  isAnalyzingRain?: boolean;
  routeRecommendation?: RouteRecommendation | null;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}分`;
  return `${hours}時間${minutes}分`;
}

function formatDistance(km: number): string {
  return `${km.toFixed(0)} km`;
}

function formatArrival(departureTime: string, durationSeconds: number): string {
  const departure = parseDepartureTime(departureTime);
  const arrival = new Date(departure.getTime() + durationSeconds * 1000);
  return arrival.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export default function RouteComparison({
  multiRoute,
  selectedRouteType,
  onSelectRoute,
  departureTime,
  compact,
  isAnalyzingRain,
  routeRecommendation,
}: RouteComparisonProps) {
  const routeTypes: RouteType[] = ['fastest', 'no_highway', 'scenic', 'rain_avoid'];

  // 推薦マッピングを使ってルートデータを解決するヘルパー
  const getRouteForTab = (type: RouteType) => {
    if (routeRecommendation) {
      return resolveTabRoute(type, multiRoute, routeRecommendation);
    }
    return multiRoute[type];
  };

  // 推薦先がタブ種別と異なる場合のバッジテキスト
  const getRecommendationBadge = (type: RouteType): string | null => {
    if (!routeRecommendation) return null;
    if (type === 'fastest' && routeRecommendation.fastest !== 'fastest') {
      return `↳ ${ROUTE_TYPE_LABELS[routeRecommendation.fastest]}が最速`;
    }
    if (type === 'no_highway' && routeRecommendation.no_highway !== 'no_highway') {
      return `↳ ${ROUTE_TYPE_LABELS[routeRecommendation.no_highway]}が最速`;
    }
    return null;
  };

  // Compact mode: iOS-style segmented control for mobile
  if (compact) {
    // Build visible tabs list
    const visibleTabs: { type: RouteType; isLoading?: boolean }[] = [];
    for (const type of routeTypes) {
      if (type === 'rain_avoid') {
        if (isAnalyzingRain) {
          visibleTabs.push({ type, isLoading: true });
          continue;
        }
        if (!multiRoute.rain_avoid) continue;
      }
      const route = getRouteForTab(type);
      if (!route) continue;
      visibleTabs.push({ type });
    }

    const selectedIndex = visibleTabs.findIndex(t => t.type === selectedRouteType);
    const tabCount = visibleTabs.length;
    const indicatorWidth = tabCount > 0 ? 100 / tabCount : 0;
    const indicatorOffset = selectedIndex >= 0 ? selectedIndex * indicatorWidth : 0;

    return (
      <div className="px-3 py-1.5">
        <div className="segmented-control">
          {/* Sliding indicator */}
          {selectedIndex >= 0 && (
            <div
              className="segmented-control-indicator"
              style={{
                width: `${indicatorWidth}%`,
                transform: `translateX(${indicatorOffset / indicatorWidth * 100}%)`,
              }}
            />
          )}
          {visibleTabs.map(({ type, isLoading: tabLoading }) => {
            if (tabLoading) {
              return (
                <div key={type} className="segmented-control-tab opacity-50">
                  <div className="rain-wave-bars text-purple-400" style={{ height: '8px' }}>
                    <span /><span /><span /><span />
                  </div>
                  <span className="text-[9px] text-gray-400">分析中</span>
                </div>
              );
            }

            const route = getRouteForTab(type);
            if (!route) return null;

            const isSelected = type === selectedRouteType;
            const color = ROUTE_TYPE_COLORS[type];
            const displayDuration = route.adjustedDuration ?? route.totalDuration;
            const trafficType = route.baseRouteType ?? route.routeType;
            const congestion = getCongestionInfo(parseDepartureTime(departureTime), trafficType);

            return (
              <button
                key={type}
                onClick={() => onSelectRoute(type)}
                className={`segmented-control-tab ${isSelected ? 'opacity-100' : 'opacity-50'}`}
              >
                <div className="flex items-center gap-0.5">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[10px] font-bold text-white truncate">
                    {ROUTE_TYPE_LABELS[type]}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-white leading-tight">
                  {formatDuration(displayDuration)}
                </span>
                <span className="text-[9px] text-gray-400 leading-none">
                  {formatDistance(route.totalDistance)}
                  {route.elevationGain != null && route.elevationGain > 0 && (
                    <span className="text-amber-400 ml-0.5">↑{route.elevationGain.toLocaleString()}m</span>
                  )}
                  {route.adjustedDuration && route.adjustedDuration > route.totalDuration * 1.05 && (
                    <span className="ml-0.5" style={{ color: CONGESTION_COLORS[congestion.level] }}>
                      {CONGESTION_LABELS[congestion.level]}
                    </span>
                  )}
                </span>
                {route.curvatureRating && (
                  <span className="text-[8px] text-amber-400/80 leading-none">{route.curvatureRating}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Full mode: cards for desktop
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {routeTypes.map((type) => {
        // 雨回避: 分析中はローディングカード、未完了なら非表示
        if (type === 'rain_avoid') {
          if (isAnalyzingRain) {
            return (
              <div
                key={type}
                className="flex-shrink-0 rounded-lg p-3 text-left border-2 border-transparent min-w-[140px] glass-card opacity-70"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="rain-wave-bars text-purple-400">
                    <span /><span /><span /><span />
                  </div>
                  <span className="text-xs font-bold text-white truncate">{ROUTE_TYPE_LABELS.rain_avoid}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="skeleton w-20 h-3.5" />
                  <div className="skeleton w-24 h-3" />
                </div>
              </div>
            );
          }
          if (!multiRoute.rain_avoid) return null;
        }

        const route = getRouteForTab(type);
        if (!route) return null;

        const isSelected = type === selectedRouteType;
        const color = ROUTE_TYPE_COLORS[type];
        const trafficType = route.baseRouteType ?? route.routeType;
        const badge = getRecommendationBadge(type);

        return (
          <button
            key={type}
            onClick={() => onSelectRoute(type)}
            className={`flex-shrink-0 rounded-lg p-3 text-left transition-all border-2 min-w-[140px] glass-card ${
              isSelected
                ? 'shadow-lg scale-[1.02]'
                : 'opacity-60 hover:opacity-80'
            }`}
            style={{ borderColor: isSelected ? color : 'transparent' }}
          >
            {/* Color bar + label */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs font-bold text-white truncate">
                {ROUTE_TYPE_LABELS[type]}
              </span>
            </div>

            {/* Route info */}
            <div className="space-y-1">
              <div className="text-sm text-gray-300 font-medium">
                {formatDistance(route.totalDistance)}
              </div>
              <div className="text-xs text-gray-400">
                {route.adjustedDuration && route.adjustedDuration > route.totalDuration * 1.05 ? (
                  <>
                    <span className="line-through text-gray-600">{formatDuration(route.totalDuration)}</span>
                    {' → '}
                    {formatDuration(route.adjustedDuration)}
                  </>
                ) : (
                  formatDuration(route.adjustedDuration ?? route.totalDuration)
                )}
              </div>
              {route.elevationGain != null && route.elevationGain > 0 && (
                <div className="text-xs text-amber-400 font-medium">
                  ↑ {route.elevationGain.toLocaleString()}m
                </div>
              )}
              {route.curvatureRating && (
                <div className="text-[10px] text-amber-300">
                  {route.curvatureRating}
                </div>
              )}
              {(() => {
                const congestion = getCongestionInfo(parseDepartureTime(departureTime), trafficType);
                const displayDuration = route.adjustedDuration ?? route.totalDuration;
                return (
                  <>
                    {route.adjustedDuration && route.adjustedDuration > route.totalDuration * 1.05 && (
                      <div className="flex items-center gap-1 text-[10px]" style={{ color: CONGESTION_COLORS[congestion.level] }}>
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: CONGESTION_COLORS[congestion.level] }} />
                        {CONGESTION_LABELS[congestion.level]}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      到着 {formatArrival(departureTime, displayDuration)}
                    </div>
                  </>
                );
              })()}
              {/* 雨回避ルートの場合、元ルートを表示 */}
              {type === 'rain_avoid' && route.baseRouteType && (
                <div className="text-[10px] text-purple-400 mt-1">
                  ↳ {ROUTE_TYPE_LABELS[route.baseRouteType]}を推奨
                </div>
              )}
              {/* 推薦先がタブと異なる場合のバッジ */}
              {badge && (
                <div className="text-[10px] text-blue-400 mt-1">
                  {badge}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
