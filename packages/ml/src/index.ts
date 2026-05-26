export const mlPackageName = "@deuces-arena/ml";

export { exportCoachEvaluationsToJsonl } from "./export-coach-evaluations.js";
export { generateRandomSelfPlaySamples } from "./self-play.js";

export type {
  CoachEvaluationExportInput,
  CoachEvaluationExportResult,
  CoachEvaluationTrainingRow
} from "./export-coach-evaluations.js";
export type { SelfPlayGameSample, SelfPlayGenerationInput } from "./self-play.js";
