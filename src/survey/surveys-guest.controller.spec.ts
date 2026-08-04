/**
 * Guest survey happy-path unit coverage via HTTP guards is in session/roles specs.
 * This file asserts face-scan stays auth-only at the controller layer.
 */
import { UnauthorizedException } from '@nestjs/common';
import { SurveysController } from './surveys.controller';
import { SurveyService } from './survey.service';

describe('SurveysController guest restrictions', () => {
  const surveyService = {
    submitFaceScan: jest.fn(),
    startGuestSurvey: jest.fn(),
  } as unknown as jest.Mocked<SurveyService>;

  const controller = new SurveysController(surveyService);

  it('face-scan requires authenticated userId (guest token alone is not enough)', () => {
    const req = {
      session: {},
      headers: { 'x-guest-token': 'guest-token-value' },
    } as never;

    expect(() =>
      controller.submitFaceScan(req, 'survey-id', {
        buffer: Buffer.from('x'),
        mimetype: 'image/jpeg',
        originalname: 'face.jpg',
      } as Express.Multer.File),
    ).toThrow(UnauthorizedException);
    expect(surveyService.submitFaceScan).not.toHaveBeenCalled();
  });
});
