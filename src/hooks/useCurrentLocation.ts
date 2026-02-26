'use client';

import { useState, useEffect, useCallback } from 'react';
import { LatLng } from '@/types';
import { getCurrentLocationWithLabel } from '@/lib/geolocation';

interface LocationResult {
  position: LatLng;
  label: string;
}

interface UseCurrentLocationReturn {
  currentLocation: LatLng | null;
  currentLocationLabel: string;
  isLoading: boolean;
  /** 位置情報を明示的に(再)取得する。取得結果を返す */
  requestLocation: () => Promise<LocationResult | null>;
}

export function useCurrentLocation(): UseCurrentLocationReturn {
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [currentLocationLabel, setCurrentLocationLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const requestLocation = useCallback(async (): Promise<LocationResult | null> => {
    setIsLoading(true);
    try {
      const { position, label } = await getCurrentLocationWithLabel();
      setCurrentLocation(position);
      setCurrentLocationLabel(label);
      return { position, label };
    } catch {
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初回マウント時に自動取得を試みる
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return { currentLocation, currentLocationLabel, isLoading, requestLocation };
}
