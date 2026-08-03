import { getMetadataArgsStorage } from 'typeorm';
import { CustomerSurvey } from './customer-survey.entity';

describe('CustomerSurvey entity', () => {
  it('should not define skinTypeId (Baumann type lives on customer profile)', () => {
    const columns = getMetadataArgsStorage()
      .columns.filter((entry) => entry.target === CustomerSurvey)
      .map((entry) => entry.propertyName);

    expect(columns).not.toContain('skinTypeId');
    expect(columns).toEqual(
      expect.arrayContaining([
        'customerId',
        'isCompleted',
        'completedAt',
        'faceImageUrl',
        'faceImageKey',
        'faceScannedAt',
      ]),
    );
  });
});
