import { validateEnvironment } from '../packages/shared/src/env.ts';

const scope = process.argv[2];
if (!['web', 'worker', 'build'].includes(scope)) {
  console.error('Usage: pnpm env:check web|worker|build');
  process.exit(1);
}
try {
  validateEnvironment(scope);
  console.log(`${scope} configuration is valid (values not logged).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
