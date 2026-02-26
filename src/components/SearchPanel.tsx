'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { SearchInput, Waypoint, LatLng, MultiRouteResult, RouteType, RouteRecommendation } from '@/types';
import { geocodeSearch, GeocodeSuggestion } from '@/lib/geocode';
import RouteComparison from './RouteComparison';

interface SearchPanelProps {
  onSearch: (input: SearchInput) => void;
  isLoading: boolean;
  onSetOriginFromMap: boolean;
  onSetDestinationFromMap: boolean;
  onToggleOriginFromMap: () => void;
  onToggleDestinationFromMap: () => void;
  searchInput: SearchInput;
  setSearchInput: (input: SearchInput) => void;
  onUseCurrentLocation: () => void;
  isLoadingLocation: boolean;
  multiRoute: MultiRouteResult | null;
  selectedRouteType: RouteType;
  onSelectRoute: (type: RouteType) => void;
  isAnalyzingRain?: boolean;
  routeRecommendation?: RouteRecommendation | null;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface LocationInputProps {
  label: string;
  placeholder: string;
  value: string;
  latLng: LatLng | null;
  onChange: (text: string) => void;
  onSelect: (suggestion: GeocodeSuggestion) => void;
  isMapSelectActive: boolean;
  onToggleMapSelect: () => void;
  accentColor: 'green' | 'red' | 'purple';
  rightButton?: React.ReactNode;
}

function LocationInput({
  label,
  placeholder,
  value,
  latLng,
  onChange,
  onSelect,
  isMapSelectActive,
  onToggleMapSelect,
  accentColor,
  rightButton,
}: LocationInputProps) {
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedQuery = useDebounce(value, 400);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2 || latLng) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    geocodeSearch(debouncedQuery).then((results) => {
      if (!cancelled) {
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setIsSearching(false);
      }
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, latLng]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const colorMap = {
    green: {
      active: 'bg-green-600 border-green-500 text-white',
      inactive: 'bg-gray-800/70 border-gray-600/50 text-gray-400 hover:border-gray-500',
      confirm: 'text-green-400',
    },
    red: {
      active: 'bg-red-600 border-red-500 text-white',
      inactive: 'bg-gray-800/70 border-gray-600/50 text-gray-400 hover:border-gray-500',
      confirm: 'text-red-400',
    },
    purple: {
      active: 'bg-purple-600 border-purple-500 text-white',
      inactive: 'bg-gray-800/70 border-gray-600/50 text-gray-400 hover:border-gray-500',
      confirm: 'text-purple-400',
    },
  };

  const mapBtnColor = isMapSelectActive ? colorMap[accentColor].active : colorMap[accentColor].inactive;
  const confirmColor = colorMap[accentColor].confirm;

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            className="w-full glass-input text-white px-3 py-2 rounded-lg text-sm"
          />
          {isSearching && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
            </div>
          )}
        </div>
        {rightButton}
        <button
          type="button"
          onClick={onToggleMapSelect}
          className={`px-2.5 py-2 rounded-lg text-sm border transition-colors flex-shrink-0 ${mapBtnColor}`}
          title="地図上で選択"
        >
          📍
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 glass-panel rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700/60 transition-colors"
                onClick={() => {
                  onSelect(s);
                  setShowSuggestions(false);
                }}
              >
                <span className="block truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {latLng && (
        <p className={`text-xs ${confirmColor} mt-1`}>
          ✓ {latLng.lat.toFixed(4)}, {latLng.lng.toFixed(4)}
        </p>
      )}
    </div>
  );
}

// Snap point constants
const SHEET_HEIGHT_VH = 85;
const COLLAPSED_VISIBLE_PX = 56;
const SNAP_POINTS = {
  collapsed: 0,  // percentage of sheet visible (only handle)
  half: 50,
  full: 85,
};

