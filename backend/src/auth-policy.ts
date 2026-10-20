import { ApiError } from './errors.js';

export const UNIVERSITY_EMAIL_DOMAINS = ['aucklanduni.ac.nz', 'auckland.ac.nz'] as const;

export function isUniversityEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf('@');
  if (separator <= 0 || separator === normalized.length - 1) return false;
  const domain = normalized.slice(separator + 1);
  return UNIVERSITY_EMAIL_DOMAINS.some((allowed) => domain === allowed);
}

export function requireUniversityEmail(email: string | null | undefined): void {
  if (isUniversityEmail(email)) return;
  throw new ApiError(
    403,
    'Use a University of Auckland email ending in @aucklanduni.ac.nz or @auckland.ac.nz.',
    'UNIVERSITY_EMAIL_REQUIRED'
  );
}
