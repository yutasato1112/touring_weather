'use client';

import { RouteWeatherPoint, RouteType, ROUTE_TYPE_LABELS, ROUTE_TYPE_COLORS } from '@/types';
import { getWeatherEmoji } from '@/lib/weather';
import { CONGESTION_LABELS, CONGESTION_COLORS } from '@/lib/traffic';

interface WeatherTimelineProps {
  data: RouteWeatherPoint[];
  isLoading: boolean;
  selectedRouteType?: RouteType;
  inline?: boolean;
}

/** 雨系の天気コードか判定 */
function isRainWeather(code: number, precipProb: number): boolean {
  // Drizzle(51-57), Rain(61-67), Rain showers(80-82), Thunderstorm(95-99)
  const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
  return rainCodes.includes(code) || precipProb > 50;
}

/** 強い雨か判定 */
function isHeavyRain(code: number): boolean {
  return [55, 63, 65, 67, 82, 95, 96, 99].includes(code);
}

/** Skeleton placeholder cards for loading state */
function SkeletonCards({ count, compact }: { count: number; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex gap-0 px-3 min-w-max">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center">
            <div className="flex items-center gap-1 px-1.5 py-1 rounded border glass-card">
              <div className="skeleton w-6 h-6 rounded" />
              <div className="flex flex-col gap-0.5">
                <div className="skeleton w-12 h-2" />
                <div className="skeleton w-9 h-2" />
                <div className="skeleton w-14 h-2.5" />
              </div>
            </div>
            {i < count - 1 && <div className="w-2 h-px bg-gray-700 mx-0.5" />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-0 px-4 min-w-max">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-stretch">
          <div className="flex flex-col items-center w-28 shrink-0">
            <div className="skeleton w-10 h-3 mb-1" />
            <div className="skeleton w-16 h-2.5 mb-1" />
            <div className="rounded-lg p-2 w-full border glass-card">
              <div className="flex flex-col items-center gap-1.5">
                <div className="skeleton w-8 h-8 rounded-lg" />
                <div className="skeleton w-12 h-4 rounded" />
                <div className="skeleton w-10 h-3" />
                <div className="skeleton w-14 h-3" />
                <div className="skeleton w-16 h-2.5 mt-0.5" />
              </div>
            </div>
            <div className="skeleton w-10 h-3 mt-1" />
          </div>
          {i < count - 1 && (
            <div className="flex items-center px-1">
              <div className="w-4 h-0.5 bg-gray-700 mt-4" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function WeatherTimeline({ data, isLoading, selectedRouteType, inline }: WeatherTimelineProps) {
  if (isLoading) {
    if (inline) {
      return (
        <div className="overflow-hidden">
          <SkeletonCards count={5} compact />
        </div>
      );
    }
    return (
      <div className="absolute bottom-0 left-0 right-0 md:left-[22rem] z-[1000] weather-timeline-bar">
        <div className="px-4 py-2 flex items-center gap-2">
          <div className="skeleton w-2.5 h-2.5 rounded-full" />
          <div className="skeleton w-32 h-4" />
        </div>
        <div className="overflow-hidden pb-3">
          <SkeletonCards count={6} />
        </div>
      </div>
    );
  }

  if (data.length === 0) return null;

  // Inline compact mode for mobile top bar
  if (inline) {
    return (
      <div>
        <div className="overflow-x-auto pb-1">
          <div className="flex gap-0 px-3 min-w-max">
            {data.map((item, index) => {
              const time = new Date(item.point.estimatedArrival);
              const isFirst = index === 0;
              const isLast = index === data.length - 1;
              const rain = item.weather ? isRainWeather(item.weather.weatherCode, item.weather.precipitationProbability) : false;
              const heavy = item.weather ? isHeavyRain(item.weather.weatherCode) : false;
              const cardClass = heavy ? 'weather-card-heavy-rain' : rain ? 'weather-card-rain' : '';

              return (
                <div key={index} className="flex items-center">
                  <div className={`flex items-center gap-1 px-1.5 py-1 rounded border glass-card ${cardClass} ${
                    isFirst ? '!bg-green-900/30 !border-green-700/40'
                      : isLast ? '!bg-red-900/30 !border-red-700/40' : ''
                  }`}>
                    <span className="text-base leading-none">{item.weather ? getWeatherEmoji(item.weather.weatherCode) : '—'}</span>
                    <div className="flex flex-col min-w-0">
                      {item.locationName && (
                        <span className="text-[9px] text-gray-300 leading-none truncate max-w-[5rem]" title={item.locationName}>
                          {item.locationName}
                        </span>
                      )}
                      <span className="text-[9px] text-gray-500 leading-tight">
                        {isFirst ? '出発' : isLast ? '到着' : `${item.point.distanceFromStart.toFixed(0)}km`}
                        {' '}{time.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {item.weather && (
                        <span className="text-[10px] text-white font-bold leading-tight">
                          {item.weather.temperature.toFixed(0)}°C
                          <span className={`ml-1 font-normal ${item.weather.precipitationProbability > 50 ? 'text-blue-400' : 'text-gray-500'}`}>
                            {item.weather.precipitationProbability}%
                          </span>
                        </span>
                      )}
                      {item.point.congestionLevel && item.point.congestionLevel !== 'normal' && (
                        <span className="flex items-center gap-0.5 text-[8px] leading-tight" style={{ color: CONGESTION_COLORS[item.point.congestionLevel] }}>
                          <span className="inline-block w-1 h-1 rounded-full" style={{ backgroundColor: CONGESTION_COLORS[item.point.congestionLevel] }} />
                          {CONGESTION_LABELS[item.point.congestionLevel]}
                        </span>
                      )}
                    </div>
                  </div>
                  {index < data.length - 1 && (
                    <div className="w-2 h-px bg-gray-600 mx-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Full content for desktop bottom bar
  const content = (
    <>
      <div className="px-4 py-2 flex items-center gap-2">
        {selectedRouteType && (
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: ROUTE_TYPE_COLORS[selectedRouteType] }}
          />
        )}
        <h3 className="text-sm font-bold text-gray-300">
          {selectedRouteType ? `${ROUTE_TYPE_LABELS[selectedRouteType]}の天気予報` : '経路の天気予報'}
        </h3>
      </div>
      <div className="overflow-x-auto pb-3">
        <div className="flex gap-0 px-4 min-w-max">
          {data.map((item, index) => {
            const time = new Date(item.point.estimatedArrival);
            const isFirst = index === 0;
            const isLast = index === data.length - 1;

            const rain = item.weather ? isRainWeather(item.weather.weatherCode, item.weather.precipitationProbability) : false;
            const heavy = item.weather ? isHeavyRain(item.weather.weatherCode) : false;

            const cardClass = heavy
              ? 'weather-card-heavy-rain'
              : rain
              ? 'weather-card-rain'
              : '';

            return (
              <div key={index} className="flex items-stretch">
                <div className="flex flex-col items-center w-28 shrink-0">
                  <div className="text-[10px] text-gray-500 mb-0.5 text-center truncate w-full">
                    {isFirst ? '出発' : isLast ? '到着' : `${item.point.distanceFromStart.toFixed(0)}km`}
                  </div>
                  {item.locationName && (
                    <div className="text-[9px] text-gray-400 mb-1 text-center truncate w-full" title={item.locationName}>
                      {item.locationName}
                    </div>
                  )}
                  <div className={`rounded-lg p-2 w-full text-center border glass-card ${cardClass} ${
                    isFirst
                      ? '!bg-green-900/30 !border-green-700/40'
                      : isLast
                      ? '!bg-red-900/30 !border-red-700/40'
                      : ''
                  }`}>
                    {item.weather ? (
                      <>
                        <div className="text-2xl mb-1">
                          {getWeatherEmoji(item.weather.weatherCode)}
                        </div>
                        <div className="text-white font-bold text-sm">
                          {item.weather.temperature.toFixed(0)}°C
                        </div>
                        <div className={`text-[10px] ${
                          item.weather.precipitationProbability > 50
                            ? 'text-blue-400'
                            : 'text-gray-400'
                        }`}>
                          🌧 {item.weather.precipitationProbability}%
                        </div>
                        <div className="text-[10px] text-gray-400">
                          💨 {item.weather.windSpeed.toFixed(0)}km/h
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">
                          {item.weather.weatherDescription}
                        </div>
                      </>
                    ) : (
                      <div className="text-gray-500 text-xs py-2">データなし</div>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {time.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {item.point.congestionLevel && item.point.congestionLevel !== 'normal' && (
                    <div className="flex items-center justify-center gap-0.5 mt-0.5">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: CONGESTION_COLORS[item.point.congestionLevel] }}
                      />
                      <span
                        className="text-[9px]"
                        style={{ color: CONGESTION_COLORS[item.point.congestionLevel] }}
                      >
                        {CONGESTION_LABELS[item.point.congestionLevel]}
                      </span>
                    </div>
                  )}
                </div>
                {index < data.length - 1 && (
                  <div className="flex items-center px-1">
                    <div className="w-4 h-0.5 bg-gray-600 mt-4"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="absolute bottom-0 left-0 right-0 md:left-[22rem] z-[1000] weather-timeline-bar">
      {content}
    </div>
  );
}
