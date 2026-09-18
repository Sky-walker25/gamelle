import type { TowerDef, TowerLevelDef } from '@/sim/types';

const T = 64; // tile size in world pixels, used to express ranges in tiles

type Partial4 = Omit<TowerLevelDef, 'targetsAir' | 'targetsGround' | 'attack' | 'damageType'> &
  Partial<Pick<TowerLevelDef, 'targetsAir' | 'targetsGround' | 'attack' | 'damageType'>>;

function line(
  base: Pick<TowerLevelDef, 'attack' | 'damageType' | 'targetsAir' | 'targetsGround'>,
  levels: Partial4[],
): TowerLevelDef[] {
  return levels.map((l) => ({ ...base, ...l }) as TowerLevelDef);
}

// ---------------------------------------------------------------------------
// 1. Archers — rapid single-target fire, hits air and ground.
// ---------------------------------------------------------------------------
const archers = line(
  { attack: 'projectile', damageType: 'pierce', targetsAir: true, targetsGround: true },
  [
    {
      name: { fr: 'Archers', en: 'Archers' },
      era: 'medieval',
      year: '~1200',
      cost: 70,
      range: 2.7 * T,
      cooldown: 0.7,
      damage: 9,
      projectileSpeed: 520,
      description: {
        fr: 'Tir rapide et bon marché. Touche les cibles au sol et en vol.',
        en: 'Cheap, rapid fire. Hits ground and air targets.',
      },
      lore: {
        fr: "L'archer médiéval tire six à dix flèches par minute. Les tours de guet en bois protégeaient les murs des châteaux dès le XIIe siècle.",
        en: 'A medieval archer looses six to ten arrows a minute. Wooden watchtowers guarded castle walls from the 12th century on.',
      },
    },
    {
      name: { fr: 'Arbalétriers', en: 'Crossbowmen' },
      era: 'medieval',
      year: '~1350',
      cost: 85,
      range: 2.9 * T,
      cooldown: 0.75,
      damage: 18,
      armorPierce: 0.15,
      projectileSpeed: 600,
      description: {
        fr: 'Carreaux plus lourds qui percent une partie de l’armure.',
        en: 'Heavier bolts that punch through part of the armour.',
      },
      lore: {
        fr: 'L’arbalète génoise, redoutée à Crécy (1346), perçait les cottes de mailles à 80 mètres.',
        en: 'The Genoese crossbow, feared at Crécy (1346), pierced mail at 80 metres.',
      },
    },
    {
      name: { fr: 'Mousquetaires', en: 'Musketeers' },
      era: 'renaissance',
      year: '~1650',
      cost: 130,
      range: 3.2 * T,
      cooldown: 0.8,
      damage: 34,
      armorPierce: 0.25,
      attack: 'hitscan',
      description: {
        fr: 'Salves de mousquet : dégâts élevés, impact instantané.',
        en: 'Musket volleys: high damage, instant impact.',
      },
      lore: {
        fr: 'Les mousquetaires de la Maison du Roi (1622) manient un mousquet à mèche capable de percer un plastron à 50 pas.',
        en: 'The King’s Musketeers (1622) carried matchlock muskets able to pierce a breastplate at 50 paces.',
      },
    },
    {
      name: { fr: 'Mitrailleuse Gatling', en: 'Gatling Gun' },
      era: 'industrial',
      year: '1862',
      cost: 240,
      range: 3.2 * T,
      cooldown: 0.13,
      damage: 13,
      armorPierce: 0.2,
      attack: 'hitscan',
      description: {
        fr: 'Cadence de tir extrême. Idéale contre les essaims.',
        en: 'Extreme rate of fire. Ideal against swarms.',
      },
      lore: {
        fr: 'Brevetée par Richard Gatling en 1862, la Gatling à manivelle tire 200 coups par minute pendant la guerre de Sécession.',
        en: 'Patented by Richard Gatling in 1862, the hand-cranked Gatling fired 200 rounds a minute during the American Civil War.',
      },
    },
    {
      name: { fr: 'Fusiliers Lebel', en: 'Lebel Riflemen' },
      era: 'industrial',
      year: '1886',
      cost: 240,
      range: 4.1 * T,
      cooldown: 0.95,
      damage: 80,
      armorPierce: 0.4,
      attack: 'hitscan',
      crit: { chance: 0.2, multiplier: 2 },
      description: {
        fr: 'Longue portée, gros dégâts et 20 % de coups critiques.',
        en: 'Long range, heavy damage and a 20% critical hit chance.',
      },
      lore: {
        fr: 'Le fusil Lebel modèle 1886 est le premier fusil militaire à poudre sans fumée ; précis jusqu’à 400 mètres.',
        en: 'The 1886 Lebel was the first military rifle firing smokeless powder, accurate out to 400 metres.',
      },
    },
  ],
);

