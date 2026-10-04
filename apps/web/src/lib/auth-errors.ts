import { CredentialsSignin } from 'next-auth';
import { PasswordBudgetError } from './auth-rate-limit';

/** Auth.js preserves CredentialsSignin codes for direct API and server action callers. */
export class PasswordRequestRejected extends CredentialsSignin {
  readonly retryAfterSeconds: number;

  constructor(error: PasswordBudgetError) {
    super();
    this.code = error.reason === 'limited' ? 'rate_limited' : 'temporarily_unavailable';
    this.retryAfterSeconds = error.retryAfterSeconds;
  }
}
