'use server';

// Explicit fixture boundary: synthetic responses, no authentication or database.
export async function signInAction(formData: FormData) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return formData.get('email') === 'error@example.test'
    ? { success: false as const, error: 'Invalid email or password' }
    : { success: true as const, data: undefined };
}

export async function signUpAction(formData: FormData) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return formData.get('email') === 'error@example.test'
    ? { success: false as const, error: 'Please try again later.' }
    : { success: true as const, data: { email: String(formData.get('email')) } };
}

export async function completeOnboardingAction(_formData: FormData) {
  void _formData;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { success: false as const, error: 'Synthetic profile save error. Please try again.' };
}