// ---------------------------------------------------------------------------
// 2. Ballista — heavy single-target, armour-piercing.
// ---------------------------------------------------------------------------
const ballista = line(
  { attack: 'projectile', damageType: 'pierce', targetsAir: true, targetsGround: true },
  [
    {
      name: { fr: 'Baliste', en: 'Ballista' },
      era: 'antiquity',
      year: '~400 av. J.-C.',
      cost: 110,
      range: 3.5 * T,
      cooldown: 2.0,
      damage: 48,
      armorPierce: 0.5,
      projectileSpeed: 700,
      description: {
        fr: 'Trait lourd qui ignore la moitié de l’armure. Tir lent.',
        en: 'A heavy bolt that ignores half the armour. Slow rate of fire.',
      },
      lore: {
        fr: 'Inventée à Syracuse vers 400 av. J.-C., la baliste romaine propulse un trait d’un kilo à plus de 300 mètres.',
        en: 'Invented in Syracuse around 400 BC, the Roman ballista hurled a one-kilo bolt over 300 metres.',
      },
    },
    {
      name: { fr: 'Couleuvrine', en: 'Culverin' },
      era: 'renaissance',
      year: '~1450',
      cost: 130,
      range: 3.8 * T,
      cooldown: 2.0,
      damage: 95,
      armorPierce: 0.6,
      projectileSpeed: 800,
      description: {
        fr: 'Canon long à tir tendu, perce 60 % de l’armure.',
        en: 'Long-barrelled gun with a flat trajectory, ignores 60% of armour.',
      },
      lore: {
        fr: 'La couleuvrine du XVe siècle, longue et fine, envoie un boulet de fer à grande vitesse : l’ancêtre du canon antichar.',
        en: 'The slender 15th-century culverin threw an iron ball at high velocity: the ancestor of the anti-tank gun.',
      },
    },
    {
      name: { fr: 'Canon antichar 47 mm', en: '47 mm Anti-tank Gun' },
      era: 'modern',
      year: '1937',
      cost: 190,
      range: 4.1 * T,
      cooldown: 2.1,
      damage: 190,
      armorPierce: 0.8,
      attack: 'hitscan',
      description: {
        fr: 'Obus perforant : 80 % de l’armure ignorée.',
        en: 'Armour-piercing shell: ignores 80% of armour.',
      },
      lore: {
        fr: 'Le canon de 47 mm SA 37 français perçait 80 mm de blindage à 1 000 m en 1940, meilleur antichar de son temps.',
        en: 'The French 47 mm SA 37 pierced 80 mm of armour at 1,000 m in 1940, the best anti-tank gun of its day.',
      },
    },
    {
      name: { fr: 'Flak 88', en: 'Flak 88' },
      era: 'modern',
      year: '1936',
      cost: 320,
      range: 4.7 * T,
      cooldown: 1.8,
      damage: 260,
      armorPierce: 0.8,
      attack: 'hitscan',
      bonusVsAir: 2,
      description: {
        fr: 'Dégâts doublés contre les cibles volantes.',
        en: 'Double damage against flying targets.',
      },
      lore: {
        fr: 'Le canon de 8,8 cm FlaK 36 est conçu contre les avions mais devient le plus redouté des antichars de la Seconde Guerre mondiale.',
        en: 'The 8.8 cm FlaK 36 was designed against aircraft but became the most feared anti-tank gun of the Second World War.',
      },
    },
    {
      name: { fr: 'Fusil antimatériel Boys', en: 'Boys Anti-tank Rifle' },
      era: 'modern',
      year: '1937',
      cost: 320,
      range: 5.3 * T,
      cooldown: 2.4,
      damage: 380,
      armorPierce: 1,
      attack: 'hitscan',
      crit: { chance: 0.25, multiplier: 2 },
      description: {
        fr: 'Ignore toute l’armure. Très longue portée, 25 % de critiques.',
        en: 'Ignores all armour. Very long range, 25% critical hits.',
      },
      lore: {
        fr: 'Le fusil Boys de 13,9 mm équipe l’infanterie britannique dès 1937 ; son tireur devait encaisser un recul brutal.',
        en: 'The 13.9 mm Boys rifle armed British infantry from 1937; its gunner endured a brutal recoil.',
      },
    },
  ],
);

