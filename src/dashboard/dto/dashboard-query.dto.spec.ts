import { validate } from 'class-validator';
import { DashboardQueryDto, DashboardRange } from './dashboard-query.dto';

describe('DashboardQueryDto', () => {
  it.each(Object.values(DashboardRange))('accepts range %s', async (range) => {
    const query = new DashboardQueryDto();
    query.range = range;

    await expect(validate(query)).resolves.toHaveLength(0);
  });

  it('rejects an unsupported range', async () => {
    const query = new DashboardQueryDto();
    query.range = '14d' as DashboardRange;

    const errors = await validate(query);

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isEnum');
  });
});
