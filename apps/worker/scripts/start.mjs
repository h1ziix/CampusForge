import { validateEnvironment } from '@campusforge/shared/env';

try {
  validateEnvironment('worker');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
process.env.NODE_ENV = 'production';
await import('../dist/index.js');
