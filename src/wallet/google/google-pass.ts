import { rewardsText, stampsText, type WalletPass } from '../wallet-pass.js';

const LANGUAGE = 'es';

const localized = (value: string) => ({
  defaultValue: { language: LANGUAGE, value },
});

export function googleClassId(issuerId: string, programId: string) {
  return `${issuerId}.fidelify_program_${programId}`;
}

export function googleObjectId(issuerId: string, passId: string) {
  return `${issuerId}.fidelify_pass_${passId}`;
}

export function buildGoogleClass(issuerId: string, pass: WalletPass) {
  const field = (id: string) => ({
    firstValue: {
      fields: [{ fieldPath: `object.textModulesData['${id}']` }],
    },
  });
  return {
    id: googleClassId(issuerId, pass.program.id),
    classTemplateInfo: {
      cardTemplateOverride: {
        cardRowTemplateInfos: [
          {
            twoItems: { startItem: field('stamps'), endItem: field('rewards') },
          },
        ],
      },
    },
  };
}

// The part of the object that changes with every stamp; also the PATCH body.
export function buildGoogleBalance(pass: WalletPass) {
  return {
    textModulesData: [
      { id: 'stamps', header: 'Sellos', body: stampsText(pass) },
      {
        id: 'rewards',
        header: 'Premios',
        body: rewardsText(pass.rewardsReady),
      },
      { id: 'reward', header: 'Al completar', body: pass.program.rewardText },
    ],
  };
}

export function buildGoogleObject(issuerId: string, pass: WalletPass) {
  return {
    id: googleObjectId(issuerId, pass.id),
    classId: googleClassId(issuerId, pass.program.id),
    state: 'ACTIVE',
    cardTitle: localized(pass.business.name),
    subheader: localized(pass.program.name),
    header: localized(pass.customerName),
    hexBackgroundColor: pass.business.colors.background,
    ...(pass.business.logoUrl && {
      logo: {
        sourceUri: { uri: pass.business.logoUrl },
        contentDescription: localized(pass.business.name),
      },
    }),
    barcode: {
      type: 'QR_CODE',
      value: pass.serialNumber,
      alternateText: pass.serialNumber,
    },
    ...buildGoogleBalance(pass),
  };
}
