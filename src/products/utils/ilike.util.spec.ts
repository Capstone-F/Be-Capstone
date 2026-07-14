import { buildIlikePattern, escapeIlikeTerm } from './ilike.util';

describe('ilike.util', () => {
  describe('escapeIlikeTerm', () => {
    it('should escape ILIKE metacharacters % and _', () => {
      expect(escapeIlikeTerm('100%_off')).toBe('100\\%\\_off');
    });

    it('should escape backslashes first', () => {
      expect(escapeIlikeTerm('path\\to')).toBe('path\\\\to');
    });
  });

  describe('buildIlikePattern', () => {
    it('should wrap trimmed input with %', () => {
      expect(buildIlikePattern('Effaclar')).toBe('%Effaclar%');
    });

    it('should return empty string for blank input', () => {
      expect(buildIlikePattern('   ')).toBe('');
    });

    it('should treat SQL injection payloads as literal search text', () => {
      expect(buildIlikePattern("'; DROP TABLE products;--")).toBe(
        "%'; DROP TABLE products;--%",
      );
    });

    it('should escape ILIKE wildcards in the pattern', () => {
      expect(buildIlikePattern('100%_off')).toBe('%100\\%\\_off%');
    });
  });
});
