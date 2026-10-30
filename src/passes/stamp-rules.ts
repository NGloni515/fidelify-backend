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

// Works on every stamp the card holds, those inside unredeemed rewards
// included, so taking back the stamp that completed a card also takes back
// its reward: the exact inverse of applyStamp.
export function applyAdjust(
  balance: number,
  rewardsReady: number,
  stampsRequired: number,
  stamps: number,
) {
  if (stampsRequired < 1) throw new Error('stampsRequired debe ser al menos 1');
  if (stamps === 0)
    throw new Error('El ajuste tiene que sumar o quitar al menos 1 sello');
  const held = rewardsReady * stampsRequired + balance;
  const total = held + stamps;
  if (total < 0)
    throw new Error(
      held === 0
        ? 'Esta tarjeta no tiene sellos para quitar'
        : held === 1
          ? 'A esta tarjeta solo se le puede quitar 1 sello'
          : `A esta tarjeta solo se le pueden quitar ${held} sellos`,
    );
  const nextRewards = Math.floor(total / stampsRequired);
  return {
    balance: total % stampsRequired,
    rewardsReady: nextRewards,
    rewardEarned: nextRewards > rewardsReady,
  };
}
