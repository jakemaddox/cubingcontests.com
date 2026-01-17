"use client";

import { faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import Competitor from "~/app/components/Competitor.tsx";
import Competitors from "~/app/components/Competitors.tsx";
import ContestName from "~/app/components/ContestName.tsx";
import Country from "~/app/components/Country.tsx";
import RankingLinks from "~/app/components/RankingLinks.tsx";
import Solves from "~/app/components/Solves.tsx";
import { getFormattedTime } from "~/helpers/sharedFunctions.ts";
import type { Ranking } from "~/helpers/types/Rankings";
import { getFormattedDate } from "~/helpers/utilityFunctions.ts";
import type { EventResponse } from "~/server/db/schema/events.ts";

type RankingProps = {
  type: "ranking";
  ranking: Ranking;
  isTiedRanking: boolean;
  event: EventResponse;
  showAllTeammates: boolean;
  showTeamColumn: boolean;
  showDetailsColumn: boolean;
  showOnlyPersonWithId?: never;
};

type RecordProps = {
  type: "single-record" | "average-record";
  ranking: Ranking;
  isTiedRanking?: boolean;
  event: EventResponse;
  showAllTeammates?: never;
  showTeamColumn?: never;
  showDetailsColumn?: never;
  showOnlyPersonWithId: undefined | number;
};

function RankingRow({
  type,
  isTiedRanking,
  event,
  ranking,
  showAllTeammates = false,
  showTeamColumn = false,
  showDetailsColumn = false,
  showOnlyPersonWithId,
}: RankingProps | RecordProps) {
  const [teamExpanded, setTeamExpanded] = useState(false);

  const firstColumnValue =
    type === "ranking"
      ? ranking.ranking
      : type === "single-record"
        ? "Single"
        : ranking.attempts!.length === 3
          ? "Mean"
          : "Average";
  const personsToDisplay = showAllTeammates
    ? ranking.persons
    : [
        ranking.personId
          ? ranking.persons.find((p) => p.id === ranking.personId)!
          : ranking.persons[showOnlyPersonWithId ?? 0],
      ];
  const showMultiPoints = type === "ranking";

  /////////////////////////////////////////////////////////////////////////////////////////
  // REMEMBER TO UPDATE THE MOBILE VIEW OF THE RECORDS PAGE IN ACCORDANCE WITH THIS
  /////////////////////////////////////////////////////////////////////////////////////////

  return (
    <tr>
      <td>
        {!showOnlyPersonWithId && <span className={isTiedRanking ? "text-secondary" : ""}>{firstColumnValue}</span>}
      </td>
      <td>
        <Competitors persons={personsToDisplay} noFlag={!showAllTeammates} />
      </td>
      <td>{!showOnlyPersonWithId && getFormattedTime(ranking.result, { event, showMultiPoints })}</td>
      {!showAllTeammates && (
        <td>
          <Country countryIso2={personsToDisplay[0].regionCode} shorten />
        </td>
      )}
      <td>{!showOnlyPersonWithId && getFormattedDate(ranking.date)}</td>
      <td>
        {!showOnlyPersonWithId &&
          (ranking.contest ? <ContestName contest={ranking.contest} /> : <RankingLinks ranking={ranking} />)}
      </td>
      {showTeamColumn && (
        <td>
          <div className="d-flex fs-6 flex-column gap-2 align-items-start">
            <span className="text-white">
              <button
                type="button"
                onClick={() => setTeamExpanded(!teamExpanded)}
                className="border-0 bg-transparent p-0 text-decoration-underline"
                style={{ cursor: "pointer" }}
              >
                {teamExpanded ? "Close" : "Open"}
              </button>
              <span>
                {teamExpanded ? <FontAwesomeIcon icon={faCaretDown} /> : <FontAwesomeIcon icon={faCaretRight} />}
              </span>
            </span>

            {teamExpanded && ranking.persons.map((p) => <Competitor key={p.id} person={p} />)}
          </div>
        </td>
      )}
      {(showDetailsColumn || type !== "ranking") && (
        <td>
          {!showOnlyPersonWithId &&
            (ranking.attempts ? (
              <Solves event={event} attempts={ranking.attempts} showMultiPoints={showMultiPoints} />
            ) : ranking.memo ? (
              getFormattedTime(ranking.memo, { showDecimals: false, alwaysShowMinutes: true })
            ) : (
              ""
            ))}
        </td>
      )}
    </tr>
  );
}

export default RankingRow;
