export enum OilyDry {
  OILY = 'O',
  DRY = 'D',
}

export enum SensitiveResistant {
  SENSITIVE = 'S',
  RESISTANT = 'R',
}

export enum PigmentedNonPigmented {
  PIGMENTED = 'P',
  NON_PIGMENTED = 'N',
}

export enum WrinkledTight {
  WRINKLED = 'W',
  TIGHT = 'T',
}

/** All 16 Baumann skin type codes (O/D × S/R × P/N × W/T). */
export const BAUMANN_SKIN_TYPE_CODES = [
  'OSPW',
  'OSPT',
  'OSNW',
  'OSNT',
  'ORPW',
  'ORPT',
  'ORNW',
  'ORNT',
  'DSPW',
  'DSPT',
  'DSNW',
  'DSNT',
  'DRPW',
  'DRPT',
  'DRNW',
  'DRNT',
] as const;

export type BaumannSkinTypeCode = (typeof BAUMANN_SKIN_TYPE_CODES)[number];
