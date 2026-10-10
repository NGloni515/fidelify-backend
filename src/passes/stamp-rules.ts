/**
 * Reglas puras de sellos (sin base de datos) para poder probarlas fácil.
 * Al llegar a `stampsRequired` sellos se gana un premio y el contador vuelve a cero.
 */
export function applyStamp(
  balance: number,
  rewardsReady: number,
  stampsRequired: number,
  count = 1,
) {
  if (stampsRequired < 1) throw new Error('stampsRequired debe ser al menos 1');
  if (count < 1) throw new Error('count debe ser al menos 1');
  const total = balance + count;
  return {
    balance: total % stampsRequired,
    rewardsReady: rewardsReady + Math.floor(total / stampsRequired),
    rewardEarned: total >= stampsRequired,
  };
}

export function applyRedeem(rewardsReady: number) {
  if (rewardsReady < 1)
    throw new Error('No hay premios disponibles para canjear');
  return { rewardsReady: rewardsReady - 1 };
}