// ---------------------------------------------------------------------------
// 3. Cannon — medium splash damage, ground only.
// ---------------------------------------------------------------------------
const cannon = line(
  { attack: 'projectile', damageType: 'explosive', targetsAir: false, targetsGround: true },
  [
    {
      name: { fr: 'Canon de bronze', en: 'Bronze Cannon' },
      era: 'renaissance',
      year: '~1450',
      cost: 125,
      range: 3.0 * T,
      cooldown: 1.8,
      damage: 34,
      splash: 58,
      projectileSpeed: 420,
      description: {
        fr: 'Boulets qui explosent en zone. Ne touche pas les cibles volantes.',
        en: 'Cannonballs that blast an area. Cannot hit flying targets.',
      },
      lore: {
        fr: 'Les bombardes de bronze de Charles VII (1450) mettent fin à la suprématie des châteaux forts.',
        en: 'Charles VII’s bronze guns (1450) ended the supremacy of the stone castle.',
      },
    },
    {
      name: { fr: 'Canon Napoléon', en: 'Napoleon Cannon' },
      era: 'industrial',
      year: '1853',
      cost: 145,
      range: 3.2 * T,
      cooldown: 1.7,
      damage: 60,
      splash: 68,
      projectileSpeed: 480,
      description: {
        fr: 'Pièce de campagne de 12 livres, zone d’effet élargie.',
        en: '12-pounder field gun with a wider blast.',
      },
      lore: {
        fr: 'Le canon-obusier de 12 livres modèle 1853, conçu sous Napoléon III, est la pièce la plus utilisée de la guerre de Sécession.',
        en: 'The 12-pounder Model 1853, designed under Napoleon III, was the most widely used gun of the American Civil War.',
      },
    },
    {
      name: { fr: 'Canon de 75', en: '75 mm Field Gun' },
      era: 'industrial',
      year: '1897',
      cost: 210,
      range: 3.4 * T,
      cooldown: 1.4,
      damage: 100,
      splash: 76,
      projectileSpeed: 620,
      description: {
        fr: 'Tir rapide grâce au frein hydropneumatique.',
        en: 'Rapid fire thanks to its hydro-pneumatic recoil brake.',
      },
      lore: {
        fr: 'Le 75 mm modèle 1897 tire 15 obus par minute sans être repointé : la première pièce d’artillerie moderne.',
        en: 'The 75 mm Model 1897 fired 15 rounds a minute without re-laying: the first modern artillery piece.',
      },
    },
    {
      name: { fr: 'Canon à mitraille', en: 'Canister Gun' },
      era: 'industrial',
      year: '1860',
      cost: 340,
      range: 3.0 * T,
      cooldown: 0.75,
      damage: 62,
      splash: 64,
      projectileSpeed: 620,
      description: {
        fr: 'Cadence élevée, gerbes de mitraille à courte portée.',
        en: 'High rate of fire, canister shot at short range.',
      },
      lore: {
        fr: 'La boîte à mitraille transforme le canon en fusil de chasse géant : dévastatrice contre l’infanterie à Gettysburg (1863).',
        en: 'Canister shot turned a gun into a giant shotgun, devastating infantry at Gettysburg (1863).',
      },
    },
    {
      name: { fr: 'Obusier de 155 GPF', en: '155 mm GPF Howitzer' },
      era: 'modern',
      year: '1917',
      cost: 340,
      range: 4.4 * T,
      cooldown: 2.8,
      damage: 260,
      splash: 120,
      projectileSpeed: 560,
      description: {
        fr: 'Obus lourds, immense zone d’effet, tir lent.',
        en: 'Heavy shells, huge blast radius, slow fire.',
      },
      lore: {
        fr: 'Le canon de 155 mm GPF (1917) porte à 19 km ; l’armée américaine l’utilise encore en 1942.',
        en: 'The 155 mm GPF (1917) reached 19 km; the US Army still used it in 1942.',
      },
    },
  ],
);

