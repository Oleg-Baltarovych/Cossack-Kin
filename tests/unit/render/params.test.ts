import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { DEBUG_MODES, isDebugMode } from '../../../src/render/debug/modes.ts';
import { DEBUG_DEFAULTS, parseDebugParams, timeToMinutes, toRenderSettings } from '../../../src/render/debug/params.ts';
import { DEFAULT_RENDER_SETTINGS } from '../../../src/render/settings.ts';

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warn.mockRestore();
});

describe('parseDebugParams — valid', () => {
  it('no params → defaults, no warnings', () => {
    expect(parseDebugParams('', 'development')).toEqual(DEBUG_DEFAULTS);
    expect(warn).not.toHaveBeenCalled();
  });

  it('parses the full screenshot URL', () => {
    const params = parseDebugParams(
      '?seed=7&freeze&time=19:30&weather=rain&season=autumn&zone=sich&quality=low&overlay&cam=10.5&zoom=1&still&lineup&wind=storm',
      'test',
    );
    expect(params).toEqual({
      seed: 7,
      time: '19:30',
      weather: 'rain',
      season: 'autumn',
      zone: 'sich',
      freeze: 0,
      quality: 'low',
      overlay: true,
      cam: 10.5,
      zoom: 1,
      still: true,
      lineup: true,
      wind: 'storm',
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('freeze: bare flag → t=0, seconds → that animation time', () => {
    expect(parseDebugParams('?freeze', 'test').freeze).toBe(0);
    expect(parseDebugParams('?freeze=', 'test').freeze).toBe(0);
    expect(parseDebugParams('?freeze=true', 'test').freeze).toBe(0);
    expect(parseDebugParams('?freeze=12.5', 'test').freeze).toBe(12.5);
    expect(parseDebugParams('?freeze=0', 'test').freeze).toBe(0);
    expect(parseDebugParams('?freeze=false', 'test').freeze).toBe(false);
  });

  it('time accepts HH:MM and HHMM (screenshot file naming), normalised to HH:MM', () => {
    expect(parseDebugParams('?time=07:00', 'test').time).toBe('07:00');
    expect(parseDebugParams('?time=2300', 'test').time).toBe('23:00');
    expect(parseDebugParams('?time=7:05', 'test').time).toBe('07:05');
  });

  // M2-29 B3: calm / storm shots without hunting a seed whose wind window is open at the frozen time.
  it("wind takes the game's wind levels and reaches the render settings; absent = the game's wind", () => {
    for (const wind of ['calm', 'breeze', 'storm'] as const) {
      expect(toRenderSettings(parseDebugParams(`?wind=${wind}`, 'test')).fixedWind).toBe(wind);
    }
    expect(toRenderSettings(parseDebugParams('', 'test')).fixedWind).toBeNull();
    expect(DEFAULT_RENDER_SETTINGS.fixedWind).toBeNull();
  });

  it('overlay flag forms', () => {
    expect(parseDebugParams('?overlay', 'test').overlay).toBe(true);
    expect(parseDebugParams('?overlay=1', 'test').overlay).toBe(true);
    expect(parseDebugParams('?overlay=0', 'test').overlay).toBe(false);
  });

  it('works without the leading "?" and ignores unknown params', () => {
    expect(parseDebugParams('seed=3&utm_source=x', 'development').seed).toBe(3);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('parseDebugParams — invalid → default + console.warn', () => {
  it.each([
    ['seed=abc', 'seed'],
    ['seed=1.5', 'seed'],
    ['time=24:00', 'time'],
    ['time=12:60', 'time'],
    ['time=noon', 'time'],
    ['weather=snow', 'weather'],
    ['season=monsoon', 'season'],
    ['zone=moon', 'zone'],
    ['freeze=-1', 'freeze'],
    ['freeze=abc', 'freeze'],
    ['quality=ultra', 'quality'],
    ['overlay=maybe', 'overlay'],
    ['cam=left', 'cam'],
    ['cam=Infinity', 'cam'],
    ['zoom=2', 'zoom'],
    ['zoom=-1', 'zoom'],
    ['wind=gale', 'wind'],
    ['wind=1', 'wind'],
  ] as const)('%s', (query, key) => {
    const params = parseDebugParams(`?${query}`, 'development');
    expect(params[key]).toEqual(DEBUG_DEFAULTS[key]);
    expect(warn).toHaveBeenCalledTimes(1);
    // The raw value is a format argument, never part of the format string (L2).
    expect(warn.mock.calls[0]?.[0]).toBe('debug param %s=%o is invalid; using default %o');
    expect(warn.mock.calls[0]?.[1]).toBe(key);
  });

  it('one bad param does not reset the others', () => {
    const params = parseDebugParams('?weather=snow&zone=sich', 'development');
    expect(params.weather).toBe('clear');
    expect(params.zone).toBe('sich');
  });
});

describe('parseDebugParams — non-debug modes', () => {
  it.each(['production', 'staging', 'preview', '', 'Development'])(
    'mode %j always returns defaults and never warns (allowlist: development, test)',
    (mode) => {
      expect(parseDebugParams('?seed=7&freeze=3&time=23:00&weather=rain&overlay&zone=moon', mode)).toEqual(
        DEBUG_DEFAULTS,
      );
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('isDebugMode allows only development and test', () => {
    expect(DEBUG_MODES).toEqual(['development', 'test']);
    expect(isDebugMode('development')).toBe(true);
    expect(isDebugMode('test')).toBe(true);
    expect(isDebugMode('staging')).toBe(false);
    expect(isDebugMode('production')).toBe(false);
  });
});

describe('parseDebugParams — hostile input → defaults, never throws', () => {
  const nines = '9'.repeat(400);
  it.each([
    [`freeze=${nines}`, 'freeze'],
    ['freeze=1e999', 'freeze'],
    ['cam=1e999', 'cam'],
    [`cam=${nines}`, 'cam'],
    ['cam=NaN', 'cam'],
    [`seed=${nines}`, 'seed'],
    [`weather=${'rain'.repeat(100)}`, 'weather'],
    [`time=${'1'.repeat(5000)}`, 'time'],
    ['zone=%D1%81%D1%96%D1%87', 'zone'], // «січ» in Cyrillic
    ['weather=r%C3%A1in', 'weather'],
    ['season=%00summer', 'season'],
    ['freeze=%E2%80%8B', 'freeze'], // zero-width space
    ['cam=%EF%BC%91', 'cam'], // full-width digit 1
  ] as const)('%s', (query, key) => {
    let params: ReturnType<typeof parseDebugParams> | undefined;
    expect(() => {
      params = parseDebugParams(`?${query}`, 'development');
    }).not.toThrow();
    expect(params?.[key]).toEqual(DEBUG_DEFAULTS[key]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('prototype keys are ignored and do not pollute the result or Object.prototype', () => {
    const params = parseDebugParams('?__proto__=x&constructor=y&prototype=z&toString=1', 'development');
    expect(params).toEqual(DEBUG_DEFAULTS);
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('duplicated keys: the first value wins', () => {
    expect(parseDebugParams('?zone=sich&zone=farm', 'development').zone).toBe('sich');
  });

  it('a malformed query string does not throw', () => {
    expect(() => parseDebugParams('?%E0%A4%A&&&=&freeze=%', 'development')).not.toThrow();
  });
});

describe('timeToMinutes / toRenderSettings', () => {
  it('converts HH:MM to minutes after midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('19:30')).toBe(1170);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('defaults map onto the production render settings', () => {
    expect(toRenderSettings(DEBUG_DEFAULTS)).toEqual(DEFAULT_RENDER_SETTINGS);
  });

  it('maps every param', () => {
    const settings = toRenderSettings(
      parseDebugParams('?seed=2&freeze=12.5&time=13:00&overlay&cam=10.5&zoom=1&still', 'test'),
    );
    expect(settings).toMatchObject({
      seed: 2,
      frozenAt: 12.5,
      fixedMinutes: 780,
      showOverlay: true,
      camX: 10.5,
      zoom: 1,
      lessMotion: true,
    });
  });
});
