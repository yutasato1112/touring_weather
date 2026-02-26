'use client';

import { useState, useEffect } from 'react';
import { LatLng } from '@/types';
import { getCurrentLocationWithLabel } from '@/lib/geolocation';

interface UseCurrentLocationReturn {
  currentLocation: LatLng | null;
  currentLocationLabel: string;
  isLoading: boolean;
}

export function useCurrentLocation(): UseCurrentLocationReturn {
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [currentLocationLabel, setCurrentLocationLabel] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getCurrentLocationWithLabel()
      .then(({ position, label }) => {
        if (!cancelled) {
          setCurrentLocation(position);
          setCurrentLocationLabel(label);
        }
      })
      .catch(() => {
        // Silently fail - user can enter manually
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { currentLocation, currentLocationLabel, isLoading };
}