// ---------------------------------------------------------------------------
// 4. Siege engines — very long range artillery with a minimum range.
// ---------------------------------------------------------------------------
const siege = line(
  { attack: 'artillery', damageType: 'explosive', targetsAir: false, targetsGround: true },
  [
    {
      name: { fr: 'Mangonneau', en: 'Mangonel' },
      era: 'antiquity',
      year: '~300',
      cost: 150,
      range: 5.0 * T,
      minRange: 1.5 * T,
      cooldown: 3.4,
      damage: 70,
      splash: 88,
      projectileSpeed: 260,
      description: {
        fr: 'Pierres en cloche sur une large zone. Portée minimale.',
        en: 'Lobs stones over a wide area. Has a minimum range.',
      },
      lore: {
        fr: 'Le mangonneau à torsion, hérité de l’onagre romain, lance des pierres de 50 kg par-dessus les murailles.',
        en: 'The torsion mangonel, heir to the Roman onager, threw 50 kg stones over city walls.',
      },
    },
    {
      name: { fr: 'Trébuchet', en: 'Trebuchet' },
      era: 'medieval',
      year: '~1200',
      cost: 170,
      range: 5.6 * T,
      minRange: 1.5 * T,
      cooldown: 3.4,
      damage: 130,
      splash: 100,
      projectileSpeed: 280,
      description: {
        fr: 'Contrepoids massif : plus de portée, plus de dégâts.',
        en: 'A massive counterweight: more range, more damage.',
      },
      lore: {
        fr: 'Le trébuchet à contrepoids apparaît en Méditerranée vers 1200 ; « Warwolf » d’Édouard Ier (1304) était haut de 20 mètres.',
        en: 'The counterweight trebuchet appeared in the Mediterranean around 1200; Edward I’s “Warwolf” (1304) stood 20 metres tall.',
      },
    },
    {
      name: { fr: 'Mortier de 220', en: '220 mm Mortar' },
      era: 'industrial',
      year: '1880',
      cost: 230,
      range: 6.0 * T,
      minRange: 1.5 * T,
      cooldown: 3.0,
      damage: 210,
      splash: 110,
      projectileSpeed: 320,
      description: {
        fr: 'Obus de siège en tir courbe.',
        en: 'Siege shells fired in a high arc.',
      },
      lore: {
        fr: 'Le mortier de 220 mm modèle 1880 de Bange pilonne les fortifications allemandes en 1914 malgré ses 34 ans.',
        en: 'The de Bange 220 mm mortar of 1880 pounded German forts in 1914 despite its 34 years.',
      },
    },
    {
      name: { fr: 'Mortier Stokes', en: 'Stokes Mortar' },
      era: 'modern',
      year: '1915',
      cost: 360,
      range: 5.4 * T,
      minRange: 1.2 * T,
      cooldown: 1.2,
      damage: 120,
      splash: 90,
      projectileSpeed: 420,
      description: {
        fr: 'Mortier léger à tir rapide : 25 coups par minute.',
        en: 'Light rapid-fire mortar: 25 rounds a minute.',
      },
      lore: {
        fr: 'Le mortier de tranchée de Wilfred Stokes (1915) est l’ancêtre de tous les mortiers d’infanterie modernes.',
        en: 'Wilfred Stokes’s trench mortar (1915) is the ancestor of every modern infantry mortar.',
      },
    },
    {
      name: { fr: 'Grosse Bertha', en: 'Big Bertha' },
      era: 'modern',
      year: '1914',
      cost: 360,
      range: 6.8 * T,
      minRange: 2.0 * T,
      cooldown: 5.0,
      damage: 560,
      splash: 170,
      projectileSpeed: 300,
      description: {
        fr: 'Obus de 420 mm : destruction massive, rechargement très lent.',
        en: '420 mm shells: massive destruction, very slow reload.',
      },
      lore: {
        fr: 'Le mortier Krupp de 42 cm « Dicke Bertha » réduit les forts de Liège en août 1914 avec des obus de 800 kg.',
        en: 'Krupp’s 42 cm “Dicke Bertha” mortar shattered the Liège forts in August 1914 with 800 kg shells.',
      },
    },
  ],
);

// ---------------------------------------------------------------------------
// 5. Incendiary — short-range cone, burn damage that ignores armour.
// ---------------------------------------------------------------------------
const fire = line(
  { attack: 'cone', damageType: 'fire', targetsAir: false, targetsGround: true },
  [
    {
      name: { fr: 'Feu grégeois', en: 'Greek Fire' },
      era: 'medieval',
      year: '672',
      cost: 100,
      range: 1.9 * T,
      cooldown: 0.3,
      damage: 5,
      coneAngle: 55,
      status: { burn: { dps: 6, duration: 3 } },
      description: {
        fr: 'Jet de flammes en cône. Le feu ignore l’armure et brûle dans la durée.',
        en: 'A cone of flame. Fire ignores armour and keeps burning.',
      },
      lore: {
        fr: 'Le feu grégeois, projeté par siphons depuis les navires byzantins, sauve Constantinople du siège arabe de 674-678.',
        en: 'Greek fire, sprayed from siphons on Byzantine ships, saved Constantinople from the Arab siege of 674–678.',
      },
    },
    {
      name: { fr: 'Siphon impérial', en: 'Imperial Siphon' },
      era: 'medieval',
      year: '~900',
      cost: 115,
      range: 2.1 * T,
      cooldown: 0.3,
      damage: 8,
      coneAngle: 60,
      status: { burn: { dps: 9, duration: 3.5 } },
      description: {
        fr: 'Siphon pressurisé : plus de portée, brûlure plus forte.',
        en: 'Pressurised siphon: more range, stronger burn.',
      },
      lore: {
        fr: 'Les siphons de bronze décrits par Léon VI (vers 900) projettent le mélange enflammé sous pression.',
        en: 'The bronze siphons described by Leo VI (c. 900) sprayed the burning mixture under pressure.',
      },
    },
    {
      name: { fr: 'Lance-flammes Schilt', en: 'Schilt Flamethrower' },
      era: 'modern',
      year: '1915',
      cost: 170,
      range: 2.3 * T,
      cooldown: 0.25,
      damage: 12,
      coneAngle: 60,
      status: { burn: { dps: 14, duration: 4 } },
      description: {
        fr: 'Lance-flammes de tranchée : dégâts continus élevés.',
        en: 'Trench flamethrower: high sustained damage.',
      },
      lore: {
        fr: 'Le lance-flammes Schilt n°3 (1917), inventé par le capitaine des pompiers de Paris, porte à 30 mètres.',
        en: 'The Schilt No. 3 flamethrower (1917), invented by a Paris fire-brigade captain, reached 30 metres.',
      },
    },
    {
      name: { fr: 'Lance-flammes lourd', en: 'Heavy Flamethrower' },
      era: 'modern',
      year: '1918',
      cost: 300,
      range: 2.5 * T,
      cooldown: 0.2,
      damage: 22,
      coneAngle: 70,
      status: { burn: { dps: 24, duration: 4 } },
      description: {
        fr: 'Cône plus large, brûlure dévastatrice.',
        en: 'Wider cone, devastating burn.',
      },
      lore: {
        fr: 'Les lance-flammes lourds fixes sur affût, alimentés par réservoirs de 200 litres, défendaient les points fortifiés en 1918.',
        en: 'Fixed heavy flamethrowers fed by 200-litre tanks defended strongpoints in 1918.',
      },
    },
    {
      name: { fr: 'Projecteur Livens', en: 'Livens Projector' },
      era: 'modern',
      year: '1916',
      cost: 300,
      range: 4.2 * T,
      minRange: 1.0 * T,
      cooldown: 2.6,
      damage: 90,
      splash: 95,
      attack: 'artillery',
      projectileSpeed: 340,
      status: { burn: { dps: 20, duration: 5 } },
      description: {
        fr: 'Bidons incendiaires lancés à longue portée, zone enflammée.',
        en: 'Incendiary drums lobbed at long range, sets an area ablaze.',
      },
      lore: {
        fr: 'Le projecteur Livens (1916) est un tube enterré qui lance des bidons de 14 kg d’huile enflammée à 1 500 mètres.',
        en: 'The Livens projector (1916) was a buried tube that hurled 14 kg drums of burning oil 1,500 metres.',
      },
    },
  ],
);

