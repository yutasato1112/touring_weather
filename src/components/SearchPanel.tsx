'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { SearchInput, Waypoint, LatLng, MultiRouteResult, RouteType, RouteRecommendation } from '@/types';
import { geocodeSearch, GeocodeSuggestion } from '@/lib/geocode';
import { resolveRoutePreference } from '@/lib/routePreference';
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

  const iconMap = { green: '🟢', red: '🔴', purple: '🟣' };
  const prefixIcon = iconMap[accentColor];

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">{prefixIcon}</span>
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            className="w-full glass-input text-white pl-9 pr-3 py-3 rounded-xl text-sm"
          />
          {isSearching && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="spinner-glow" />
            </div>
          )}
        </div>
        {rightButton}
        <button
          type="button"
          onClick={onToggleMapSelect}
          className={`min-w-[48px] min-h-[48px] px-2.5 rounded-xl text-sm border transition-colors flex-shrink-0 flex items-center justify-center active:scale-[0.97] ${mapBtnColor}`}
          title="地図上で選択"
        >
          📍
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 glass-panel rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={i} className={i < suggestions.length - 1 ? 'border-b border-white/5' : ''}>
              <button
                type="button"
                className="w-full text-left px-3 py-3.5 text-sm text-gray-200 hover:bg-gray-700/60 active:bg-gray-600/60 transition-colors"
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
  collapsed: 0,
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
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartTranslateY = useRef(0);
  const lastTouchY = useRef(0);
  const lastTouchTime = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentDragRef = useRef<{
    startY: number;
    startTranslateY: number;
    canDragDown: boolean;
    canDragUp: boolean;
    isDraggingSheet: boolean;
    decided: boolean;
  } | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [vpState, setVpState] = useState({ height: 0, offsetTop: 0 });

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
      setTranslateY(getSnapTranslateY('collapsed'));
    }
    prevMultiRoute.current = multiRoute;
  }, [multiRoute, isDesktop, getSnapTranslateY]);

  // キーボード検知 + フォーカス時にシート全開＆入力欄をスクロール表示
  useEffect(() => {
    if (isDesktop) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches('input, select, textarea')) {
        setTranslateY(0);
        setTimeout(() => {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 350);
      }
    };

    const vv = window.visualViewport;
    const handleVpChange = () => {
      if (!vv) return;
      const kbH = window.innerHeight - vv.height;
      setKeyboardHeight(kbH > 80 ? kbH : 0);
      setVpState({ height: vv.height, offsetTop: vv.offsetTop });
      if (kbH > 80) {
        setTranslateY(0);
      }
    };

    sheet.addEventListener('focusin', handleFocusIn);
    if (vv) {
      vv.addEventListener('resize', handleVpChange);
      vv.addEventListener('scroll', handleVpChange);
    }

    return () => {
      sheet.removeEventListener('focusin', handleFocusIn);
      if (vv) {
        vv.removeEventListener('resize', handleVpChange);
        vv.removeEventListener('scroll', handleVpChange);
      }
    };
  }, [isDesktop]);

  const snapToNearest = useCallback((currentY: number, velocityY: number) => {
    const snaps = [
      { name: 'collapsed' as const, y: getSnapTranslateY('collapsed') },
      { name: 'half' as const, y: getSnapTranslateY('half') },
      { name: 'full' as const, y: getSnapTranslateY('full') },
    ];

    if (Math.abs(velocityY) > 0.5) {
      if (velocityY > 0) {
        const lower = snaps.filter(s => s.y > currentY - 20).sort((a, b) => a.y - b.y);
        if (lower.length > 0) { setTranslateY(lower[0].y); return; }
      } else {
        const higher = snaps.filter(s => s.y < currentY + 20).sort((a, b) => b.y - a.y);
        if (higher.length > 0) { setTranslateY(higher[0].y); return; }
      }
    }

    let nearest = snaps[0];
    let minDist = Math.abs(currentY - snaps[0].y);
    for (const snap of snaps) {
      const dist = Math.abs(currentY - snap.y);
      if (dist < minDist) { minDist = dist; nearest = snap; }
    }
    setTranslateY(nearest.y);
  }, [getSnapTranslateY]);

  // ドラッグハンドラ — ハンドル領域専用
  const handleHandleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    dragStartY.current = touch.clientY;
    dragStartTranslateY.current = translateY;
    lastTouchY.current = touch.clientY;
    lastTouchTime.current = Date.now();
  }, [translateY]);

  const handleHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const newDelta = touch.clientY - dragStartY.current;
    const newTranslateY = Math.max(0, dragStartTranslateY.current + newDelta);
    const maxTranslate = getSnapTranslateY('collapsed');
    setTranslateY(Math.min(newTranslateY, maxTranslate));
    lastTouchY.current = touch.clientY;
    lastTouchTime.current = Date.now();
  }, [isDragging, getSnapTranslateY]);

  const handleHandleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const velocityY = (lastTouchY.current - dragStartY.current) / Math.max(1, (Date.now() - lastTouchTime.current)) * 1000;
    snapToNearest(translateY, velocityY / 1000);
  }, [isDragging, translateY, snapToNearest]);

  // --- コンテンツエリアのタッチ: スクロール + シートドラッグ ---
  const handleContentTouchStart = useCallback((e: React.TouchEvent) => {
    const content = contentRef.current;
    if (!content) return;
    // インタラクティブ要素上ではドラッグしない（入力・ボタン操作を優先）
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea, button, a')) {
      contentDragRef.current = null;
      return;
    }
    const scrollTop = content.scrollTop;
    const contentOverflows = content.scrollHeight > content.clientHeight + 1;
    contentDragRef.current = {
      startY: e.touches[0].clientY,
      startTranslateY: translateY,
      canDragDown: scrollTop <= 0,
      canDragUp: !contentOverflows,
      isDraggingSheet: false,
      decided: false,
    };
    lastTouchY.current = e.touches[0].clientY;
    lastTouchTime.current = Date.now();
  }, [translateY]);

  const handleContentTouchMove = useCallback((e: React.TouchEvent) => {
    const state = contentDragRef.current;
    if (!state) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - state.startY;

    if (!state.decided && Math.abs(deltaY) > 8) {
      state.decided = true;
      if (state.canDragDown && deltaY > 0) {
        state.isDraggingSheet = true;
      } else if (state.canDragUp && deltaY < 0) {
        state.isDraggingSheet = true;
      }
    }

    if (state.isDraggingSheet) {
      e.preventDefault();
      const newTranslateY = Math.max(0, state.startTranslateY + deltaY);
      const maxTranslate = getSnapTranslateY('collapsed');
      setTranslateY(Math.min(newTranslateY, maxTranslate));
      setIsDragging(true);
      lastTouchY.current = currentY;
      lastTouchTime.current = Date.now();
    }
  }, [getSnapTranslateY]);

  const handleContentTouchEnd = useCallback(() => {
    const state = contentDragRef.current;
    if (!state) return;
    if (state.isDraggingSheet) {
      setIsDragging(false);
      const elapsed = Date.now() - lastTouchTime.current;
      const velocityY = (lastTouchY.current - state.startY) / Math.max(1, elapsed) * 1000;
      snapToNearest(translateY, velocityY / 1000);
    }
    contentDragRef.current = null;
  }, [translateY, snapToNearest]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

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

      if (input.routePreference.trim() && input.origin && input.destination) {
        const resolved = await resolveRoutePreference(
          input.routePreference,
          input.origin,
          input.destination,
          input.waypoints
        );
        input = { ...input, waypoints: resolved.waypoints, avoidAreas: resolved.avoidAreas };
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

  // --- フォーム入力部分（検索ボタンを除く） ---
  const formInputs = (
    <div className="space-y-3">
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
            className="min-w-[48px] min-h-[48px] px-2.5 rounded-xl text-sm border border-gray-600/50 bg-gray-800/70 text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors flex-shrink-0 disabled:opacity-50 flex items-center justify-center active:scale-[0.97]"
            title="現在地を使用"
          >
            {isLoadingLocation ? (
              <div className="spinner-glow" />
            ) : (
              '📌'
            )}
          </button>
        }
      />

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
                className="min-w-[48px] min-h-[48px] px-2.5 rounded-xl text-sm border border-gray-600/50 bg-gray-800/70 text-red-400 hover:border-red-500 active:bg-red-900/30 active:scale-[0.97] transition-colors flex-shrink-0 flex items-center justify-center"
                title="経由地を削除"
              >
                ✕
              </button>
            }
          />
        </div>
      ))}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={addWaypoint}
          className="flex-1 py-2.5 text-xs text-gray-400 hover:text-blue-400 active:text-blue-300 border border-dashed border-gray-600/50 hover:border-blue-500 rounded-xl transition-colors"
        >
          + 経由地を追加
        </button>
        <button
          type="button"
          onClick={() => {
            setSearchInput({
              ...searchInput,
              origin: searchInput.destination,
              originText: searchInput.destinationText,
              destination: searchInput.origin,
              destinationText: searchInput.originText,
              waypoints: [...searchInput.waypoints].reverse(),
            });
          }}
          className="min-w-[48px] min-h-[48px] px-3 text-lg text-gray-400 hover:text-blue-400 active:text-blue-300 active:scale-[0.95] border border-gray-600/50 hover:border-blue-500 rounded-xl transition-colors flex items-center justify-center"
          title="出発地と目的地を入れ替え"
        >
          ⇅
        </button>
      </div>

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
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">🕐</span>
          <input
            type="datetime-local"
            value={searchInput.departureTime}
            onChange={(e) =>
              setSearchInput({ ...searchInput, departureTime: e.target.value })
            }
            className="w-full glass-input text-white pl-9 pr-3 py-3 rounded-xl text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">ルートの希望（任意）</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none">📝</span>
          <input
            type="text"
            placeholder="例: 中央道経由、箱根を通りたい"
            value={searchInput.routePreference}
            onChange={(e) =>
              setSearchInput({ ...searchInput, routePreference: e.target.value })
            }
            className="w-full glass-input text-white pl-9 pr-3 py-3 rounded-xl text-sm"
          />
        </div>
      </div>
    </div>
  );

  const submitButton = (
    <button
      type="submit"
      disabled={
        isLoading ||
        (!searchInput.originText && !searchInput.origin) ||
        (!searchInput.destinationText && !searchInput.destination)
      }
      className={`w-full text-white py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] ${
        isLoading
          ? 'loading-shimmer'
          : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 active:from-blue-800 active:to-blue-700 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500'
      }`}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <span>検索中</span>
          <span className="loading-dots text-white/80">
            <span /><span /><span />
          </span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-2">
          <span>🔍</span>
          <span>経路と天気を検索</span>
        </span>
      )}
    </button>
  );

  // Desktop layout
  if (isDesktop) {
    return (
      <div className="absolute top-4 left-4 z-[1000] w-80 max-w-[calc(100vw-2rem)]">
        <div className="glass-panel rounded-xl max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div className="px-4 py-3 flex items-center justify-between text-white">
            <h2 className="text-lg font-bold">🏍 Touring Weather</h2>
          </div>
          <div className="px-4 pb-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              {formInputs}
              <div className="pt-1">{submitButton}</div>
            </form>
          </div>
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

  // Mobile layout
  const hasResults = !!multiRoute;
  const isCollapsed = translateY > getSnapTranslateY('half');
  const isKeyboardOpen = keyboardHeight > 0;

  return (
    <div
      ref={sheetRef}
      className={`fixed bottom-0 left-0 right-0 z-[1000] rounded-t-2xl overflow-x-hidden bottom-sheet ${
        hasResults ? 'bottom-sheet-results' : 'glass-panel'
      } ${isDragging || isKeyboardOpen ? 'bottom-sheet-dragging' : ''}`}
      style={
        isKeyboardOpen
          ? {
              top: `${vpState.offsetTop}px`,
              bottom: 'auto' as const,
              height: `${vpState.height}px`,
            }
          : {
              height: `${SHEET_HEIGHT_VH}vh`,
              transform: `translateY(${translateY}px)`,
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }
      }
    >
      {/* ドラッグハンドル */}
      <div
        ref={handleRef}
        className="w-full flex flex-col items-center pt-3 pb-1.5 cursor-grab active:cursor-grabbing touch-none"
        onTouchStart={handleHandleTouchStart}
        onTouchMove={handleHandleTouchMove}
        onTouchEnd={handleHandleTouchEnd}
        onClick={() => {
          if (isCollapsed) setTranslateY(getSnapTranslateY('half'));
        }}
      >
        <div className={`bottom-sheet-handle ${isDragging ? 'bottom-sheet-handle-active' : ''}`} />
      </div>

      {/* ヘッダー */}
      <div
        className="px-4 pb-2 flex items-center justify-between touch-none"
        onTouchStart={handleHandleTouchStart}
        onTouchMove={handleHandleTouchMove}
        onTouchEnd={handleHandleTouchEnd}
        onClick={() => {
          if (isCollapsed) setTranslateY(getSnapTranslateY('half'));
        }}
      >
        <h2 className="text-base font-bold text-white">🏍 Touring Weather</h2>
        {isCollapsed && (
          <span className="text-xs text-gray-400">▲ タップして展開</span>
        )}
      </div>

      {/* フォーム: スクロール領域 + 固定ボタン */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col"
        style={{ height: 'calc(100% - 64px)' }}
      >
        {/* スクロール可能なフォーム入力 — コンテンツドラッグでシート操作対応 */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-scroll overscroll-contain px-4"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={handleContentTouchStart}
          onTouchMove={handleContentTouchMove}
          onTouchEnd={handleContentTouchEnd}
        >
          {formInputs}
          <div className="h-3" />
        </div>

        {/* 検索ボタン — 固定 */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-white/10 touch-none">
          {submitButton}
        </div>
      </form>
    </div>
  );
}
