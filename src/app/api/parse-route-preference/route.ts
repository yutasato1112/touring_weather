import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { geocodeSearchServer, fetchLoopPerimeter } from '@/lib/geocodeServer';
import {
  findLoopLocation,
  generateCircularWaypoints,
  orderPerimeterFromOrigin,
  haversineDistance,
  sortWaypointsByProjection,
  generateCirclePolygon,
  expandHighwayWaypoints,
  PROXIMITY_THRESHOLD_KM,
  DEFAULT_AVOID_RADIUS_KM,
} from '@/lib/routePreference';
import type { LatLng, Waypoint, AvoidArea, RouteCharacteristics } from '@/types';

interface ParseRequest {
  text: string;
  origin: LatLng;
  destination: LatLng;
  existingWaypoints: Waypoint[];
}

interface AIInstruction {
  type: 'waypoint' | 'avoid' | 'loop' | 'characteristic';
  placeName?: string;
  coordinates?: { lat: number; lng: number };
  avoidRadiusKm?: number;
  loopTarget?: string;
  characteristic?: 'coastal' | 'mountain' | 'scenic' | 'rural' | 'riverside' | 'forest';
}

const SYSTEM_PROMPT = `あなたは日本のツーリングルート計画アシスタントです。ユーザーのルート希望テキストを解析し、構造化された指示に変換してください。

## ルールと出力形式

各指示は以下の4タイプのいずれかです:

1. **waypoint**: 経由したい場所 → placeName（必須）、coordinates（わかれば）
2. **avoid**: 避けたい場所/道路 → placeName（必須）、avoidRadiusKm（デフォルト25）
3. **loop**: 周回ルート → loopTarget（周回対象名）
4. **characteristic**: 抽象的なルート特性 → characteristic（coastal/mountain/scenic/rural/riverside/forest）

## 判定ルール

- 「〜経由」「〜を通りたい」「〜を通って」「〜で行きたい」→ waypoint
- 「〜を避けて」「〜は通りたくない」「〜を使わない」「〜を利用しない」「〜は嫌」「〜NG」→ avoid
- 「〜一周」「〜周遊」「〜をぐるっと」→ loop
- 「海沿い」「海岸沿い」→ characteristic: coastal
- 「山道」「山の中」「峠道」→ characteristic: mountain
- 「景色がいい」「景色重視」「眺めがいい」→ characteristic: scenic
- 「田舎道」「のんびり」→ characteristic: rural
- 「川沿い」「河川沿い」→ characteristic: riverside
- 「森の中」「林道」→ characteristic: forest

**重要**: placeNameには必ずユーザーが言及した道路名・地名をそのまま使ってください。「東名高速経由」→ placeName:"東名高速"。勝手に別の道路名に変えないでください。

## よく使われる場所の座標（ジオコード不要）

高速道路:
- 東名高速: {lat:35.3192, lng:139.2700}
- 新東名高速: {lat:35.1500, lng:138.9000}
- 中央道: {lat:35.6600, lng:138.5700}
- 関越道: {lat:36.3900, lng:139.0600}
- 東北道: {lat:36.3200, lng:139.8200}
- 常磐道: {lat:35.8300, lng:139.8700}
- 圏央道: {lat:35.5500, lng:139.3400}
- 名神高速: {lat:35.2500, lng:136.8600}
- 新名神高速: {lat:34.9500, lng:136.4000}
- 伊勢湾岸道: {lat:35.0300, lng:136.8500}
- 北陸道: {lat:36.7600, lng:137.2100}
- 上信越道: {lat:36.3300, lng:138.1800}
- 磐越道: {lat:37.5000, lng:139.9000}
- 東海北陸道: {lat:35.8000, lng:136.9500}

ツーリングスポット:
- 箱根: {lat:35.2329, lng:139.0270}
- 伊豆: {lat:34.9700, lng:139.0700}
- 富士五湖/河口湖: {lat:35.5000, lng:138.7600}
- 富士山: {lat:35.3606, lng:138.7274}
- ビーナスライン: {lat:36.1100, lng:138.1800}
- 志賀草津: {lat:36.6500, lng:138.5800}
- 奥多摩: {lat:35.8100, lng:139.0900}
- 道志みち: {lat:35.5200, lng:139.0500}
- 日光: {lat:36.7376, lng:139.4960}
- 軽井沢: {lat:36.3480, lng:138.6360}

## 出力例

入力: "中央道経由"
→ [{type:"waypoint", placeName:"中央道", coordinates:{lat:35.66, lng:138.57}}]

入力: "東名を避けて"
→ [{type:"avoid", placeName:"東名高速"}]

入力: "琵琶湖一周"
→ [{type:"loop", loopTarget:"琵琶湖"}]

入力: "海沿いを走りたい"
→ [{type:"characteristic", characteristic:"coastal"}]

入力: "箱根を通って海沿い、東名を避けて"
→ [{type:"waypoint", placeName:"箱根", coordinates:{lat:35.2329, lng:139.0270}}, {type:"characteristic", characteristic:"coastal"}, {type:"avoid", placeName:"東名高速", coordinates:{lat:35.3192, lng:139.27}}]

入力: "景色のいい山道を通りたい"
→ [{type:"characteristic", characteristic:"scenic"}, {type:"characteristic", characteristic:"mountain"}]

入力: "東名高速経由で、新東名高速を利用しない"
→ [{type:"waypoint", placeName:"東名高速", coordinates:{lat:35.3192, lng:139.27}}, {type:"avoid", placeName:"新東名高速", coordinates:{lat:35.15, lng:138.9}}]

入力: "磐越道経由で会津若松を通りたい"
→ [{type:"waypoint", placeName:"磐越道", coordinates:{lat:37.5, lng:139.9}}, {type:"waypoint", placeName:"会津若松"}]

入力: "しまなみ海道を通りたい"
→ [{type:"waypoint", placeName:"しまなみ海道"}]

入力: "中央道経由で東名を避けて"
→ [{type:"waypoint", placeName:"中央道", coordinates:{lat:35.66, lng:138.57}}, {type:"avoid", placeName:"東名高速", coordinates:{lat:35.3192, lng:139.27}}]

## 注意事項
- 座標がわからない場所はcoordinatesを省略してください（後でジオコードで解決します）
- 上記の座標リストにある場所は必ずcoordinatesを含めてください
- 1つの入力に複数の指示が含まれる場合は全て抽出してください
- 日本語の文脈を正確に理解してください`;

