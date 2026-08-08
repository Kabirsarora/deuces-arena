import "dotenv/config";

import { prisma } from "./index.js";

const starterCosmetics = [
  {
    slug: "classic-red-card-back",
    kind: "CARD_BACK" as const,
    name: "Classic Red",
    description: "A clean starter card back for every table.",
    rarity: "common",
    isSupporter: false,
    coinPrice: 0
  },
  {
    slug: "midnight-felt-table",
    kind: "TABLE_THEME" as const,
    name: "Midnight Felt",
    description: "The default dark table theme.",
    rarity: "common",
    isSupporter: false,
    coinPrice: 500
  },
  {
    slug: "lagoon-table",
    kind: "TABLE_THEME" as const,
    name: "Lagoon Table",
    description: "A bright teal table theme with a softer casino glow.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 1000
  },
  {
    slug: "obsidian-table",
    kind: "TABLE_THEME" as const,
    name: "Obsidian Table",
    description: "A low-light table theme with gold edge lighting.",
    rarity: "legendary",
    isSupporter: false,
    coinPrice: 4000
  },
  {
    slug: "neon-grid-card-back",
    kind: "CARD_BACK" as const,
    name: "Neon Grid",
    description: "A blue circuit-style card back for sharper tables.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 900
  },
  {
    slug: "ember-court-card-back",
    kind: "CARD_BACK" as const,
    name: "Ember Court",
    description: "A warm red-gold card back for endgame drama.",
    rarity: "epic",
    isSupporter: false,
    coinPrice: 2500
  },
  {
    slug: "arena-six-crest-card-back",
    kind: "CARD_BACK" as const,
    name: "Sixfold Crest",
    description: "Original engraved card art made for the six-suit Arena 6 deck.",
    rarity: "legendary",
    isSupporter: false,
    coinPrice: 6000,
    previewUrl: "/art/arena-six-card-back.jpg"
  },
  {
    slug: "aqua-pulse-avatar",
    kind: "AVATAR" as const,
    name: "Aqua Pulse",
    description: "A clean glowing avatar mark for table seats.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 750
  },
  {
    slug: "crown-chip-avatar",
    kind: "AVATAR" as const,
    name: "Crown Chip",
    description: "A gold chip avatar mark for players who like a little pressure.",
    rarity: "epic",
    isSupporter: false,
    coinPrice: 2200
  },
  {
    slug: "aqua-profile-border",
    kind: "PROFILE_BORDER" as const,
    name: "Aqua Rail",
    description: "A cool cyan seat border for online tables.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 1400
  },
  {
    slug: "gold-division-border",
    kind: "PROFILE_BORDER" as const,
    name: "Gold Division",
    description: "Earned by reaching 1100 rating in ranked play.",
    rarity: "ranked-gold",
    isSupporter: false,
    coinPrice: null
  },
  {
    slug: "platinum-division-border",
    kind: "PROFILE_BORDER" as const,
    name: "Platinum Division",
    description: "Earned by reaching 1300 rating in ranked play.",
    rarity: "ranked-platinum",
    isSupporter: false,
    coinPrice: null
  },
  {
    slug: "diamond-division-border",
    kind: "PROFILE_BORDER" as const,
    name: "Diamond Division",
    description: "Earned by reaching 1500 rating in ranked play.",
    rarity: "ranked-diamond",
    isSupporter: false,
    coinPrice: null
  },
  {
    slug: "arena-master-border",
    kind: "PROFILE_BORDER" as const,
    name: "Arena Master",
    description: "Earned by reaching 1800 rating in ranked play.",
    rarity: "ranked-master",
    isSupporter: false,
    coinPrice: null
  },
  {
    slug: "tournament-champion-border",
    kind: "PROFILE_BORDER" as const,
    name: "Bracket Champion",
    description: "Awarded for winning an eight-player Deuces Arena tournament.",
    rarity: "tournament",
    isSupporter: false,
    coinPrice: null
  },
  {
    slug: "founder-gold-border",
    kind: "PROFILE_BORDER" as const,
    name: "Founder Gold",
    description: "A future supporter profile border with no gameplay advantage.",
    rarity: "supporter",
    isSupporter: true,
    coinPrice: null
  }
];

async function seed() {
  for (const cosmetic of starterCosmetics) {
    await prisma.cosmetic.upsert({
      where: {
        slug: cosmetic.slug
      },
      create: cosmetic,
      update: cosmetic
    });
  }
}

seed()
  .then(() => {
    console.log(`Seeded ${starterCosmetics.length} starter cosmetics.`);
  })
  .catch((error: unknown) => {
    console.error("Unable to seed database.", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
