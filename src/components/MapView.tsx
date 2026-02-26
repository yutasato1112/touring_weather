'use client';

import { useEffect, useState, useRef } from 'react';
import { LatLng, RoutePoint, MultiRouteResult, RouteType, ROUTE_TYPE_COLORS, Waypoint, CongestionSegment, RouteRecommendation } from '@/types';
import { CONGESTION_COLORS } from '@/lib/traffic';

interface MapViewProps {
  routeGeometry?: [number, number][];
  routePoints?: RoutePoint[];
  onMapClick?: (lat: number, lng: number) => void;
  originMarker?: { lat: number; lng: number } | null;
  destinationMarker?: { lat: number; lng: number } | null;
  multiRoute?: MultiRouteResult | null;
  selectedRouteType?: RouteType;
  waypoints?: Waypoint[];
  /** Current location to center map on initially */
  initialCenter?: LatLng | null;
  /** 渋滞区間セグメント（選択中ルート） */
  congestionSegments?: CongestionSegment[];
  /** ルート推薦マッピング */
  routeRecommendation?: RouteRecommendation | null;
}

export default function MapView({
  routeGeometry,
  routePoints,
  onMapClick,
  originMarker,
  destinationMarker,
  multiRoute,
  selectedRouteType = 'fastest',
  waypoints,
  initialCenter,
  congestionSegments,
  routeRecommendation,
}: MapViewProps) {
  const [MapComponents, setMapComponents] = useState<any>(null);
  const mapRef = useRef<any>(null);
  const hasSetInitialView = useRef(false);

  useEffect(() => {
    import('react-leaflet').then((mod) => {
      setMapComponents(mod);
    });
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    import('leaflet').then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
    });
  }, []);

  // Zoom to current location when available (once)
  useEffect(() => {
    if (!mapRef.current || !initialCenter || hasSetInitialView.current) return;
    mapRef.current.setView([initialCenter.lat, initialCenter.lng], 14);
    hasSetInitialView.current = true;
  }, [initialCenter]);

  // fitBounds when route changes
  useEffect(() => {
    if (!mapRef.current || !routeGeometry || routeGeometry.length === 0) return;
    import('leaflet').then((L) => {
      const latLngs = routeGeometry.map(([lng, lat]) => L.latLng(lat, lng));
      const bounds = L.latLngBounds(latLngs);
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    });
  }, [routeGeometry]);

  if (!MapComponents) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 gap-4">
        <div className="relative flex items-center justify-center">
          <div className="map-loader-ring absolute" />
          <span className="text-xl">🗺</span>
        </div>
        <p className="text-gray-500 text-sm">地図を読み込み中</p>
      </div>
    );
  }

  const { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMapEvents } = MapComponents;

  // Convert ORS geometry [lng, lat] to Leaflet [lat, lng]
  const routeLatLngs = routeGeometry?.map(([lng, lat]) => [lat, lng] as [number, number]);

  // Build multi-route polylines (only base 3 routes — rain_avoid has no unique geometry)
  const baseRouteTypes: RouteType[] = ['fastest', 'no_highway', 'scenic'];
  const multiRouteLines: { type: RouteType; latLngs: [number, number][]; color: string }[] = [];

  // タブ選択 → 実際にハイライトするベースルートを解決
  const resolveEffectiveType = (): RouteType => {
    if (selectedRouteType === 'rain_avoid' && multiRoute?.rain_avoid?.baseRouteType) {
      return multiRoute.rain_avoid.baseRouteType;
    }
    if (routeRecommendation) {
      if (selectedRouteType === 'fastest') return routeRecommendation.fastest;
      if (selectedRouteType === 'no_highway') return routeRecommendation.no_highway;
    }
    return selectedRouteType;
  };
  const effectiveSelectedType = resolveEffectiveType();

  // 推薦先がタブ自体と異なる場合、タブの色でハイライト
  const highlightColor =
    effectiveSelectedType !== selectedRouteType
      ? ROUTE_TYPE_COLORS[selectedRouteType]
      : undefined;

  if (multiRoute) {
    baseRouteTypes.forEach((type) => {
      const route = multiRoute[type];
      if (route) {
        multiRouteLines.push({
          type,
          latLngs: route.geometry.map(([lng, lat]) => [lat, lng] as [number, number]),
          color: ROUTE_TYPE_COLORS[type],
        });
      }
    });
  }

  function MapClickHandler() {
    useMapEvents({
      click: (e: any) => {
        onMapClick?.(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  }

  function MapRefSetter() {
    const map = MapComponents.useMap();
    useEffect(() => {
      mapRef.current = map;
    }, [map]);
    return null;
  }

  // Default center: current location at neighborhood level, or Tokyo at city level
  const defaultCenter: [number, number] = initialCenter
    ? [initialCenter.lat, initialCenter.lng]
    : [35.68, 139.77];
  const defaultZoom = initialCenter ? 14 : 13;

  return (
    <MapContainer
      center={defaultCenter}
      zoom={defaultZoom}
      className="w-full h-full"
      style={{ background: '#1a1a2e' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler />
      <MapRefSetter />

      {/* Multi-route polylines: draw non-selected first, then selected on top */}
      {multiRouteLines
        .filter((r) => r.type !== effectiveSelectedType)
        .map((r) => (
          <Polyline
            key={`${r.type}-unselected`}
            positions={r.latLngs}
            pathOptions={{
              color: r.color,
              weight: 3,
              opacity: 0.3,
              dashArray: '8 6',
            }}
          />
        ))}
      {multiRouteLines
        .filter((r) => r.type === effectiveSelectedType)
        .map((r) => (
          <Polyline
            key={`${r.type}-selected`}
            positions={r.latLngs}
            pathOptions={{
              color: highlightColor ?? r.color,
              weight: 5,
              opacity: 0.9,
              dashArray: undefined,
            }}
          />
        ))}

      {/* Congestion overlay on selected route — key にルート種別を含めて切り替え時にリマウント */}
      {congestionSegments && congestionSegments.length > 0 && congestionSegments
        .filter((seg) => seg.level !== 'normal')
        .map((seg, i) => (
          <Polyline
            key={`congestion-${selectedRouteType}-${i}`}
            positions={seg.positions}
            pathOptions={{
              color: CONGESTION_COLORS[seg.level],
              weight: 7,
              opacity: 0.8,
            }}
          />
        ))}

      {/* Fallback: single route when no multiRoute */}
      {!multiRoute && routeLatLngs && (
        <Polyline positions={routeLatLngs} color="#3b82f6" weight={4} opacity={0.8} />
      )}

      {/* Route points (weather waypoints) */}
      {routePoints?.map((rp, i) => (
        <CircleMarker
          key={i}
          center={[rp.position.lat, rp.position.lng]}
          radius={6}
          fillColor="#f59e0b"
          fillOpacity={0.9}
          color="#fff"
          weight={2}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-bold">{rp.distanceFromStart.toFixed(0)} km 地点</p>
              <p>{new Date(rp.estimatedArrival).toLocaleString('ja-JP')}</p>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* Waypoint markers (purple) */}
      {waypoints?.map((wp, i) =>
        wp.position.lat !== 0 ? (
          <CircleMarker
            key={`wp-${i}`}
            center={[wp.position.lat, wp.position.lng]}
            radius={8}
            fillColor="#a855f7"
            fillOpacity={0.9}
            color="#fff"
            weight={2}
          >
            <Popup>経由地: {wp.label || `${i + 1}`}</Popup>
          </CircleMarker>
        ) : null
      )}

      {/* Origin marker */}
      {originMarker && (
        <CircleMarker
          center={[originMarker.lat, originMarker.lng]}
          radius={10}
          fillColor="#22c55e"
          fillOpacity={0.9}
          color="#fff"
          weight={2}
        >
          <Popup>出発地</Popup>
        </CircleMarker>
      )}

      {/* Destination marker */}
      {destinationMarker && (
        <CircleMarker
          center={[destinationMarker.lat, destinationMarker.lng]}
          radius={10}
          fillColor="#ef4444"
          fillOpacity={0.9}
          color="#fff"
          weight={2}
        >
          <Popup>目的地</Popup>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
