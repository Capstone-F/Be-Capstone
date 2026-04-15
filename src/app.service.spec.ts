import { AppService } from './app.service';

describe('AppService', () => {
  it('should return Hello World', () => {
    const service = new AppService();
    expect(service.getHello()).toBe('Hello World!');
  });
});
