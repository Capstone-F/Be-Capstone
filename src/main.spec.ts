describe('main bootstrap', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('should log missing env keys and start app on config port', async () => {
    const create = jest.fn();
    const createDocument = jest.fn().mockReturnValue({ openapi: '3.0.0' });
    const setup = jest.fn();
    const log = jest.fn();
    const error = jest.fn();
    const listen = jest.fn().mockResolvedValue(undefined);
    const enableCors = jest.fn();
    const use = jest.fn();
    const useLogger = jest.fn();

    const mockConfig = {
      port: 3000,
      corsOrigin: 'http://localhost:5173',
      sessionSecret: 'test-secret',
      redisUrl: 'redis://localhost:6379',
      nodeEnv: 'test',
    };

    const pinoLogger = { log, error };
    let PinoLoggerClass: unknown;
    const get = jest.fn().mockImplementation((token: unknown) => {
      if (token === PinoLoggerClass) return pinoLogger;
      return mockConfig;
    });
    const set = jest.fn();
    create.mockResolvedValue({ get, listen, enableCors, use, useLogger, set });

    jest.isolateModules(() => {
      jest.doMock('./app.module', () => ({
        AppModule: class AppModuleMock {},
      }));
      jest.doMock('./config/config.service', () => ({
        AppConfigService: class AppConfigServiceMock {},
      }));
      jest.doMock('./config/env.config', () => ({
        ENV_DEFINITIONS: {
          DATABASE_URL: { required: true, description: 'db url' },
          KEYCLOAK_PUBLIC_URL: { required: true, description: 'keycloak url' },
        },
        getMissingRequiredEnv: () => ['DATABASE_URL'],
      }));
      jest.doMock('@nestjs/core', () => ({
        NestFactory: { create },
      }));
      jest.doMock('@nestjs/platform-express', () => ({
        NestExpressApplication: class {},
      }));
      jest.doMock('@nestjs/swagger', () => ({
        DocumentBuilder: class DocumentBuilderMock {
          setTitle() { return this; }
          setDescription() { return this; }
          setVersion() { return this; }
          addCookieAuth() { return this; }
          build() { return { openapi: '3.0.0' }; }
        },
        SwaggerModule: { createDocument, setup },
      }));
      const pinoMod = { Logger: class PinoLoggerMock {} };
      PinoLoggerClass = pinoMod.Logger;
      jest.doMock('nestjs-pino', () => pinoMod);
      jest.doMock('express-session', () => jest.fn().mockReturnValue(jest.fn()));
      jest.doMock('connect-redis', () => ({
        RedisStore: jest.fn().mockImplementation(() => ({})),
      }));
      jest.doMock('ioredis', () => ({
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({
          on: jest.fn().mockReturnThis(),
        })),
      }));

      require('./main');
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.anything(), { bufferLogs: true });
    expect(useLogger).toHaveBeenCalledWith(pinoLogger);
    expect(error).toHaveBeenCalledWith(
      'Missing required environment variables: DATABASE_URL',
      'Bootstrap',
    );
    expect(log).toHaveBeenCalledWith(
      'Tracked env keys: DATABASE_URL, KEYCLOAK_PUBLIC_URL',
      'Bootstrap',
    );
    expect(enableCors).toHaveBeenCalledWith({
      origin: 'http://localhost:5173',
      credentials: true,
    });
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(3000);
  });
});
