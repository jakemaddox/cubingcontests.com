import "server-only";
import { and, eq, gt, lte, ne, sql } from "drizzle-orm";
import { camelCase } from "lodash";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Continents } from "~/helpers/Countries.ts";
import { C } from "~/helpers/constants.ts";
import type { Ranking } from "~/helpers/types/Rankings.ts";
import { type RecordCategory, type RecordType, RecordTypeValues } from "~/helpers/types.ts";
import { getIsAdmin } from "~/helpers/utilityFunctions.ts";
import { type DbTransactionType, db } from "~/server/db/provider.ts";
import { type ContestResponse, contestsTable } from "~/server/db/schema/contests.ts";
import { type EventResponse, eventsPublicCols, eventsTable, type SelectEvent } from "~/server/db/schema/events.ts";
import { personsTable, type SelectPerson } from "~/server/db/schema/persons.ts";
import { recordConfigsPublicCols, recordConfigsTable } from "~/server/db/schema/record-configs.ts";
import { resultsTable, type SelectResult } from "~/server/db/schema/results.ts";
import { type LogCode, logger } from "~/server/logger.ts";
import { CcActionError } from "~/server/safeAction.ts";
import { getDateOnly, getDefaultAverageAttempts, getNameAndLocalizedName } from "../helpers/sharedFunctions.ts";
import { auth } from "./auth.ts";
import type { CcPermissions } from "./permissions.ts";

export function logMessage(code: LogCode, message: string, { metadata }: { metadata?: object } = {}) {
  const messageWithCode = `[${code}] ${message}`;

  // Log to terminal/Docker container
  console.log(messageWithCode);

  if (!process.env.VITEST) {
    try {
      // The metadata is then handled in loggerUtils.js
      const childObject: any = { ccCode: code };
      if (metadata) childObject.ccMetadata = metadata;

      logger.child(childObject).info(messageWithCode);
    } catch (err) {
      console.error("Error while sending log to Supabase Analytics:", err);
    }
  }
}

export async function checkUserPermissions(userId: string, permissions: CcPermissions): Promise<boolean> {
  const { success } = await auth.api.userHasPermission({ body: { userId, permissions } });
  return success;
}

export async function authorizeUser({
  permissions,
}: {
  permissions?: CcPermissions;
} = {}): Promise<typeof auth.$Infer.Session> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect("/login");

  if (permissions) {
    const isAuthorized = await checkUserPermissions(session.user.id, permissions);
    if (!isAuthorized) redirect("/login");

    // The user must have an assigned person to be able to do any operation except creating video-based results
    if (
      !session.user.personId &&
      (Object.keys(permissions).some((key) => key !== ("videoBasedResults" satisfies keyof typeof permissions)) ||
        permissions.videoBasedResults?.some((perm) => perm !== "create"))
    )
      redirect("/login");
  }

  return session;
}

export function getUserHasAccessToContest(
  user: typeof auth.$Infer.Session.user,
  contest: Pick<ContestResponse, "state" | "organizerIds">,
) {
  if (!user.personId) return false;
  if (contest.state === "removed") return false;
  if (getIsAdmin(user.role)) return true;

  const modHasAccess =
    ["created", "approved", "ongoing"].includes(contest.state) && contest.organizerIds.includes(user.personId);
  return modHasAccess;
}

export async function getContestParticipantIds(tx: DbTransactionType, competitionId: string): Promise<number[]> {
  const results = await tx.query.results.findMany({ columns: { personIds: true }, where: { competitionId } });

  const participantIds = new Set<number>();
  for (const result of results) {
    for (const personId of result.personIds) {
      participantIds.add(personId);
    }
  }

  return Array.from(participantIds);
}

export async function getRecordConfigs(recordFor: RecordCategory) {
  const recordConfigs = await db
    .select(recordConfigsPublicCols)
    .from(recordConfigsTable)
    .where(eq(recordConfigsTable.category, recordFor));

  if (recordConfigs.length !== RecordTypeValues.length) {
    throw new Error(
      `The records are configured incorrectly. Expected ${RecordTypeValues.length} record configs for the category, but found ${recordConfigs.length}.`,
    );
  }

  return recordConfigs;
}

export async function getVideoBasedEvents() {
  const events = await db
    .select(eventsPublicCols)
    .from(eventsTable)
    .where(eq(eventsTable.submissionsAllowed, true))
    .orderBy(eventsTable.rank);

  return events;
}

