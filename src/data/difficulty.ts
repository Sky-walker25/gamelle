import type { DifficultyDef, DifficultyId } from '@/sim/types';

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  easy: { id: 'easy', hpMult: 0.8, goldMult: 1.2, livesMult: 1.5, rewardStars: 1 },
  normal: { id: 'normal', hpMult: 1, goldMult: 1, livesMult: 1, rewardStars: 2 },
  hard: { id: 'hard', hpMult: 1.3, goldMult: 0.85, livesMult: 0.6, rewardStars: 3 },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard'];

/** Seconds between the end of a wave and the automatic start of the next one. */
export const WAVE_COUNTDOWN = 18;
/** Gold per remaining countdown second when the player calls the next wave early. */
export const EARLY_CALL_GOLD_PER_SECOND = 1.5;
/** Passive interest granted on wave clear (fraction of current gold, capped). */
export const INTEREST_RATE = 0.03;
export const INTEREST_CAP = 40;
