import {
  brainDumpsRepositoryDrizzle,
  type BrainDumpLog,
} from '../repositories/brainDumpsRepository.drizzle';

export type { BrainDumpLog };

export const addBrainDump = brainDumpsRepositoryDrizzle.addBrainDump;
export const getBrainDumps = brainDumpsRepositoryDrizzle.getBrainDumps;
export const clearBrainDumps = brainDumpsRepositoryDrizzle.clearBrainDumps;
export const deleteBrainDump = brainDumpsRepositoryDrizzle.deleteBrainDump;
