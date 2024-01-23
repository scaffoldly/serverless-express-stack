const dotenv = require('dotenv');
const packageJson = require('../package.json');

const { SECRETS = '{}' } = process.env;

dotenv.config();

const secrets = {
  // Gather process.env so Codespaces secrets are included
  ...process.env,
  // Parse SECRETS so Github Actions Secrets are included
  ...JSON.parse(SECRETS),
};

// Copy anything that is in INCLUDE_SECRETS into module.exports.SECRETS
const includeSecrets = (process.env.INCLUDE_SECRETS || '').split(',');

module.exports.SECRETS = JSON.stringify(
  Object.entries(secrets).reduce((acc, [key, value]) => {
    if (includeSecrets.includes(key)) {
      acc[key] = value;
    }
    return acc;
  }, {}),
);

module.exports.SERVICE_NAME = packageJson.name;
