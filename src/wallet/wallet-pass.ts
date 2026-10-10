export interface BrandColors {
  background: string;
  foreground: string;
  label: string;
}

export interface WalletPass {
  id: string;
  serialNumber: string;
  authToken: string;
  balance: number;
  rewardsReady: number;
  updatedAt: Date;
  customerName: string;
  program: {
    id: string;
    name: string;
    stampsRequired: number;
    rewardText: string;
  };
  business: { name: string; logoUrl: string | null; colors: BrandColors };
}

// Fidelify's accent: the fallback for a business that has not set its colors.
export const DEFAULT_COLORS: BrandColors = {
  background: '#C2185B',
  foreground: '#FFFFFF',
  label: '#FCE4EC',
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function parseBrandColors(value: unknown): BrandColors {
  const colors = (value ?? {}) as Partial<Record<keyof BrandColors, unknown>>;
  const pick = (key: keyof BrandColors) => {
    const color = colors[key];
    return typeof color === 'string' && HEX_COLOR.test(color)
      ? color
      : DEFAULT_COLORS[key];
  };
  return {
    background: pick('background'),
    foreground: pick('foreground'),
    label: pick('label'),
  };
}

export function hexToRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16}, ${(value >> 8) & 0xff}, ${value & 0xff})`;
}

export function stampsText(pass: WalletPass): string {
  return `${pass.balance} de ${pass.program.stampsRequired}`;
}

export function rewardsText(rewardsReady: number): string {
  if (rewardsReady === 0) return 'Ninguno todavía';
  return rewardsReady === 1 ? '1 por canjear' : `${rewardsReady} por canjear`;
}
