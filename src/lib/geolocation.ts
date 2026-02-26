import { LatLng } from '@/types';

/**
 * ブラウザの Geolocation API で現在地を取得する
 */
export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(`位置情報の取得に失敗しました: ${error.message}`));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

/**
 * 逆ジオコーディング: 座標から住所ラベルを取得する
 */
export async function reverseGeocode(position: LatLng): Promise<string> {
  try {
    const response = await fetch(
      `/api/reverse-geocode?lat=${position.lat}&lng=${position.lng}`
    );
    if (!response.ok) return `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
    const data = await response.json();
    return data.label || `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
  } catch {
    return `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
  }
}

/**
 * 現在地を取得し、住所ラベル付きで返す
 */
export async function getCurrentLocationWithLabel(): Promise<{ position: LatLng; label: string }> {
  const position = await getCurrentPosition();
  const label = await reverseGeocode(position);
  return { position, label };
}
