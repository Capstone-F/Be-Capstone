import { generateToken04 } from './zego-server-assistant';

describe('generateToken04', () => {
  const secret = 'abcdefghijklmnopqrstuvwxyz123456';

  it('returns a Token04 string', () => {
    const token = generateToken04(
      123456,
      'user-1',
      secret,
      7200,
      '{"room_id":"consult_x"}',
    );
    expect(token.startsWith('04')).toBe(true);
    expect(token.length).toBeGreaterThan(10);
  });

  it('rejects a secret that is not 32 bytes', () => {
    expect(() =>
      generateToken04(123456, 'user-1', 'short', 7200, ''),
    ).toThrow();
  });
});
