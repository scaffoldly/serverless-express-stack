(async () => {
  try {
    const packageJson = require('../package.json');
    const { generateSpec, generateRoutes } = require('@tsoa/cli');
    const { NODE_ENV } = process.env;

    console.log('Generating spec...');
    await generateSpec({
      basePath: `/${NODE_ENV}`,
      name: packageJson.name,
      description: packageJson.description,
      version: packageJson.version,
      entryFile: 'src/app.ts',
      noImplicitAdditionalProperties: 'throw-on-extras',
      controllerPathGlobs: ['src/api/index.ts', 'src/api/*-api.ts'],
      outputDirectory: 'src',
      specVersion: 3,
      securityDefinitions: {
        jwt: JSON.parse(
          JSON.stringify({
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          }),
        ),
      },
    });

    console.log('Generating routes...');
    await generateRoutes({
      entryFile: 'src/app.ts',
      noImplicitAdditionalProperties: 'throw-on-extras',
      controllerPathGlobs: ['src/api/index.ts', 'src/api/*-api.ts'],
      routesDir: 'src',
      authenticationModule: 'src/auth.ts',
      noWriteIfUnchanged: true,
    });
  } catch (e: any) {
    console.warn('Error generating code', e.message);
    throw e;
  }
})();
