import "server-only";
import { and, desc, eq, inArray, lte, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Continents, Countries } from "~/helpers/Countries.ts";
import { C } from "~/helpers/constants.ts";
import { type RecordCategory, type RecordType, RecordTypeValues } from "~/helpers/types.ts";
import { getIsAdmin } from "~/helpers/utilityFunctions.ts";
import type { ContestResponse } from "~/server/db/schema/contests.ts";
import { personsTable, type SelectPerson } from "~/server/db/schema/persons.ts";
import { type LogCode, logger } from "~/server/logger.ts";
import { CcActionError } from "~/server/safeAction.ts";
import { getDateOnly, getNameAndLocalizedName } from "../helpers/sharedFunctions.ts";
import { auth } from "./auth.ts";
import { type DbTransactionType, db } from "./db/provider.ts";
import { eventsPublicCols, eventsTable } from "./db/schema/events.ts";
import { recordConfigsPublicCols, recordConfigsTable } from "./db/schema/record-configs.ts";
import { resultsTable, type SelectResult } from "./db/schema/results.ts";
import type { CcPermissions } from "./permissions.ts";

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

export function logMessage(code: LogCode, message: string) {
  const messageWithCode = `[${code}] ${message}`;

  // If not in test environment, log to console too (tests use a different implementation of the logger that logs straight to console)
  if (!process.env.VITEST) console.log(messageWithCode);

  try {
    // The metadata is then handled in loggerUtils.js
    logger.child({ ccCode: code }).info(messageWithCode);
  } catch (err) {
    console.error("Error while sending log to Supabase Analytics:", err);
  }
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
  eventId: string,
  bestOrAverage: "best" | "average",
  recordType: RecordType,
  recordCategory: RecordCategory,
  {
    recordsUpTo = getDateOnly(new Date())!,
    excludeResultId,
    regionCode,
  }: { recordsUpTo?: Date; excludeResultId?: number; regionCode?: string } = {
    recordsUpTo: getDateOnly(new Date())!,
  },
): Promise<SelectResult | undefined> {
  const recordField = bestOrAverage === "best" ? "regionalSingleRecord" : "regionalAverageRecord";
  const superRegion = Continents.find((c) => c.recordTypeId === recordType);
  const region = regionCode ? Countries.find((c) => c.code === regionCode) : undefined;
  const recordTypes: RecordType[] = [];

  if (recordType === "WR") {
    recordTypes.push("WR");
  } else if (superRegion) {
    recordTypes.push(recordType, "WR");
  } else if (region) {
    const crType = Continents.find((c) => c.code === region.superRegionCode)!.recordTypeId;
    recordTypes.push("NR", crType, "WR");
  } else {
    throw new Error(`Unknown region code: ${regionCode}`);
  }

  const [recordResult] = await db
    .select()
    .from(resultsTable)
    .where(
      and(
        eq(resultsTable.eventId, eventId),
        excludeResultId ? ne(resultsTable.id, excludeResultId) : undefined,
        lte(resultsTable.date, recordsUpTo),
        eq(resultsTable.recordCategory, recordCategory),
        inArray(resultsTable[recordField], recordTypes),
        superRegion ? eq(resultsTable.superRegionCode, superRegion.code) : undefined,
        regionCode ? eq(resultsTable.regionCode, regionCode) : undefined,
      ),
    )
    .orderBy(desc(resultsTable.date))
    .limit(1);
  return recordResult;
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

export async function setPersonToApproved(
  person: SelectPerson,
  {
    tx,
    requireWcaId,
    ignoredWcaMatches = [],
  }: {
    tx?: DbTransactionType; // this can optionally be run inside of a transaction
    requireWcaId: boolean;
    ignoredWcaMatches?: string[];
  },
): Promise<SelectPerson> {
  const updatePersonObject: Partial<SelectPerson> = {};

  if (!person.wcaId) {
    const res = await fetch(`${C.wcaV0ApiBaseUrl}/search/users?persons_table=true&q=${person.name}`);
    if (res.ok) {
      const { result: wcaPersons } = await res.json();

      if (!requireWcaId) {
        for (const wcaPerson of wcaPersons) {
          const { name } = getNameAndLocalizedName(wcaPerson.name);

          if (
            !ignoredWcaMatches.includes(wcaPerson.wca_id) &&
            name === person.name &&
            wcaPerson.country_iso2 === person.regionCode
          ) {
            throw new CcActionError(
              `There is an exact name and country match with the WCA competitor with WCA ID ${wcaPerson.wca_id}. If that is the same person, edit their profile, adding the WCA ID. If it's a different person, simply approve them again to confirm.`,
              { data: { wcaMatches: [...ignoredWcaMatches, wcaPerson.wca_id] } },
            );
          }
        }
      }
      // We only want to assign the WCA ID if there's just one matched person
      else if (wcaPersons?.length === 1) {
        const [wcaPerson] = wcaPersons;
        const { name, localizedName } = getNameAndLocalizedName(wcaPerson.name);

        if (name === person.name && wcaPerson.country_iso2 === person.regionCode) {
          updatePersonObject.wcaId = wcaPerson.wca_id;
          if (localizedName) updatePersonObject.localizedName = localizedName;
        }
      }
    }
  }

  if (!requireWcaId || person.wcaId || updatePersonObject.wcaId) {
    logMessage("CC0022", `Approving person ${person.name} (CC ID: ${person.id})`);

    updatePersonObject.approved = true;
  }

  if (Object.keys(updatePersonObject).length > 0) {
    const [updatedPerson] = await (tx ?? db)
      .update(personsTable)
      .set(updatePersonObject)
      .where(eq(personsTable.id, person.id))
      .returning();
    return updatedPerson;
  }

  return person;
}

export async function approvePersons(
  tx: DbTransactionType,
  personIds: number[],
  { requireWcaId }: { requireWcaId: boolean },
) {
  const persons = await tx.query.persons.findMany({ where: { id: { in: personIds }, approved: false } });

  logMessage(
    "CC0023",
    `Approving persons with person IDs: ${personIds.join(", ")}${requireWcaId ? " (WCA IDs required)" : ""}`,
  );

  const settledPromises = await Promise.allSettled(
    persons.filter((p) => !p.approved).map((p) => setPersonToApproved(p, { tx, requireWcaId })),
  );

  // Log errors, if there were any
  if (settledPromises.some((p) => p.status === "rejected")) {
    for (const promise of settledPromises) {
      if (promise.status === "rejected") logMessage("CC5002", `Error while approving person: ${promise.reason}`);
    }

    throw new CcActionError(
      "Error while approving persons. Please report this to the admin team, providing the contest ID in the email.",
    );
  }
}