// ---------------------------------------------------------------------------
// 6. Sappers — slowing aura with light damage.
// ---------------------------------------------------------------------------
const sappers = line(
  { attack: 'aura', damageType: 'true', targetsAir: false, targetsGround: true },
  [
    {
      name: { fr: 'Chausse-trappes', en: 'Caltrops' },
      era: 'antiquity',
      year: '331 av. J.-C.',
      cost: 90,
      range: 2.0 * T,
      cooldown: 0,
      damage: 3,
      status: { slow: { factor: 0.7, duration: 0.3 } },
      description: {
        fr: 'Ralentit de 30 % tous les ennemis au sol dans la zone.',
        en: 'Slows every ground enemy in the area by 30%.',
      },
      lore: {
        fr: 'Les chausse-trappes de fer à quatre pointes, semées à Gaugamèles (331 av. J.-C.), brisent les charges de chars et de cavalerie.',
        en: 'Four-spiked iron caltrops, scattered at Gaugamela (331 BC), broke chariot and cavalry charges.',
      },
    },
    {
      name: { fr: 'Barbelés', en: 'Barbed Wire' },
      era: 'industrial',
      year: '1874',
      cost: 105,
      range: 2.2 * T,
      cooldown: 0,
      damage: 5,
      status: { slow: { factor: 0.6, duration: 0.3 } },
      description: {
        fr: 'Ralentissement de 40 %, dégâts continus.',
        en: '40% slow, continuous damage.',
      },
      lore: {
        fr: 'Breveté en 1874 pour clôturer les prairies américaines, le fil barbelé devient l’obstacle roi des tranchées de 1914.',
        en: 'Patented in 1874 to fence the American prairie, barbed wire became the king of trench obstacles in 1914.',
      },
    },
    {
      name: { fr: 'Fossé antichar', en: 'Anti-tank Ditch' },
      era: 'modern',
      year: '1939',
      cost: 160,
      range: 2.5 * T,
      cooldown: 0,
      damage: 8,
      status: { slow: { factor: 0.5, duration: 0.3 }, shred: { amount: 0.1, duration: 0.5 } },
      description: {
        fr: 'Ralentit de 50 % et réduit l’armure de 10 %.',
        en: '50% slow and strips 10% armour.',
      },
      lore: {
        fr: 'Les fossés antichars de la ligne Maginot, larges de 6 mètres, s’appuient sur des rails plantés : les « asperges de Rommel » à l’envers.',
        en: 'The Maginot Line’s six-metre anti-tank ditches were backed by planted rails, the reverse of “Rommel’s asparagus”.',
      },
    },
    {
      name: { fr: 'Canon à eau', en: 'Water Cannon' },
      era: 'modern',
      year: '1930',
      cost: 260,
      range: 2.9 * T,
      cooldown: 0,
      damage: 6,
      targetsAir: true,
      status: { slow: { factor: 0.35, duration: 0.3 } },
      description: {
        fr: 'Ralentissement massif de 65 %, atteint aussi les cibles volantes.',
        en: 'Massive 65% slow, also reaches flying targets.',
      },
      lore: {
        fr: 'Les premiers canons à eau montés sur camion servent à la police allemande dès 1930.',
        en: 'The first truck-mounted water cannons served the German police from 1930.',
      },
    },
    {
      name: { fr: 'Champ de boue', en: 'Mud Field' },
      era: 'medieval',
      year: '1415',
      cost: 260,
      range: 3.5 * T,
      cooldown: 0,
      damage: 10,
      status: { slow: { factor: 0.55, duration: 0.3 }, shred: { amount: 0.25, duration: 0.5 } },
      description: {
        fr: 'Immense zone : ralentit de 45 % et retire 25 % d’armure.',
        en: 'Huge area: 45% slow and strips 25% armour.',
      },
      lore: {
        fr: 'À Azincourt (1415), la boue du champ fraîchement labouré immobilise les chevaliers français sous les flèches anglaises.',
        en: 'At Agincourt (1415), the mud of a freshly ploughed field pinned the French knights under English arrows.',
      },
    },
  ],
);

