'use client';

import { MultiRouteResult, RouteType, ROUTE_TYPE_LABELS, ROUTE_TYPE_COLORS, RouteRecommendation } from '@/types';
import { resolveTabRoute } from '@/lib/route';
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
  const departure = new Date(departureTime);
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

  // Compact mode: horizontal tabs for mobile top bar
  if (compact) {
    return (
      <div className="flex gap-1 px-3 py-1.5">
        {routeTypes.map((type) => {
          // 雨回避: 分析中はローディング表示、未完了なら非表示
          if (type === 'rain_avoid') {
            if (isAnalyzingRain) {
              return (
                <div key={type} className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-md opacity-50">
                  <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: ROUTE_TYPE_COLORS.rain_avoid }} />
                  <span className="text-[9px] text-gray-400 animate-pulse">分析中...</span>
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
          const displayDuration = route.adjustedDuration ?? route.totalDuration;
          const congestion = getCongestionInfo(new Date(departureTime), trafficType);
          const badge = getRecommendationBadge(type);

          return (
            <button
              key={type}
              onClick={() => onSelectRoute(type)}
              className={`flex-1 flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
                isSelected ? 'bg-white/10' : 'opacity-50'
              }`}
              style={{ borderBottom: isSelected ? `2px solid ${color}` : '2px solid transparent' }}
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="flex flex-col items-start min-w-0">
                <span className="text-[10px] font-bold text-white truncate">
                  {ROUTE_TYPE_LABELS[type]}
                </span>
                <span className="text-[9px] text-gray-400">
                  {formatDistance(route.totalDistance)} / {formatDuration(displayDuration)}
                </span>
                {route.adjustedDuration && route.adjustedDuration > route.totalDuration * 1.05 && (
                  <span className="flex items-center gap-0.5 text-[8px]" style={{ color: CONGESTION_COLORS[congestion.level] }}>
                    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CONGESTION_COLORS[congestion.level] }} />
                    {CONGESTION_LABELS[congestion.level]}
                  </span>
                )}
                {badge && (
                  <span className="text-[8px] text-blue-400 truncate">{badge}</span>
                )}
              </div>
            </button>
          );
        })}
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
                className="flex-shrink-0 rounded-lg p-3 text-left border-2 border-transparent min-w-[140px] glass-card opacity-60"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: ROUTE_TYPE_COLORS.rain_avoid }} />
                  <span className="text-xs font-bold text-white truncate">{ROUTE_TYPE_LABELS.rain_avoid}</span>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-gray-400 animate-pulse">雨予報を分析中...</div>
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
                  ↑ {route.elevationGain}m
                </div>
              )}
              {(() => {
                const congestion = getCongestionInfo(new Date(departureTime), trafficType);
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
