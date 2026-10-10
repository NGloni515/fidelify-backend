import {
  DEFAULT_COLORS,
  hexToRgb,
  parseBrandColors,
  rewardsText,
} from './wallet-pass.js';

describe('parseBrandColors', () => {
  it('keeps valid business colors', () => {
    const less = {
      background: '#591223',
      foreground: '#EDE7AB',
      label: '#91CBFB',
    };
    expect(parseBrandColors(less)).toEqual(less);
  });

  it('falls back per color when one is missing or malformed', () => {
    expect(
      parseBrandColors({ background: '#591223', foreground: 'crema' }),
    ).toEqual({
      background: '#591223',
      foreground: DEFAULT_COLORS.foreground,
      label: DEFAULT_COLORS.label,
    });
  });

  it('falls back entirely when the business has no colors', () => {
    expect(parseBrandColors(null)).toEqual(DEFAULT_COLORS);
  });
});

describe('hexToRgb', () => {
  it('converts to the rgb() form Apple Wallet expects', () => {
    expect(hexToRgb('#591223')).toBe('rgb(89, 18, 35)');
    expect(hexToRgb('#FFFFFF')).toBe('rgb(255, 255, 255)');
    expect(hexToRgb('#000000')).toBe('rgb(0, 0, 0)');
  });
});

describe('rewardsText', () => {
  it('reads naturally for zero, one and many', () => {
    expect(rewardsText(0)).toBe('Ninguno todavía');
    expect(rewardsText(1)).toBe('1 por canjear');
    expect(rewardsText(3)).toBe('3 por canjear');
  });
});
