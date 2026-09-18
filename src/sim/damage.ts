import type { DamageType, EnemyDef } from './types';

export interface DamageInput {
  base: number;
  type: DamageType;
  armor: number;
  armorPierce?: number;
  resist?: EnemyDef['resist'];
  flying?: boolean;
  bonusVsAir?: number;
  critMultiplier?: number;
}

/**
 * Damage formula shared by every attack:
 *  - pierce damage is reduced by the target's armour (minus the weapon's armour piercing);
 *  - explosive damage is reduced by half the armour;
 *  - fire and true damage ignore armour entirely;
 *  - per-type resistances multiply the result;
 *  - flying targets take the weapon's air bonus.
 */
export function computeDamage(input: DamageInput): number {
  const pierce = input.armorPierce ?? 0;
  let armor = Math.max(0, Math.min(1, input.armor - pierce));
  if (input.type === 'explosive') armor *= 0.5;
  if (input.type === 'fire' || input.type === 'true') armor = 0;
  let dmg = input.base * (1 - armor);
  const resist = input.resist?.[input.type];
  if (resist !== undefined) dmg *= resist;
  if (input.flying && input.bonusVsAir) dmg *= input.bonusVsAir;
  if (input.critMultiplier) dmg *= input.critMultiplier;
  return Math.max(0, dmg);
}

/** Enemy hit points multiplier for a given wave number (1-based). */
export function waveHpMultiplier(
  wave: number,
  mapScale: number,
  difficultyMult: number,
  waveCount: number,
): number {
  const capped = Math.min(wave, waveCount);
  let mult = 1 + 0.03 * (capped - 1);
  if (wave > waveCount) mult *= Math.pow(1.075, wave - waveCount);
  return mult * mapScale * difficultyMult;
}
