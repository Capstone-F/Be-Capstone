import {
  OilyDry,
  PigmentedNonPigmented,
  SensitiveResistant,
  WrinkledTight,
} from './skin-type.enums';

const BAUMANN_TYPE_CODES = [
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

function toBaumannCode(
  oilyDry: OilyDry,
  sensitiveResistant: SensitiveResistant,
  pigmentedNonPigmented: PigmentedNonPigmented,
  wrinkledTight: WrinkledTight,
): string {
  return `${oilyDry}${sensitiveResistant}${pigmentedNonPigmented}${wrinkledTight}`;
}

describe('Baumann skin typing enums', () => {
  it('should use single-letter values for each axis', () => {
    expect(OilyDry.OILY).toBe('O');
    expect(OilyDry.DRY).toBe('D');
    expect(SensitiveResistant.SENSITIVE).toBe('S');
    expect(SensitiveResistant.RESISTANT).toBe('R');
    expect(PigmentedNonPigmented.PIGMENTED).toBe('P');
    expect(PigmentedNonPigmented.NON_PIGMENTED).toBe('N');
    expect(WrinkledTight.WRINKLED).toBe('W');
    expect(WrinkledTight.TIGHT).toBe('T');
  });

  it('should compose all 16 Baumann type codes from axis enums', () => {
    const composed = new Set<string>();

    for (const oilyDry of Object.values(OilyDry)) {
      for (const sensitiveResistant of Object.values(SensitiveResistant)) {
        for (const pigmentedNonPigmented of Object.values(
          PigmentedNonPigmented,
        )) {
          for (const wrinkledTight of Object.values(WrinkledTight)) {
            composed.add(
              toBaumannCode(
                oilyDry,
                sensitiveResistant,
                pigmentedNonPigmented,
                wrinkledTight,
              ),
            );
          }
        }
      }
    }

    expect([...composed].sort()).toEqual([...BAUMANN_TYPE_CODES].sort());
    expect(composed.size).toBe(16);
  });
});
