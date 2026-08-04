import {
  GUEST_TOKEN_HEADER,
  generateGuestToken,
  getGuestToken,
  hashGuestToken,
} from './guest-token';

describe('guest-token helpers', () => {
  it('hashes tokens deterministically', () => {
    const token = generateGuestToken();
    expect(hashGuestToken(token)).toBe(hashGuestToken(token));
    expect(hashGuestToken(token)).not.toBe(token);
  });

  it('reads X-Guest-Token header', () => {
    expect(
      getGuestToken({
        headers: { [GUEST_TOKEN_HEADER]: ' abc ' },
      } as never),
    ).toBe('abc');
    expect(getGuestToken({ headers: {} } as never)).toBeNull();
  });
});
