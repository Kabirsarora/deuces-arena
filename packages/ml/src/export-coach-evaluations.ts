import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { prisma } from "@deuces-arena/db";

export type CoachEvaluationExportInput = {
  readonly outputPath: string;
  readonly limit?: number;
};

export type CoachEvaluationExportResult = {
  readonly outputPath: string;
  readonly rowsWritten: number;
};

export type CoachEvaluationTrainingRow = {
  readonly id: string;
  readonly matchId: string;
  readonly matchPlayerId: string;
  readonly roomCode: string | null;
  readonly playerId: string;
  readonly playerLabel: string;
  readonly turnNumber: number;
  readonly handBefore: unknown;
  readonly currentTrickBefore: unknown;
  readonly evaluations: unknown;
  readonly rolloutsPerMove: number;
  readonly evaluatedMoveCount: number;
  readonly createdAt: string;
};

export async function exportCoachEvaluationsToJsonl(
  input: CoachEvaluationExportInput
): Promise<CoachEvaluationExportResult> {
  const rows = await prisma.coachEvaluation.findMany({
    orderBy: [
      {
        createdAt: "asc"
      },
      {
        turnNumber: "asc"
      }
    ],
    ...(input.limit === undefined
      ? {}
      : {
          take: input.limit
        })
  });

  const trainingRows: CoachEvaluationTrainingRow[] = rows.map((row) => ({
    id: row.id,
    matchId: row.matchId,
    matchPlayerId: row.matchPlayerId,
    roomCode: row.roomCode,
    playerId: row.playerId,
    playerLabel: row.playerLabel,
    turnNumber: row.turnNumber,
    handBefore: row.handBefore,
    currentTrickBefore: row.currentTrickBefore,
    evaluations: row.evaluations,
    rolloutsPerMove: row.rolloutsPerMove,
    evaluatedMoveCount: row.evaluatedMoveCount,
    createdAt: row.createdAt.toISOString()
  }));

  await mkdir(dirname(input.outputPath), { recursive: true });
  await writeFile(
    input.outputPath,
    trainingRows.map((row) => JSON.stringify(row)).join("\n"),
    "utf8"
  );

  return {
    outputPath: input.outputPath,
    rowsWritten: trainingRows.length
  };
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("COACH_EVALUATION_EXPORT_LIMIT must be a positive integer.");
  }

  return parsed;
}

function isMainModule(): boolean {
  const scriptPath = process.argv[1];

  if (scriptPath === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(scriptPath).href;
}

if (isMainModule()) {
  const outputPath =
    process.env.COACH_EVALUATION_EXPORT_PATH ?? "artifacts/coach-evaluations.jsonl";
  const limit = parseLimit(process.env.COACH_EVALUATION_EXPORT_LIMIT);

  exportCoachEvaluationsToJsonl({
    outputPath,
    ...(limit === undefined ? {} : { limit })
  })
    .then((result) => {
      console.log(`Exported ${result.rowsWritten} coach evaluation rows to ${result.outputPath}.`);
    })
    .catch((error: unknown) => {
      console.error("Unable to export coach evaluations.", error);
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