export async function getRecordResult(
  event: Pick<SelectEvent, "eventId" | "defaultRoundFormat">,
  bestOrAverage: "best" | "average",
  recordType: RecordType,
  recordCategory: RecordCategory,
  {
    tx,
    recordsUpTo = getDateOnly(new Date())!,
    excludeResultId,
    regionCode,
  }: {
    tx?: DbTransactionType; // this can optionally be run inside of a transaction
    recordsUpTo?: Date;
    excludeResultId?: number;
    regionCode?: string;
  } = {
    recordsUpTo: getDateOnly(new Date())!,
  },
): Promise<SelectResult | undefined> {
  const superRegion = Continents.find((c) => c.recordTypeId === recordType);

  const [recordResult] = await (tx ?? db)
    .select()
    .from(resultsTable)
    .where(
      and(
        eq(resultsTable.eventId, event.eventId),
        excludeResultId ? ne(resultsTable.id, excludeResultId) : undefined,
        lte(resultsTable.date, recordsUpTo),
        eq(resultsTable.recordCategory, recordCategory),
        gt(resultsTable[bestOrAverage], 0),
        bestOrAverage === "average"
          ? sql`CARDINALITY(${resultsTable.attempts}) = ${getDefaultAverageAttempts(event.defaultRoundFormat)}`
          : undefined,
        superRegion ? eq(resultsTable.superRegionCode, superRegion.code) : undefined,
        regionCode ? eq(resultsTable.regionCode, regionCode) : undefined,
      ),
    )
    .orderBy(resultsTable[bestOrAverage])
    .limit(1);
  return recordResult;
}

