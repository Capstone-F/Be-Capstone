import { haversineKm } from './haversine.util';

describe('haversineKm', () => {
  it('should return 0 for identical coordinates', () => {
    expect(haversineKm(10.7769, 106.7009, 10.7769, 106.7009)).toBe(0);
  });

  it('should be symmetric', () => {
    const a = haversineKm(10.7769, 106.7009, 21.0285, 105.8542);
    const b = haversineKm(21.0285, 105.8542, 10.7769, 106.7009);
    expect(a).toBeCloseTo(b, 5);
  });

  it('should approximate ~1 degree latitude as ~111 km', () => {
    const distance = haversineKm(0, 0, 1, 0);
    expect(distance).toBeGreaterThan(110);
    expect(distance).toBeLessThan(112);
  });

  it('should approximate Ho Chi Minh City to Hanoi distance (~1150 km)', () => {
    const distance = haversineKm(10.7769, 106.7009, 21.0285, 105.8542);
    expect(distance).toBeGreaterThan(1100);
    expect(distance).toBeLessThan(1200);
  });
});