const TOOL_DEFINITION: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'parse_route_preference',
    description: 'ルート希望テキストを構造化された指示に変換する',
    parameters: {
      type: 'object',
      properties: {
        instructions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['waypoint', 'avoid', 'loop', 'characteristic'],
              },
              placeName: { type: 'string' },
              coordinates: {
                type: 'object',
                properties: {
                  lat: { type: 'number' },
                  lng: { type: 'number' },
                },
              },
              avoidRadiusKm: { type: 'number' },
              loopTarget: { type: 'string' },
              characteristic: {
                type: 'string',
                enum: ['coastal', 'mountain', 'scenic', 'rural', 'riverside', 'forest'],
              },
            },
            required: ['type'],
          },
        },
      },
      required: ['instructions'],
    },
  },
};

/** 座標が日本国内かチェック */
function isValidJapanCoord(coord: { lat: number; lng: number }): boolean {
  return coord.lat >= 24 && coord.lat <= 46 && coord.lng >= 122 && coord.lng <= 154;
}

/** characteristic文字列をRouteCharacteristicsに変換 */
function mapCharacteristic(c: string): Partial<RouteCharacteristics> {
  switch (c) {
    case 'coastal': return { preferCoastal: true };
    case 'mountain': return { preferMountain: true };
    case 'scenic': return { preferScenic: true };
    case 'rural': return { preferRural: true };
    case 'riverside': return { preferRiverside: true };
    case 'forest': return { preferForest: true };
    default: return {};
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ fallback: true }, { status: 501 });
  }

  let body: ParseRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { text, origin, destination, existingWaypoints } = body;
  if (!text?.trim()) {
    return NextResponse.json({ waypoints: existingWaypoints || [], avoidAreas: [] });
  }

  try {
    const openai = new OpenAI({ apiKey, timeout: 8000 });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'function', function: { name: 'parse_route_preference' } },
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.type !== 'function') {
      return NextResponse.json({ fallback: true }, { status: 502 });
    }

    const args = toolCall.function.arguments;
    if (!args) {
      return NextResponse.json({ fallback: true }, { status: 502 });
    }

    let parsed: { instructions: AIInstruction[] };
    try {
      parsed = JSON.parse(args);
    } catch {
      console.error('AI parse: invalid JSON from tool call:', args);
      return NextResponse.json({ fallback: true }, { status: 502 });
    }

    console.log('AI parse instructions:', JSON.stringify(parsed.instructions));

    const resolvedWaypoints: Waypoint[] = [];
    const avoidAreas: AvoidArea[] = [];
    let routeCharacteristics: RouteCharacteristics = {};
    let isLoop = false;
    let loopLabel: string | undefined;

    for (const inst of parsed.instructions) {
      switch (inst.type) {
        case 'waypoint': {
          // 辞書にマルチポイントがあればそちらを優先（高速道路の「線」表現）
          const multiPoints = inst.placeName ? expandHighwayWaypoints(inst.placeName, origin, destination) : null;
          if (multiPoints && multiPoints.length > 0) {
            for (const wp of multiPoints) {
              resolvedWaypoints.push({
                position: wp,
                label: inst.placeName || '',
              });
            }
          } else if (inst.coordinates && isValidJapanCoord(inst.coordinates)) {
            resolvedWaypoints.push({
              position: { lat: inst.coordinates.lat, lng: inst.coordinates.lng },
              label: inst.placeName || '',
            });
          } else if (inst.placeName) {
            const results = await geocodeSearchServer(inst.placeName);
            if (results.length > 0) {
              resolvedWaypoints.push({
                position: { lat: results[0].lat, lng: results[0].lng },
                label: results[0].label,
              });
            }
          }
          break;
        }

        case 'avoid': {
          const radiusKm = Math.min(inst.avoidRadiusKm || DEFAULT_AVOID_RADIUS_KM, DEFAULT_AVOID_RADIUS_KM);
          if (inst.coordinates && isValidJapanCoord(inst.coordinates)) {
            avoidAreas.push({
              center: { lat: inst.coordinates.lat, lng: inst.coordinates.lng },
              radiusKm,
              label: inst.placeName || '',
            });
          } else if (inst.placeName) {
            const results = await geocodeSearchServer(inst.placeName);
            if (results.length > 0) {
              avoidAreas.push({
                center: { lat: results[0].lat, lng: results[0].lng },
                radiusKm,
                label: results[0].label,
              });
            }
          }
          break;
        }

        case 'loop': {
          const target = inst.loopTarget || inst.placeName || '';
          if (!target) break;

          isLoop = true;
          const loopLoc = findLoopLocation(target);
          if (loopLoc) {
            loopLabel = loopLoc.label;
            let perimeter: LatLng[];
            if (loopLoc.perimeterPoints) {
              perimeter = loopLoc.perimeterPoints;
            } else {
              perimeter = generateCircularWaypoints(
                loopLoc.center,
                loopLoc.radiusKm || 10,
                loopLoc.numPoints || 6
              );
            }
            const ordered = orderPerimeterFromOrigin(perimeter, origin);
            for (const pt of ordered) {
              resolvedWaypoints.push({ position: pt, label: loopLoc.label });
            }
          } else {
            // Nominatim ポリゴンフォールバック
            const polyResult = await fetchLoopPerimeter(target, 8);
            if (polyResult && polyResult.perimeterPoints.length >= 3) {
              loopLabel = `${target}一周`;
              const ordered = orderPerimeterFromOrigin(polyResult.perimeterPoints, origin);
              for (const pt of ordered) {
                resolvedWaypoints.push({ position: pt, label: loopLabel });
              }
            } else {
              // ジオコード + 円形生成フォールバック
              const results = await geocodeSearchServer(target);
              if (results.length > 0) {
                loopLabel = `${results[0].name || target}一周`;
                const center = { lat: results[0].lat, lng: results[0].lng };
                const perimeter = generateCircularWaypoints(center, 10, 6);
                const ordered = orderPerimeterFromOrigin(perimeter, origin);
                for (const pt of ordered) {
                  resolvedWaypoints.push({ position: pt, label: loopLabel });
                }
              }
            }
          }
          break;
        }

        case 'characteristic': {
          if (inst.characteristic) {
            routeCharacteristics = {
              ...routeCharacteristics,
              ...mapCharacteristic(inst.characteristic),
            };
          }
          break;
        }
      }
    }

    // 経由地の後処理
    let finalWaypoints: Waypoint[];
    const validExisting = (existingWaypoints || []).filter(
      (wp) => wp.position.lat !== 0 || wp.position.lng !== 0
    );

    if (resolvedWaypoints.length === 0) {
      finalWaypoints = existingWaypoints || [];
    } else if (isLoop) {
      finalWaypoints = [...resolvedWaypoints, ...validExisting];
    } else {
      // 近接フィルタ
      const filtered = resolvedWaypoints.filter((wp) => {
        const distFromOrigin = haversineDistance(wp.position, origin);
        const distFromDest = haversineDistance(wp.position, destination);
        return distFromOrigin >= PROXIMITY_THRESHOLD_KM && distFromDest >= PROXIMITY_THRESHOLD_KM;
      });

      if (filtered.length === 0) {
        finalWaypoints = existingWaypoints || [];
      } else {
        finalWaypoints = sortWaypointsByProjection(
          [...filtered, ...validExisting],
          origin,
          destination
        );
      }
    }

    // avoidAreas をポリゴンに変換
    const avoidPolygons = avoidAreas.map((a) => generateCirclePolygon(a.center, a.radiusKm));

    console.log('AI parse result:', {
      waypointCount: finalWaypoints.length,
      waypoints: finalWaypoints.map(w => ({ label: w.label, lat: w.position.lat.toFixed(4), lng: w.position.lng.toFixed(4) })),
      avoidCount: avoidAreas.length,
      isLoop,
      characteristics: routeCharacteristics,
    });

    return NextResponse.json({
      waypoints: finalWaypoints,
      avoidAreas,
      avoidPolygons,
      isLoop,
      loopLabel,
      routeCharacteristics: Object.keys(routeCharacteristics).length > 0 ? routeCharacteristics : undefined,
    });
  } catch (err) {
    console.error('AI parse error:', err);
    return NextResponse.json({ fallback: true }, { status: 502 });
  }
}
