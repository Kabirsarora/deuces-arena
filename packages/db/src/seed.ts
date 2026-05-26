import { prisma } from "./index.js";

const starterCosmetics = [
  {
    slug: "classic-red-card-back",
    kind: "CARD_BACK" as const,
    name: "Classic Red",
    description: "A clean starter card back for every table.",
    rarity: "common",
    isSupporter: false
  },
  {
    slug: "midnight-felt-table",
    kind: "TABLE_THEME" as const,
    name: "Midnight Felt",
    description: "The default dark table theme.",
    rarity: "common",
    isSupporter: false
  },
  {
    slug: "founder-gold-border",
    kind: "PROFILE_BORDER" as const,
    name: "Founder Gold",
    description: "A future supporter profile border with no gameplay advantage.",
    rarity: "supporter",
    isSupporter: true
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
