'use client';

import { useState, useTransition } from 'react';
import {
  signInAction,
  signUpAction,
  completeOnboardingAction,
} from '@/server/actions/r2-auth-entrance';

// Real application actions; infrastructure is explicitly synthetic.
export default function AuthEntrance() {
  const [result, setResult] = useState('');
  const [pending, start] = useTransition();
  return (
    <main className="p-6">
      <h1>Actual auth actions with synthetic infrastructure</h1>
      {(['signin', 'signup', 'onboarding'] as const).map((kind) => (
        <form
          key={kind}
          data-testid={kind}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            start(async () => {
              try {
                const action =
                  kind === 'signin'
                    ? signInAction
                    : kind === 'signup'
                      ? signUpAction
                      : completeOnboardingAction;
                setResult(JSON.stringify(await action(data)));
              } catch {
                setResult('Rejected by authenticated boundary');
              }
            });
          }}
        >
          <label>
            {kind} email
            <input name="email" defaultValue="r2-user-a@example.test" />
          </label>
          <label>
            {kind} password
            <input name="password" defaultValue="R2 synthetic password" />
          </label>
          <input name="name" defaultValue="R2 trusted onboarding name" />
          <input name="university" defaultValue="R2 synthetic university" />
          <input name="major" defaultValue="Computer science" />
          <input name="graduationYear" defaultValue="2028" />
          <button disabled={pending} type="submit">
            Actual {kind} action
          </button>
        </form>
      ))}
      <output data-testid="auth-result">{result}</output>
    </main>
  );
}