export async function getRankings(
  event: EventResponse,
  bestOrAverage: "best" | "average",
  recordCategory: RecordCategory | "all",
  {
    show = "persons",
    region,
    topN = 100,
  }: {
    show?: "persons" | "results";
    region?: string;
    topN?: number;
  },
): Promise<Ranking[]> {
  topN = Math.min(topN, 25000);

  const defaultNumberOfAttempts = getDefaultAverageAttempts(event.defaultRoundFormat);
  const regionCondition = region
    ? Continents.some((c) => c.code === region)
      ? `AND super_region_code = '${region}'`
      : `AND region_code = '${region}'`
    : "";
  let rankings: Ranking[];

  // Top persons
  if (show === "persons") {
    rankings = await db
      .execute(sql`
        WITH personal_records AS (
          SELECT DISTINCT ON (person_id)
            CONCAT(${resultsTable.id}, '_', person_id) AS ranking_id,
            ${resultsTable.date},
            person_id,
            ${resultsTable.personIds} AS persons,
            CAST(${resultsTable[bestOrAverage]} AS INTEGER) AS result,
            ${sql.raw(bestOrAverage === "best" ? "" : `attempts,`)}
            CASE WHEN ${resultsTable.competitionId} IS NOT NULL THEN
              JSON_BUILD_OBJECT(
                'competitionId', ${contestsTable.competitionId},
                'shortName', ${contestsTable.shortName},
                'type', ${contestsTable.type},
                'regionCode', ${contestsTable.regionCode}
              )
            ELSE NULL END AS contest,
            ${resultsTable.videoLink},
            ${resultsTable.discussionLink}
          FROM ${resultsTable}
            LEFT JOIN ${contestsTable}
              ON ${resultsTable.competitionId} = ${contestsTable.competitionId},
            UNNEST(${resultsTable.personIds}) AS person_id
          WHERE ${resultsTable.approved} IS TRUE
            AND ${resultsTable.eventId} = ${event.eventId}
            ${sql.raw(recordCategory === "all" ? "" : `AND record_category = '${recordCategory}'`)}
            AND ${resultsTable[bestOrAverage]} > 0
            ${sql.raw(bestOrAverage === "best" ? "" : `AND CARDINALITY(attempts) = ${defaultNumberOfAttempts}`)}
            ${sql.raw(regionCondition)}
          ORDER BY person_id, ${resultsTable[bestOrAverage]}, ${resultsTable.date}
        ), rankings AS (
          SELECT personal_records.*,
            CAST(
              RANK() OVER (ORDER BY personal_records.result ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            AS INTEGER) AS ranking,
            (
              SELECT
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', ${personsTable.id},
                    'name', ${personsTable.name},
                    'localizedName', ${personsTable.localizedName},
                    'regionCode', ${personsTable.regionCode},
                    'wcaId', ${personsTable.wcaId}
                  )
                )
              FROM ${personsTable}
              WHERE ${personsTable.id} = ANY(personal_records.persons)
            ) AS persons
          FROM personal_records
          ORDER BY ranking, personal_records.date
        )
        SELECT * FROM rankings
        WHERE rankings.ranking <= ${topN}
      `)
      .then((val: any[]) =>
        val.map((item: any) => {
          const objectWithCamelCase: any = {};
          for (const [key, value] of Object.entries(item)) objectWithCamelCase[camelCase(key)] = value;
          return objectWithCamelCase;
        }),
      );
  }
  // Top singles
  else if (bestOrAverage === "best") {
    rankings = await db
      .execute(sql`
        WITH rankings AS (
          SELECT
            CONCAT(${resultsTable.id}, '_', attempts_data.attempt_number) AS ranking_id,
            CAST(
              RANK() OVER (ORDER BY CAST(attempts_data.attempt->>'result' AS INTEGER) ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            AS INTEGER) AS ranking,
            ${resultsTable.date},
            (
              SELECT
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', ${personsTable.id},
                    'name', ${personsTable.name},
                    'localizedName', ${personsTable.localizedName},
                    'regionCode', ${personsTable.regionCode},
                    'wcaId', ${personsTable.wcaId}
                  )
                )
              FROM ${personsTable}
              WHERE ${personsTable.id} = ANY(${resultsTable.personIds})
            ) AS persons,
            CAST(attempts_data.attempt->>'result' AS INTEGER) AS result,
            JSON_BUILD_OBJECT(
              'competitionId', ${contestsTable.competitionId},
              'shortName', ${contestsTable.shortName},
              'type', ${contestsTable.type},
              'regionCode', ${contestsTable.regionCode}
            ) AS contest,
            ${resultsTable.videoLink},
            ${resultsTable.discussionLink}
          FROM ${resultsTable}
            LEFT JOIN ${contestsTable}
              ON ${resultsTable.competitionId} = ${contestsTable.competitionId},
            UNNEST(${resultsTable.attempts}) WITH ORDINALITY AS attempts_data(attempt, attempt_number)
          WHERE ${resultsTable.approved} IS TRUE
            AND ${resultsTable.eventId} = ${event.eventId}
            ${sql.raw(recordCategory === "all" ? "" : `AND record_category = '${recordCategory}'`)}
            AND CAST(attempts_data.attempt->>'result' AS INTEGER) > 0
            ${sql.raw(regionCondition)}
          ORDER BY ranking, ${resultsTable.date}
        )
        SELECT * FROM rankings
        WHERE rankings.ranking <= ${topN}
      `)
      .then((val: any[]) =>
        val.map((item: any) => {
          const objectWithCamelCase: any = {};
          for (const [key, value] of Object.entries(item)) objectWithCamelCase[camelCase(key)] = value;
          return objectWithCamelCase;
        }),
      );
  }
  // Top averages
  else {
    rankings = await db
      .execute(sql`
        WITH rankings AS (
          SELECT
            CAST(${resultsTable.id} AS TEXT) AS ranking_id,
            CAST(
              RANK() OVER (ORDER BY ${resultsTable.average} ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            AS INTEGER) AS ranking,
            ${resultsTable.date},
            (
              SELECT
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', ${personsTable.id},
                    'name', ${personsTable.name},
                    'localizedName', ${personsTable.localizedName},
                    'regionCode', ${personsTable.regionCode},
                    'wcaId', ${personsTable.wcaId}
                  )
                )
              FROM ${personsTable}
              WHERE ${personsTable.id} = ANY(${resultsTable.personIds})
            ) AS persons,
            CAST(${resultsTable.average} AS INTEGER) AS result,
            ${resultsTable.attempts},
            JSON_BUILD_OBJECT(
              'competitionId', ${contestsTable.competitionId},
              'shortName', ${contestsTable.shortName},
              'type', ${contestsTable.type},
              'regionCode', ${contestsTable.regionCode}
            ) AS contest,
            ${resultsTable.videoLink},
            ${resultsTable.discussionLink}
          FROM ${resultsTable}
            LEFT JOIN ${contestsTable}
              ON ${resultsTable.competitionId} = ${contestsTable.competitionId}
          WHERE ${resultsTable.approved} IS TRUE
            AND ${resultsTable.eventId} = ${event.eventId}
            ${sql.raw(recordCategory === "all" ? "" : `AND record_category = '${recordCategory}'`)}
            AND ${resultsTable.average} > 0
            AND CARDINALITY(${resultsTable.attempts}) = ${defaultNumberOfAttempts}
            ${sql.raw(regionCondition)}
          ORDER BY ${resultsTable.average}, ${resultsTable.date}
        )
        SELECT * FROM rankings
        WHERE rankings.ranking <= ${topN}
      `)
      .then((val: any[]) =>
        val.map((item: any) => {
          const objectWithCamelCase: any = {};
          for (const [key, value] of Object.entries(item)) objectWithCamelCase[camelCase(key)] = value;
          return objectWithCamelCase;
        }),
      );
  }

  return rankings!;
}

export async function getPersonExactMatchWcaId(
  person: SelectPerson,
  ignoredWcaMatches: string[] = [],
): Promise<string | null> {
  const res = await fetch(`${C.wcaV0ApiBaseUrl}/search/users?persons_table=true&q=${person.name}`);
  if (res.ok) {
    const { result: wcaPersons } = await res.json();

    for (const wcaPerson of wcaPersons) {
      const { name } = getNameAndLocalizedName(wcaPerson.name);

      if (
        !ignoredWcaMatches.includes(wcaPerson.wca_id) &&
        name === person.name &&
        wcaPerson.country_iso2 === person.regionCode
      ) {
        return wcaPerson.wca_id;
      }
    }

    return null;
  } else {
    throw new CcActionError("Error while fetching person matches from the WCA");
  }
}
