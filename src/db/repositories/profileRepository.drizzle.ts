/**
 * Drizzle-backed profile repository.
 *
 * Phase 2 implementation: delegates to the existing raw-SQL repository so the
 * mapping/sanitisation logic stays in one place while we prove out the
 * TanStack Query infrastructure.  Individual methods will be replaced with
 * Drizzle query-builder calls incrementally.
 */

import type { UserProfile } from '../../types';
import { profileRepository as legacyRepo } from './profileRepository';

export const profileRepositoryDrizzle = {
  /** Fetch the single user_profile row and map it to UserProfile. */
  getProfile: (): Promise<UserProfile> => legacyRepo.getProfile(),

  /** Persist a partial update to user_profile. */
  updateProfile: (updates: Partial<UserProfile>): Promise<void> =>
    legacyRepo.updateProfile(updates),
};
