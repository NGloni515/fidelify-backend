import {
  hexToRgb,
  rewardsText,
  stampsText,
  type WalletPass,
} from '../wallet-pass.js';

export interface ApplePassIdentity {
  passTypeIdentifier: string;
  teamIdentifier: string;
  // Absent when the API has no public HTTPS URL: the card installs but never updates.
  webServiceURL?: string;
}

export function buildApplePassProps(
  identity: ApplePassIdentity,
  pass: WalletPass,
) {
  const { colors } = pass.business;
  return {
    passTypeIdentifier: identity.passTypeIdentifier,
    teamIdentifier: identity.teamIdentifier,
    serialNumber: pass.serialNumber,
    organizationName: pass.business.name,
    description: `${pass.program.name} de ${pass.business.name}`,
    logoText: pass.business.name,
    backgroundColor: hexToRgb(colors.background),
    foregroundColor: hexToRgb(colors.foreground),
    labelColor: hexToRgb(colors.label),
    ...(identity.webServiceURL && {
      webServiceURL: identity.webServiceURL,
      authenticationToken: pass.authToken,
    }),
  };
}

// changeMessage is what iOS shows on the lock screen when the value changes.
export function buildApplePassFields(pass: WalletPass) {
  return {
    headerFields: [
      {
        key: 'stamps',
        label: 'SELLOS',
        value: stampsText(pass),
        changeMessage: 'Ahora tienes %@ sellos',
      },
    ],
    primaryFields: [
      { key: 'reward', label: 'AL COMPLETAR', value: pass.program.rewardText },
    ],
    secondaryFields: [
      { key: 'customer', label: 'CLIENTE', value: pass.customerName },
      {
        key: 'rewards',
        label: 'PREMIOS',
        value: rewardsText(pass.rewardsReady),
        changeMessage: 'Premios: %@',
      },
    ],
    backFields: [
      {
        key: 'how',
        label: 'Cómo funciona',
        value: `Muestra esta tarjeta en cada compra para recibir un sello. Al juntar ${pass.program.stampsRequired} te llevas ${pass.program.rewardText}.`,
      },
      { key: 'code', label: 'Código de tu tarjeta', value: pass.serialNumber },
      { key: 'fidelify', label: '', value: 'Tarjeta digital por Fidelify' },
    ],
    barcode: {
      message: pass.serialNumber,
      format: 'PKBarcodeFormatQR' as const,
      messageEncoding: 'iso-8859-1',
      altText: pass.serialNumber,
    },
  };
}
