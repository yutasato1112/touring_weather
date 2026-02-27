'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { LatLng, Waypoint, RouteType, BaseRouteType, MultiRouteResult, RouteRecommendation } from '@/types';
import { NavService, generateNavigationUrl, isMobile } from '@/lib/navigationUrl';
import { resolveTabRoute } from '@/lib/route';

interface NavigationLauncherProps {
  origin: LatLng;
  destination: LatLng;
  waypoints: Waypoint[];
  selectedRouteType: RouteType;
  multiRoute: MultiRouteResult;
  routeRecommendation: RouteRecommendation | null;
}

export default function NavigationLauncher({
  origin,
  destination,
  waypoints,
  selectedRouteType,
  multiRoute,
  routeRecommendation,
}: NavigationLauncherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setMobile(isMobile());
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = useCallback(
    (service: NavService) => {
      // 実ルートを解決
      const resolved = routeRecommendation
        ? resolveTabRoute(selectedRouteType, multiRoute, routeRecommendation)
        : null;
      const geometry = resolved?.geometry;

      // タブ種別で avoid 設定を決定（一般道タブなら常に高速+有料回避）
      // rain_avoid のみ元ルートの種別を使う
      let navRouteType: BaseRouteType | undefined;
      if (selectedRouteType === 'rain_avoid') {
        const base = resolved?.baseRouteType ?? resolved?.routeType;
        navRouteType = base === 'rain_avoid' ? undefined : (base as BaseRouteType | undefined);
      } else {
        navRouteType = selectedRouteType as BaseRouteType;
      }

      const url = generateNavigationUrl(service, origin, destination, waypoints, {
        routeType: navRouteType,
        geometry,
      });
      window.open(url, '_blank');
      setOpen(false);
    },
    [origin, destination, waypoints, selectedRouteType, multiRoute, routeRecommendation]
  );

  const services: { id: NavService; icon: string; label: string; mobileOnly?: boolean }[] = [
    { id: 'google', icon: '/icons/google-maps.png', label: 'Google Maps' },
    { id: 'yahoo', icon: '/icons/yahoo-carnavi.png', label: 'Yahoo!カーナビ', mobileOnly: true },
    { id: 'apple', icon: '/icons/apple-maps.png', label: 'Apple Maps' },
  ];

  const visibleServices = services.filter((s) => !s.mobileOnly || mobile);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg active:scale-[0.97] transition-transform border border-white/20"
        style={{ background: 'rgba(10, 15, 30, 0.85)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        aria-label="ナビアプリで開く"
      >
        🧭
      </button>

      {open && (
        <div className="absolute top-14 right-0 glass-panel rounded-xl overflow-hidden shadow-xl min-w-[180px] animate-fade-in-up">
          {visibleServices.map((service) => (
            <button
              key={service.id}
              onClick={() => handleSelect(service.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-white/90 hover:bg-white/10 transition-colors"
            >
              <img src={service.icon} alt={service.label} width={24} height={24} className="flex-shrink-0 rounded" />
              <span>{service.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
