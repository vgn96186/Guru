/**
 * Drizzle-backed profile repository.
 *
 * Phase 2 implementation: uses Drizzle ORM directly instead of delegating to raw SQL.
 */

import { eq } from 'drizzle-orm';
import type { UserProfile } from '../../types';
import { getDrizzleDb } from '../drizzle';
import { userProfile } from '../drizzleSchema';
import {
  mapUserProfileRow,
  mapToDrizzleUpdate,
  createDefaultUserProfile,
} from '../utils/drizzleProfileMapper';

export const profileRepositoryDrizzle = {
  /** Fetch the single user_profile row and map it to UserProfile. */
  async getProfile(): Promise<UserProfile> {
    const db = getDrizzleDb();
    const rows = await db.select().from(userProfile).where(eq(userProfile.id, 1)).limit(1);

    if (rows.length === 0) {
      return createDefaultUserProfile();
    }

    return mapUserProfileRow(rows[0]);
  },

  /** Persist a partial update to user_profile. */
  async updateProfile(updates: Partial<UserProfile>): Promise<void> {
    const db = getDrizzleDb();
    const drizzleUpdate = mapToDrizzleUpdate(updates);

    if (Object.keys(drizzleUpdate).length === 0) {
      return; // No updates to apply
    }

    await db.update(userProfile).set(drizzleUpdate).where(eq(userProfile.id, 1));

    // Note: In the future, we might want to add notifyDbUpdate here
    // notifyDbUpdate(DB_EVENT_KEYS.PROFILE_UPDATED);
  },
};
