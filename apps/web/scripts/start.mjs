import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { validateEnvironment } = require('@campusforge/shared/env');
try {
  validateEnvironment('web');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
process.env.NODE_ENV = 'production';
const nextCli = require.resolve('next/dist/bin/next');
process.argv = [process.argv[0], nextCli, 'start', ...process.argv.slice(2)];
await import(pathToFileURL(nextCli).href);