// ---------------------------------------------------------------------------
// 7. Rocket launchers — salvo hitting several distinct targets.
// ---------------------------------------------------------------------------
const rockets = line(
  { attack: 'salvo', damageType: 'explosive', targetsAir: true, targetsGround: true },
  [
    {
      name: { fr: 'Hwacha', en: 'Hwacha' },
      era: 'renaissance',
      year: '1451',
      cost: 160,
      range: 3.6 * T,
      cooldown: 2.6,
      damage: 15,
      splash: 30,
      salvo: 6,
      projectileSpeed: 380,
      description: {
        fr: 'Salve de 6 fusées sur 6 cibles différentes.',
        en: 'A salvo of 6 rockets at 6 different targets.',
      },
      lore: {
        fr: 'Le hwacha coréen (1451) lance jusqu’à 100 flèches-fusées d’un coup ; il décime la cavalerie japonaise à Haengju en 1593.',
        en: 'The Korean hwacha (1451) fired up to 100 rocket arrows at once; it decimated Japanese cavalry at Haengju in 1593.',
      },
    },
    {
      name: { fr: 'Fusées Congreve', en: 'Congreve Rockets' },
      era: 'industrial',
      year: '1804',
      cost: 175,
      range: 3.9 * T,
      cooldown: 2.6,
      damage: 24,
      splash: 36,
      salvo: 8,
      projectileSpeed: 420,
      description: {
        fr: '8 fusées par salve, explosion plus large.',
        en: '8 rockets a salvo, wider blast.',
      },
      lore: {
        fr: 'Les fusées de William Congreve incendient Copenhague en 1807 ; leur « lueur rouge » figure dans l’hymne américain.',
        en: 'William Congreve’s rockets burned Copenhagen in 1807; their “red glare” is in the American anthem.',
      },
    },
    {
      name: { fr: 'Katioucha BM-13', en: 'Katyusha BM-13' },
      era: 'modern',
      year: '1941',
      cost: 250,
      range: 4.2 * T,
      cooldown: 2.7,
      damage: 36,
      splash: 42,
      salvo: 12,
      projectileSpeed: 500,
      description: {
        fr: '12 roquettes par salve. Les « orgues de Staline ».',
        en: '12 rockets a salvo. “Stalin’s organ”.',
      },
      lore: {
        fr: 'Le BM-13 Katioucha tire seize roquettes de 132 mm en dix secondes ; utilisé pour la première fois à Orcha en juillet 1941.',
        en: 'The BM-13 Katyusha fired sixteen 132 mm rockets in ten seconds; first used at Orsha in July 1941.',
      },
    },
    {
      name: { fr: 'Nebelwerfer 41', en: 'Nebelwerfer 41' },
      era: 'modern',
      year: '1940',
      cost: 380,
      range: 4.4 * T,
      cooldown: 3.2,
      damage: 120,
      splash: 76,
      salvo: 6,
      projectileSpeed: 480,
      description: {
        fr: '6 roquettes lourdes à grande zone d’effet.',
        en: '6 heavy rockets with a large blast.',
      },
      lore: {
        fr: 'Le Nebelwerfer 41 à six tubes de 150 mm, surnommé « Moaning Minnie » par les Alliés pour son hurlement.',
        en: 'The six-barrelled 150 mm Nebelwerfer 41, nicknamed “Moaning Minnie” by the Allies for its howl.',
      },
    },
    {
      name: { fr: 'BM-21 Grad', en: 'BM-21 Grad' },
      era: 'modern',
      year: '1963',
      cost: 380,
      range: 4.6 * T,
      cooldown: 3.0,
      damage: 32,
      splash: 44,
      salvo: 24,
      projectileSpeed: 560,
      description: {
        fr: '24 roquettes par salve : un déluge sur les essaims.',
        en: '24 rockets a salvo: a downpour on swarms.',
      },
      lore: {
        fr: 'Le BM-21 Grad (1963) vide ses 40 tubes de 122 mm en vingt secondes ; toujours en service dans 50 pays.',
        en: 'The BM-21 Grad (1963) empties its forty 122 mm tubes in twenty seconds; still in service in 50 countries.',
      },
    },
  ],
);

