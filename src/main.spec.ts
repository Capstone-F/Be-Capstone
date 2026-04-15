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
    const get = jest.fn().mockReturnValue({ port: 3000 });

    create.mockResolvedValue({ get, listen });

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
          KEYCLOAK_URL: { required: true, description: 'keycloak url' },
        },
        getMissingRequiredEnv: () => ['DATABASE_URL'],
      }));
      jest.doMock('@nestjs/core', () => ({
        NestFactory: { create },
      }));
      jest.doMock('@nestjs/swagger', () => ({
        DocumentBuilder: class DocumentBuilderMock {
          setTitle() {
            return this;
          }
          setDescription() {
            return this;
          }
          setVersion() {
            return this;
          }
          build() {
            return { openapi: '3.0.0' };
          }
        },
        SwaggerModule: {
          createDocument,
          setup,
        },
      }));
      jest.doMock('@nestjs/common', () => ({
        Logger: jest.fn().mockImplementation(() => ({ log, error })),
      }));

      require('./main');
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Missing required environment variables: DATABASE_URL',
    );
    expect(log).toHaveBeenCalledWith(
      'Tracked env keys: DATABASE_URL, KEYCLOAK_URL',
    );
    expect(createDocument).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledWith('docs', expect.any(Object), {
      openapi: '3.0.0',
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(3000);
  });
});
