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
