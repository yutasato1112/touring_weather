'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { SearchInput } from '@/types';
import { useRouteWeather } from '@/hooks/useRouteWeather';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import SearchPanel from '@/components/SearchPanel';
import WeatherTimeline from '@/components/WeatherTimeline';
import RouteComparison from '@/components/RouteComparison';
import ErrorMessage from '@/components/ErrorMessage';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 gap-4">
      <div className="relative flex items-center justify-center">
        <div className="map-loader-ring absolute" />
        <span className="text-xl">🗺</span>
      </div>
      <p className="text-gray-500 text-sm">地図を読み込み中</p>
    </div>
  ),
});

type MapClickMode = 'origin' | 'destination' | null;

export default function Home() {
  const {
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
  } = useRouteWeather();

  const { currentLocation, currentLocationLabel, isLoading: isLoadingLocation, requestLocation } = useCurrentLocation();

  const [searchInput, setSearchInput] = useState<SearchInput>({
    origin: null,
    destination: null,
    originText: '',
    destinationText: '',
    departureTime: '',
    waypoints: [],
    routePreference: '',
    avoidAreas: [],
  });

  const [mapClickMode, setMapClickMode] = useState<MapClickMode>(null);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Set default departure time on client mount (avoid SSR/client time mismatch)
  useEffect(() => {
    setSearchInput((prev) => {
      if (prev.departureTime) return prev;
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      return { ...prev, departureTime: now.toISOString().slice(0, 16) };
    });
  }, []);

  // Prefill origin with current location
  useEffect(() => {
    if (currentLocation && !searchInput.origin && !searchInput.originText) {
      setSearchInput((prev) => ({
        ...prev,
        origin: currentLocation,
        originText: currentLocationLabel,
      }));
    }
  }, [currentLocation, currentLocationLabel, searchInput.origin, searchInput.originText]);

  const handleUseCurrentLocation = useCallback(async () => {
    if (currentLocation) {
      setSearchInput((prev) => ({
        ...prev,
        origin: currentLocation,
        originText: currentLocationLabel,
      }));
      return;
    }
    // 位置情報がなければ再取得し、結果を直接セット
    const result = await requestLocation();
    if (result) {
      setSearchInput((prev) => ({
        ...prev,
        origin: result.position,
        originText: result.label,
      }));
    }
  }, [currentLocation, currentLocationLabel, requestLocation]);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (mapClickMode === 'origin') {
        setSearchInput((prev) => ({
          ...prev,
          origin: { lat, lng },
          originText: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        }));
        setMapClickMode(null);
      } else if (mapClickMode === 'destination') {
        setSearchInput((prev) => ({
          ...prev,
          destination: { lat, lng },
          destinationText: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        }));
        setMapClickMode(null);
      }
    },
    [mapClickMode]
  );

  const handleSearch = useCallback(
    (input: SearchInput) => {
      search(input);
    },
    [search]
  );

  const isLoading = isLoadingRoute || isLoadingWeather;

  const originMarker = useMemo(() => searchInput.origin, [searchInput.origin]);
  const destinationMarker = useMemo(() => searchInput.destination, [searchInput.destination]);

  // Mobile: separate flags for route selector (top) and weather carousel (bottom)
  const hasMobileRouteSelector = !isDesktop && !!multiRoute;
  const hasMobileWeatherCarousel = !isDesktop && (weatherData.length > 0 || isLoadingWeather);

  return (
    <main className="w-screen h-screen relative overflow-hidden">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <MapView
          routeGeometry={routeInfo?.geometry}
          routePoints={routePoints}
          onMapClick={handleMapClick}
          originMarker={originMarker}
          destinationMarker={destinationMarker}
          multiRoute={multiRoute}
          selectedRouteType={selectedRouteType}
          waypoints={searchInput.waypoints}
          initialCenter={currentLocation}
          congestionSegments={congestionSegments}
          routeRecommendation={routeRecommendation}
        />
      </div>

      {/* Error message overlay */}
      <ErrorMessage message={error} onClose={clearError} />

      {/* Search panel (desktop: top-left card, mobile: bottom sheet) */}
      <SearchPanel
        onSearch={handleSearch}
        isLoading={isLoading}
        onSetOriginFromMap={mapClickMode === 'origin'}
        onSetDestinationFromMap={mapClickMode === 'destination'}
        onToggleOriginFromMap={() => setMapClickMode(mapClickMode === 'origin' ? null : 'origin')}
        onToggleDestinationFromMap={() => setMapClickMode(mapClickMode === 'destination' ? null : 'destination')}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        onUseCurrentLocation={handleUseCurrentLocation}
        isLoadingLocation={isLoadingLocation}
        multiRoute={multiRoute}
        selectedRouteType={selectedRouteType}
        onSelectRoute={setSelectedRouteType}
        isAnalyzingRain={isAnalyzingRain}
        routeRecommendation={routeRecommendation}
      />

      {/* Mobile: Route selector + Weather carousel (top) */}
      {(hasMobileRouteSelector || hasMobileWeatherCarousel) && (
        <div
          className="fixed top-0 left-0 right-0 z-[999] glass-panel !rounded-none animate-fade-in-up"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {hasMobileRouteSelector && (
            <RouteComparison
              multiRoute={multiRoute}
              selectedRouteType={selectedRouteType}
              onSelectRoute={setSelectedRouteType}
              departureTime={searchInput.departureTime || new Date().toISOString()}
              compact
              isAnalyzingRain={isAnalyzingRain}
              routeRecommendation={routeRecommendation}
            />
          )}
          {hasMobileWeatherCarousel && (
            <WeatherTimeline
              data={weatherData}
              isLoading={isLoadingWeather}
              selectedRouteType={selectedRouteType}
              inline
            />
          )}
        </div>
      )}

      {/* Desktop weather timeline (bottom bar) */}
      {isDesktop && (weatherData.length > 0 || isLoadingWeather) && (
        <WeatherTimeline
          data={weatherData}
          isLoading={isLoadingWeather}
          selectedRouteType={selectedRouteType}
        />
      )}
    </main>
  );
}