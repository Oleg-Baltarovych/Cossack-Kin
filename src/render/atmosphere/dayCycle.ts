// Time of day (plan §0, ART-04): which two sky/LUT keys are blended and where the sun and moon stand.
// Pure: minutes in, numbers out. Tuning lives in config.ts.
import {
  ARC_WIDTH,
  LATITUDE_DEG,
  MOON_DECLINATION_DEG,
  MOON_TRANSIT,
  SKY_FOV_DEG,
  SKY_KEYS,
  SOLAR_NOON,
  SUN_DECLINATION_DEG,
  SUN_X_HIGH,
  SUN_X_LOW,
  type SkyKeyId,
} from './config.ts';

const DAY = 1440;
const FALLBACK_MINUTES = 13 * 60;
const RAD = Math.PI / 180;

export interface SkyPoint {
  /** Share of the view width (0 = left/east, 1 = right/west); may leave 0..1 near rise/set. */
  readonly x: number;
  /** Altitude as a share of the sky band (0 = horizon, 1 = top); negative = below the horizon. */
  readonly y: number;
}

export interface DayCycle {
  readonly keyA: SkyKeyId;
  readonly keyB: SkyKeyId;
  /** Blend weight of keyB (0 = keyA only); smoothstep-eased over the transition. */
  readonly t: number;
  readonly sun: SkyPoint;
  readonly moon: SkyPoint;
}

export function wrapMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return FALLBACK_MINUTES;
  const m = minutes % DAY;
  return m < 0 ? m + DAY : m;
}

export function dayCycle(minutes: number): DayCycle {
  const m = wrapMinutes(minutes);
  const { keyA, keyB, t } = blendKeys(m);
  return {
    keyA,
    keyB,
    t,
    sun: leftSun(skyPoint(m, SOLAR_NOON, SUN_DECLINATION_DEG)),
    moon: skyPoint(m, MOON_TRANSIT, MOON_DECLINATION_DEG),
  };
}

/** Highest sun altitude of the day (at solar noon), as a share of the sky band. */
const NOON_Y = skyPoint(SOLAR_NOON, SOLAR_NOON, SUN_DECLINATION_DEG).y;

/** Art convention (config.ts SUN_X_*): x from altitude, so the visible sun always stays on the left. */
function leftSun(p: SkyPoint): SkyPoint {
  const h = Math.max(0, Math.min(1, p.y / NOON_Y));
  return { x: SUN_X_LOW + (SUN_X_HIGH - SUN_X_LOW) * h, y: p.y };
}

function blendKeys(m: number): { keyA: SkyKeyId; keyB: SkyKeyId; t: number } {
  const n = SKY_KEYS.length;
  // The key whose `at` is the latest one not after m (the last key covers the time before the first).
  let index = n - 1;
  for (let i = 0; i < n; i++) {
    const key = SKY_KEYS[i];
    if (key && key.at <= m) index = i;
  }
  const a = SKY_KEYS[index];
  const b = SKY_KEYS[(index + 1) % n];
  if (!a || !b) throw new Error('dayCycle: SKY_KEYS is empty');
  const since = m >= a.at ? m - a.at : m + DAY - a.at;
  const span = (b.at - a.at + DAY) % DAY || DAY;
  if (since <= a.hold) return { keyA: a.id, keyB: a.id, t: 0 };
  const u = (since - a.hold) / (span - a.hold);
  return { keyA: a.id, keyB: b.id, t: u * u * (3 - 2 * u) };
}

/**
 * Body on a circle of constant declination: altitude from the hour angle (standard solar formula), x from
 * the hour angle relative to the rise/set hour angle, so rise is at the left end of the arc and set at the right.
 */
function skyPoint(m: number, transit: number, declinationDeg: number): SkyPoint {
  let fromTransit = m - transit;
  if (fromTransit > DAY / 2) fromTransit -= DAY;
  if (fromTransit < -DAY / 2) fromTransit += DAY;
  const hourAngle = (fromTransit / 60) * 15 * RAD;
  const lat = LATITUDE_DEG * RAD;
  const dec = declinationDeg * RAD;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) / RAD;
  const cosRise = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(dec)));
  const riseAngle = Math.acos(cosRise);
  return { x: 0.5 + 0.5 * ARC_WIDTH * (hourAngle / riseAngle), y: altitude / SKY_FOV_DEG };
}