// ---------------------------------------------------------------------------
// 8. Traps — periodically lays traps on nearby path tiles.
// ---------------------------------------------------------------------------
const traps = line(
  { attack: 'trap', damageType: 'explosive', targetsAir: false, targetsGround: true },
  [
    {
      name: { fr: 'Pièges à loups', en: 'Wolf Traps' },
      era: 'medieval',
      year: '~1100',
      cost: 80,
      range: 2.4 * T,
      cooldown: 0,
      damage: 45,
      damageType: 'pierce',
      armorPierce: 0.5,
      trap: { maxActive: 3, triggerRadius: 18, placeInterval: 4 },
      status: { stun: { duration: 0.8 } },
      description: {
        fr: 'Pose des pièges sur le chemin : dégâts et immobilisation brève.',
        en: 'Sets traps on the path: damage and a brief stun.',
      },
      lore: {
        fr: 'Trous camouflés hérissés de pieux, les « trous de loup » protègent les camps romains puis les châteaux médiévaux.',
        en: 'Camouflaged pits bristling with stakes, “wolf holes” guarded Roman camps and later medieval castles.',
      },
    },
    {
      name: { fr: 'Fougasses', en: 'Fougasses' },
      era: 'renaissance',
      year: '~1580',
      cost: 105,
      range: 2.6 * T,
      cooldown: 0,
      damage: 95,
      splash: 52,
      trap: { maxActive: 4, placeInterval: 3.5, triggerRadius: 18 },
      description: {
        fr: 'Charges enterrées qui explosent au passage.',
        en: 'Buried charges that explode when stepped on.',
      },
      lore: {
        fr: 'La fougasse, poudre enterrée sous un tas de pierres, est décrite par Vauban ; elle devient une arme des sièges du XVIIe siècle.',
        en: 'The fougasse, powder buried under a pile of stones, was described by Vauban and became a 17th-century siege weapon.',
      },
    },
    {
      name: { fr: 'Mines antipersonnel', en: 'Anti-personnel Mines' },
      era: 'modern',
      year: '1916',
      cost: 160,
      range: 2.8 * T,
      cooldown: 0,
      damage: 170,
      splash: 62,
      trap: { maxActive: 5, placeInterval: 3, triggerRadius: 18 },
      description: {
        fr: 'Champ de mines plus dense et plus meurtrier.',
        en: 'A denser, deadlier minefield.',
      },
      lore: {
        fr: 'Les premières mines antipersonnel de série apparaissent sur le front occidental en 1916.',
        en: 'The first mass-produced anti-personnel mines appeared on the Western Front in 1916.',
      },
    },
    {
      name: { fr: 'Mines antichar Tellermine', en: 'Tellermine Anti-tank Mines' },
      era: 'modern',
      year: '1929',
      cost: 300,
      range: 2.8 * T,
      cooldown: 0,
      damage: 520,
      armorPierce: 1,
      splash: 40,
      trap: { maxActive: 4, placeInterval: 3.5, triggerRadius: 18 },
      description: {
        fr: 'Charges énormes qui ignorent l’armure : brise les blindés.',
        en: 'Huge charges that ignore armour: breaks the heavies.',
      },
      lore: {
        fr: 'La Tellermine 29 (1929), plate comme une assiette, contient 5 kg de TNT et ne se déclenche que sous 90 kg.',
        en: 'The plate-shaped Tellermine 29 (1929) held 5 kg of TNT and only triggered under 90 kg.',
      },
    },
    {
      name: { fr: 'Mines bondissantes S-Mine', en: 'S-Mine Bounding Mines' },
      era: 'modern',
      year: '1935',
      cost: 300,
      range: 3.2 * T,
      cooldown: 0,
      damage: 150,
      splash: 115,
      trap: { maxActive: 6, placeInterval: 2.5, triggerRadius: 18 },
      description: {
        fr: 'Bondit à hauteur d’homme : explosion à très large rayon.',
        en: 'Springs to waist height: very wide blast.',
      },
      lore: {
        fr: 'La S-Mine allemande (1935), la « Bouncing Betty », saute à un mètre avant de projeter 360 billes d’acier.',
        en: 'The German S-Mine (1935), the “Bouncing Betty”, leapt a metre high before scattering 360 steel balls.',
      },
    },
  ],
);

