import { applyAdjust, applyRedeem, applyStamp } from './stamp-rules.js';

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

describe('applyAdjust', () => {
  it('suma sellos como si se hubieran dado en la caja', () => {
    expect(applyAdjust(3, 0, 8, 2)).toEqual({
      balance: 5,
      rewardsReady: 0,
      rewardEarned: false,
    });
    expect(applyAdjust(7, 0, 8, 2)).toEqual({
      balance: 1,
      rewardsReady: 1,
      rewardEarned: true,
    });
  });

  it('quita sellos del saldo', () => {
    expect(applyAdjust(5, 1, 8, -2)).toEqual({
      balance: 3,
      rewardsReady: 1,
      rewardEarned: false,
    });
  });

  it('quitar el sello que completó la tarjeta devuelve su premio', () => {
    expect(applyAdjust(0, 1, 8, -1)).toEqual({
      balance: 7,
      rewardsReady: 0,
      rewardEarned: false,
    });
  });

  it('no quita más sellos de los que tiene, contando los de sus premios', () => {
    expect(applyAdjust(2, 1, 8, -10)).toEqual({
      balance: 0,
      rewardsReady: 0,
      rewardEarned: false,
    });
    expect(() => applyAdjust(2, 1, 8, -11)).toThrow(
      'A esta tarjeta solo se le pueden quitar 10 sellos',
    );
    expect(() => applyAdjust(0, 0, 8, -1)).toThrow(
      'Esta tarjeta no tiene sellos para quitar',
    );
  });

  it('rechaza un ajuste de cero', () => {
    expect(() => applyAdjust(3, 0, 8, 0)).toThrow();
  });
});
