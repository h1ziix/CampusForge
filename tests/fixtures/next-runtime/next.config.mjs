import { resolve } from 'node:path';

export default {
  webpack(config) {
    config.resolve.alias['@campusforge/db'] = resolve(process.cwd(), 'src/fixture/db.ts');
    return config;
  },
};