// ---------------------------------------------------------------------------
// 9. Command — buffs neighbouring towers.
// ---------------------------------------------------------------------------
const command = line(
  { attack: 'support', damageType: 'true', targetsAir: false, targetsGround: false },
  [
    {
      name: { fr: 'Étendard', en: 'Standard' },
      era: 'antiquity',
      year: '~100 av. J.-C.',
      cost: 120,
      range: 2.4 * T,
      cooldown: 0,
      damage: 0,
      aura: { damage: 0.15 },
      description: {
        fr: '+15 % de dégâts pour les tours à portée. Ne se cumule pas.',
        en: '+15% damage for towers in range. Does not stack.',
      },
      lore: {
        fr: 'L’aigle de la légion romaine, instaurée par Marius vers 104 av. J.-C., ralliait les cohortes ; la perdre était un déshonneur.',
        en: 'The Roman legion’s eagle, instituted by Marius around 104 BC, rallied the cohorts; losing it was a disgrace.',
      },
    },
    {
      name: { fr: 'Tambours', en: 'Drums' },
      era: 'renaissance',
      year: '~1500',
      cost: 140,
      range: 2.6 * T,
      cooldown: 0,
      damage: 0,
      aura: { damage: 0.25, rate: 0.1 },
      description: {
        fr: '+25 % de dégâts et +10 % de cadence.',
        en: '+25% damage and +10% attack rate.',
      },
      lore: {
        fr: 'Les tambours des lansquenets suisses (vers 1500) rythment la marche et transmettent les ordres dans le fracas de la bataille.',
        en: 'The Swiss landsknecht drums (c. 1500) set the marching pace and carried orders through the din of battle.',
      },
    },
    {
      name: { fr: 'Poste radar', en: 'Radar Post' },
      era: 'modern',
      year: '1935',
      cost: 210,
      range: 2.9 * T,
      cooldown: 0,
      damage: 0,
      aura: { damage: 0.3, rate: 0.15, range: 0.15, reveal: true },
      description: {
        fr: '+30 % dégâts, +15 % cadence et portée. Révèle les ennemis camouflés.',
        en: '+30% damage, +15% rate and range. Reveals hidden enemies.',
      },
      lore: {
        fr: 'Les stations Chain Home (1935-1940), premier réseau radar au monde, guident la RAF pendant la bataille d’Angleterre.',
        en: 'The Chain Home stations (1935–1940), the world’s first radar network, guided the RAF through the Battle of Britain.',
      },
    },
    {
      name: { fr: 'État-major', en: 'General Staff' },
      era: 'industrial',
      year: '1806',
      cost: 340,
      range: 3.2 * T,
      cooldown: 0,
      damage: 0,
      aura: { damage: 0.5, rate: 0.25, range: 0.15, reveal: true },
      description: {
        fr: '+50 % dégâts, +25 % cadence, +15 % portée.',
        en: '+50% damage, +25% rate, +15% range.',
      },
      lore: {
        fr: 'L’état-major général prussien, créé après Iéna (1806), professionnalise la planification militaire.',
        en: 'The Prussian General Staff, created after Jena (1806), professionalised military planning.',
      },
    },
    {
      name: { fr: 'Intendance', en: 'Quartermaster' },
      era: 'industrial',
      year: '1817',
      cost: 340,
      range: 3.2 * T,
      cooldown: 0,
      damage: 0,
      aura: { damage: 0.25, rate: 0.1, gold: 0.3, reveal: true },
      description: {
        fr: '+30 % d’or sur les éliminations des tours à portée.',
        en: '+30% gold on kills by towers in range.',
      },
      lore: {
        fr: 'L’Intendance militaire française (1817) gère solde, vivres et approvisionnement des armées.',
        en: 'The French military Intendance (1817) managed pay, rations and supply for the armies.',
      },
    },
  ],
);

function def(id: string, hotkey: string, role: TowerDef['role'], levels: TowerLevelDef[]): TowerDef {
  if (levels.length !== 5) throw new Error(`Tower ${id} must have 5 level definitions`);
  return {
    id,
    hotkey,
    role,
    levels: [levels[0] as TowerLevelDef, levels[1] as TowerLevelDef, levels[2] as TowerLevelDef],
    branches: [levels[3] as TowerLevelDef, levels[4] as TowerLevelDef],
  };
}

export const TOWERS: TowerDef[] = [
  def('archers', '1', { fr: 'Tir rapide', en: 'Rapid fire' }, archers),
  def('ballista', '2', { fr: 'Perce-armure', en: 'Armour piercing' }, ballista),
  def('cannon', '3', { fr: 'Zone', en: 'Splash' }, cannon),
  def('siege', '4', { fr: 'Artillerie', en: 'Artillery' }, siege),
  def('fire', '5', { fr: 'Incendiaire', en: 'Incendiary' }, fire),
  def('sappers', '6', { fr: 'Ralentissement', en: 'Slow' }, sappers),
  def('rockets', '7', { fr: 'Salve', en: 'Salvo' }, rockets),
  def('traps', '8', { fr: 'Pièges', en: 'Traps' }, traps),
  def('command', '9', { fr: 'Soutien', en: 'Support' }, command),
];

export const TOWER_BY_ID: Record<string, TowerDef> = Object.fromEntries(TOWERS.map((t) => [t.id, t]));

/** Returns the level definition currently active for a tower. */
export function towerLevelDef(defId: string, level: number, branch: number): TowerLevelDef {
  const def = TOWER_BY_ID[defId];
  if (!def) throw new Error(`Unknown tower ${defId}`);
  if (level >= 4) return def.branches[branch === 1 ? 1 : 0];
  return def.levels[Math.max(0, Math.min(2, level - 1))] as TowerLevelDef;
}

export const SELL_RATIO = 0.7;
