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
    coinPrice: 450
  },
  {
    slug: "obsidian-table",
    kind: "TABLE_THEME" as const,
    name: "Obsidian Table",
    description: "A low-light table theme with gold edge lighting.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 800
  },
  {
    slug: "neon-grid-card-back",
    kind: "CARD_BACK" as const,
    name: "Neon Grid",
    description: "A blue circuit-style card back for sharper tables.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 350
  },
  {
    slug: "ember-court-card-back",
    kind: "CARD_BACK" as const,
    name: "Ember Court",
    description: "A warm red-gold card back for endgame drama.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 650
  },
  {
    slug: "aqua-pulse-avatar",
    kind: "AVATAR" as const,
    name: "Aqua Pulse",
    description: "A clean glowing avatar mark for table seats.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 300
  },
  {
    slug: "crown-chip-avatar",
    kind: "AVATAR" as const,
    name: "Crown Chip",
    description: "A gold chip avatar mark for players who like a little pressure.",
    rarity: "epic",
    isSupporter: false,
    coinPrice: 700
  },
  {
    slug: "aqua-profile-border",
    kind: "PROFILE_BORDER" as const,
    name: "Aqua Rail",
    description: "A cool cyan seat border for online tables.",
    rarity: "rare",
    isSupporter: false,
    coinPrice: 550
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
