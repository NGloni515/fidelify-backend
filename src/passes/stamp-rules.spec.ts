import { applyRedeem, applyStamp } from './stamp-rules.js';

describe('applyStamp', () => {
  it('suma un sello sin premio', () => {
    expect(applyStamp(3, 0, 8)).toEqual({
      balance: 4,
      rewardsReady: 0,
      rewardEarned: false,
    });
  });

  it('al completar la tarjeta gana un premio y reinicia', () => {
    expect(applyStamp(7, 0, 8)).toEqual({
      balance: 0,
      rewardsReady: 1,
      rewardEarned: true,
    });
  });

  it('varios sellos de golpe pueden dar más de un premio', () => {
    expect(applyStamp(6, 1, 4, 3)).toEqual({
      balance: 1,
      rewardsReady: 3,
      rewardEarned: true,
    });
  });

  it('rechaza reglas inválidas', () => {
    expect(() => applyStamp(0, 0, 0)).toThrow();
    expect(() => applyStamp(0, 0, 8, 0)).toThrow();
  });
});

describe('applyRedeem', () => {
  it('descuenta un premio', () => {
    expect(applyRedeem(2)).toEqual({ rewardsReady: 1 });
  });

  it('falla si no hay premios', () => {
    expect(() => applyRedeem(0)).toThrow();
  });
});
