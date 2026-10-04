import { z } from 'zod';
import {
  BCRYPT_PASSWORD_MAX_BYTES,
  LEGACY_PASSWORD_MAX_BYTES,
  isWellFormedPassword,
  passwordByteLength,
} from '../password-policy';

export const signUpSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().max(320).email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 UTF-8 bytes')
    .refine(isWellFormedPassword, 'Password contains invalid Unicode')
    .refine(
      (value) => passwordByteLength(value) <= BCRYPT_PASSWORD_MAX_BYTES,
      'Password must be at most 72 UTF-8 bytes',
    ),
});

export const signInSchema = z.object({
  email: z.string().max(320).email('Invalid email address'),
  // Existing bcrypt hashes retain their legacy comparison semantics. No truncation/prehash.
  password: z
    .string()
    .min(1, 'Password is required')
    .max(512, 'Password is too long')
    .refine(
      (value) => passwordByteLength(value) <= LEGACY_PASSWORD_MAX_BYTES,
      'Password is too long',
    ),
});

export const onboardingSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  university: z.string().min(1, 'University is required').max(200),
  major: z.string().min(1, 'Major is required').max(200),
  graduationYear: z
    .number()
    .int()
    .min(2020, 'Invalid graduation year')
    .max(2035, 'Invalid graduation year'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
