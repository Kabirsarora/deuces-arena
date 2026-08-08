import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ["@deuces-arena/game-engine"]
};

export default nextConfig;
