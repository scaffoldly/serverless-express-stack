// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('./package.json');

const { SECRETS = '{}' } = process.env;

const secrets = {
  // Gather process.env so Codespaces secrets are included
  ...process.env,
  // Parse SECRETS so Github Actions Secrets are included
  ...JSON.parse(SECRETS),
};

module.exports.secrets = JSON.stringify(
  Object.entries(secrets).reduce((acc, [key, value]) => {
    if ((packageJson['inject-secrets'] || []).includes(key)) {
      acc[key] = value;
    }
    return acc;
  }, {}),
);