export default function SearchPanel({
  onSearch,
  isLoading,
  onSetOriginFromMap,
  onSetDestinationFromMap,
  onToggleOriginFromMap,
  onToggleDestinationFromMap,
  searchInput,
  setSearchInput,
  onUseCurrentLocation,
  isLoadingLocation,
  multiRoute,
  selectedRouteType,
  onSelectRoute,
  isAnalyzingRain,
  routeRecommendation,
}: SearchPanelProps) {
  const [isDesktop, setIsDesktop] = useState(true);

  // Bottom sheet state (mobile)
  const [translateY, setTranslateY] = useState(0); // px from full-open position
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartTranslateY = useRef(0);
  const lastTouchY = useRef(0);
  const lastTouchTime = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const pendingDrag = useRef(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Initialize bottom sheet to half position
  useEffect(() => {
    if (!isDesktop) {
      const sheetHeightPx = window.innerHeight * SHEET_HEIGHT_VH / 100;
      const halfVisiblePx = window.innerHeight * SNAP_POINTS.half / 100;
      setTranslateY(sheetHeightPx - halfVisiblePx);
    }
  }, [isDesktop]);

  const getSnapTranslateY = useCallback((snapName: 'collapsed' | 'half' | 'full') => {
    const sheetHeightPx = window.innerHeight * SHEET_HEIGHT_VH / 100;
    if (snapName === 'collapsed') return sheetHeightPx - COLLAPSED_VISIBLE_PX;
    if (snapName === 'half') return sheetHeightPx - window.innerHeight * SNAP_POINTS.half / 100;
    return 0; // full
  }, []);

  // Auto-collapse bottom sheet after search completes on mobile
  const prevMultiRoute = useRef<MultiRouteResult | null>(null);
  useEffect(() => {
    if (!isDesktop && multiRoute && !prevMultiRoute.current) {
      // Search just completed — collapse to show map + routes
      setTranslateY(getSnapTranslateY('collapsed'));
    }
    prevMultiRoute.current = multiRoute;
  }, [multiRoute, isDesktop, getSnapTranslateY]);

  const snapToNearest = useCallback((currentY: number, velocityY: number) => {
    const snaps = [
      { name: 'collapsed' as const, y: getSnapTranslateY('collapsed') },
      { name: 'half' as const, y: getSnapTranslateY('half') },
      { name: 'full' as const, y: getSnapTranslateY('full') },
    ];

    // Fast swipe: go in swipe direction
    if (Math.abs(velocityY) > 0.5) {
      if (velocityY > 0) {
        // Swiping down: find next lower snap
        const lower = snaps.filter(s => s.y > currentY - 20).sort((a, b) => a.y - b.y);
        if (lower.length > 0) {
          setTranslateY(lower[0].y);
          return;
        }
      } else {
        // Swiping up: find next higher snap
        const higher = snaps.filter(s => s.y < currentY + 20).sort((a, b) => b.y - a.y);
        if (higher.length > 0) {
          setTranslateY(higher[0].y);
          return;
        }
      }
    }

    // Slow drag: snap to nearest
    let nearest = snaps[0];
    let minDist = Math.abs(currentY - snaps[0].y);
    for (const snap of snaps) {
      const dist = Math.abs(currentY - snap.y);
      if (dist < minDist) {
        minDist = dist;
        nearest = snap;
      }
    }
    setTranslateY(nearest.y);
  }, [getSnapTranslateY]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const isHandle = handleRef.current?.contains(e.target as Node);

    if (isHandle) {
      setIsDragging(true);
      dragStartY.current = touch.clientY;
      dragStartTranslateY.current = translateY;
    } else {
      // Content area: mark as pending (start drag only on downward move when scrolled to top)
      pendingDrag.current = true;
      dragStartY.current = touch.clientY;
      dragStartTranslateY.current = translateY;
    }
    lastTouchY.current = touch.clientY;
    lastTouchTime.current = Date.now();
  }, [translateY]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const deltaY = touch.clientY - dragStartY.current;

    if (pendingDrag.current && !isDragging) {
      // Check if scrolled to top and dragging down
      const scrollTop = contentRef.current?.scrollTop ?? 0;
      if (deltaY > 5 && scrollTop <= 0) {
        setIsDragging(true);
        pendingDrag.current = false;
        dragStartY.current = touch.clientY;
        dragStartTranslateY.current = translateY;
      } else if (deltaY < -5) {
        // Scrolling up in content, don't start drag
        pendingDrag.current = false;
      }
    }

    if (isDragging) {
      e.preventDefault();
      const newDelta = touch.clientY - dragStartY.current;
      const newTranslateY = Math.max(0, dragStartTranslateY.current + newDelta);
      const maxTranslate = getSnapTranslateY('collapsed');
      setTranslateY(Math.min(newTranslateY, maxTranslate));
    }

    lastTouchY.current = touch.clientY;
    lastTouchTime.current = Date.now();
  }, [isDragging, translateY, getSnapTranslateY]);

  const handleTouchEnd = useCallback(() => {
    pendingDrag.current = false;
    if (!isDragging) return;

    setIsDragging(false);
    const velocityY = (lastTouchY.current - dragStartY.current) / Math.max(1, (Date.now() - lastTouchTime.current)) * 1000;
    // Normalize velocity to reasonable range
    const normalizedVelocity = velocityY / 1000;
    snapToNearest(translateY, normalizedVelocity);
  }, [isDragging, translateY, snapToNearest]);

  const getDefaultDepartureTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      let input = { ...searchInput };

      if (!input.origin && input.originText) {
        const results = await geocodeSearch(input.originText);
        if (results.length > 0) {
          input = {
            ...input,
            origin: { lat: results[0].lat, lng: results[0].lng },
            originText: results[0].label,
          };
        }
      }

      if (!input.destination && input.destinationText) {
        const results = await geocodeSearch(input.destinationText);
        if (results.length > 0) {
          input = {
            ...input,
            destination: { lat: results[0].lat, lng: results[0].lng },
            destinationText: results[0].label,
          };
        }
      }

      if (!input.departureTime) {
        input = { ...input, departureTime: new Date().toISOString() };
      }

      setSearchInput(input);
      onSearch(input);
    },
    [searchInput, setSearchInput, onSearch]
  );

  const addWaypoint = () => {
    setSearchInput({
      ...searchInput,
      waypoints: [...searchInput.waypoints, { position: { lat: 0, lng: 0 }, label: '' }],
    });
  };

  const removeWaypoint = (index: number) => {
    setSearchInput({
      ...searchInput,
      waypoints: searchInput.waypoints.filter((_, i) => i !== index),
    });
  };

  const updateWaypoint = (index: number, wp: Waypoint) => {
    const updated = [...searchInput.waypoints];
    updated[index] = wp;
    setSearchInput({ ...searchInput, waypoints: updated });
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-3">
      <LocationInput
        label="出発地"
        placeholder="東京駅、渋谷、住所..."
        value={searchInput.originText}
        latLng={searchInput.origin}
        onChange={(text) =>
          setSearchInput({ ...searchInput, originText: text, origin: null })
        }
        onSelect={(s) =>
          setSearchInput({
            ...searchInput,
            origin: { lat: s.lat, lng: s.lng },
            originText: s.label,
          })
        }
        isMapSelectActive={onSetOriginFromMap}
        onToggleMapSelect={onToggleOriginFromMap}
        accentColor="green"
        rightButton={
          <button
            type="button"
            onClick={onUseCurrentLocation}
            disabled={isLoadingLocation}
            className="px-2.5 py-2 rounded-lg text-sm border border-gray-600/50 bg-gray-800/70 text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors flex-shrink-0 disabled:opacity-50"
            title="現在地を使用"
          >
            {isLoadingLocation ? (
              <div className="w-4 h-4 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
            ) : (
              '📌'
            )}
          </button>
        }
      />

      {/* Waypoints */}
      {searchInput.waypoints.map((wp, index) => (
        <div key={index} className="relative">
          <LocationInput
            label={`経由地 ${index + 1}`}
            placeholder="経由地を入力..."
            value={wp.label}
            latLng={wp.position.lat !== 0 ? wp.position : null}
            onChange={(text) =>
              updateWaypoint(index, { ...wp, label: text, position: { lat: 0, lng: 0 } })
            }
            onSelect={(s) =>
              updateWaypoint(index, {
                position: { lat: s.lat, lng: s.lng },
                label: s.label,
              })
            }
            isMapSelectActive={false}
            onToggleMapSelect={() => {}}
            accentColor="purple"
            rightButton={
              <button
                type="button"
                onClick={() => removeWaypoint(index)}
                className="px-2.5 py-2 rounded-lg text-sm border border-gray-600/50 bg-gray-800/70 text-red-400 hover:border-red-500 transition-colors flex-shrink-0"
                title="経由地を削除"
              >
                ✕
              </button>
            }
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addWaypoint}
        className="w-full py-1.5 text-xs text-gray-400 hover:text-blue-400 border border-dashed border-gray-600/50 hover:border-blue-500 rounded-lg transition-colors"
      >
        + 経由地を追加
      </button>

      <LocationInput
        label="目的地"
        placeholder="箱根、富士山、住所..."
        value={searchInput.destinationText}
        latLng={searchInput.destination}
        onChange={(text) =>
          setSearchInput({ ...searchInput, destinationText: text, destination: null })
        }
        onSelect={(s) =>
          setSearchInput({
            ...searchInput,
            destination: { lat: s.lat, lng: s.lng },
            destinationText: s.label,
          })
        }
        isMapSelectActive={onSetDestinationFromMap}
        onToggleMapSelect={onToggleDestinationFromMap}
        accentColor="red"
      />

      <div>
        <label className="block text-xs text-gray-400 mb-1">出発日時</label>
        <input
          type="datetime-local"
          value={searchInput.departureTime || getDefaultDepartureTime()}
          onChange={(e) =>
            setSearchInput({ ...searchInput, departureTime: e.target.value })
          }
          className="w-full glass-input text-white px-3 py-2 rounded-lg text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={
          isLoading ||
          (!searchInput.originText && !searchInput.origin) ||
          (!searchInput.destinationText && !searchInput.destination)
        }
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
      >
        {isLoading ? '検索中...' : '経路と天気を検索'}
      </button>
    </form>
  );

  // Desktop layout: top-left panel with scroll
  if (isDesktop) {
    return (
      <div className="absolute top-4 left-4 z-[1000] w-80 max-w-[calc(100vw-2rem)]">
        <div className="glass-panel rounded-xl max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div className="px-4 py-3 flex items-center justify-between text-white">
            <h2 className="text-lg font-bold">🏍 Touring Weather</h2>
          </div>
          <div className="px-4 pb-4">
            {formContent}
          </div>
          {/* Route comparison below form */}
          {multiRoute && (
            <div className="px-4 pb-4">
              <RouteComparison
                multiRoute={multiRoute}
                selectedRouteType={selectedRouteType}
                onSelectRoute={onSelectRoute}
                departureTime={searchInput.departureTime || new Date().toISOString()}
                isAnalyzingRain={isAnalyzingRain}
                routeRecommendation={routeRecommendation}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Mobile layout: swipe bottom sheet
  return (
    <div
      ref={sheetRef}
      className={`fixed bottom-0 left-0 right-0 z-[1000] glass-panel rounded-t-2xl bottom-sheet ${isDragging ? 'bottom-sheet-dragging' : ''}`}
      style={{
        height: `${SHEET_HEIGHT_VH}vh`,
        transform: `translateY(${translateY}px)`,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Drag handle */}
      <div
        ref={handleRef}
        className="w-full flex justify-center py-3 cursor-grab active:cursor-grabbing"
      >
        <div className="bottom-sheet-handle" />
      </div>

      {/* Header (always visible) */}
      <div className="px-4 pb-2 flex items-center justify-between">
        <h2 className="text-base font-bold text-white">🏍 Touring Weather</h2>
      </div>

      {/* Scrollable content */}
      <div
        ref={contentRef}
        className="overflow-y-auto px-4 pb-4"
        style={{ maxHeight: 'calc(100% - 72px)' }}
      >
        {formContent}
      </div>
    </div>
  );
}
