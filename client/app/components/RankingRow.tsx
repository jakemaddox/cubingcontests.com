"use client";

import { faCaretDown, faCaretRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import capitalize from "lodash/capitalize";
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

type Props = {
  isTiedRanking?: boolean;
  onlyKeepPerson?: boolean;
  event: EventResponse;
  ranking: Ranking;
  showAllTeammates: boolean;
  showTeamColumn?: boolean;
  showDetailsColumn: boolean;
  forRecordsTable?: boolean;
};

function RankingRow({
  isTiedRanking,
  onlyKeepPerson = false,
  event,
  ranking,
  showAllTeammates,
  showTeamColumn = false,
  showDetailsColumn,
  forRecordsTable = false,
}: Props) {
  const [teamExpanded, setTeamExpanded] = useState(false);
  // TO-DO: Clean this up; the type property used to be used for the records page
  const firstColumnValue = ranking.ranking ?? capitalize((ranking as any).type as "single" | "average" | "mean");
  const personsToDisplay = showAllTeammates
    ? ranking.persons
    : [ranking.personId ? ranking.persons.find((p) => p.id === ranking.personId)! : ranking.persons[0]];

  /////////////////////////////////////////////////////////////////////////////////////////
  // REMEMBER TO UPDATE THE MOBILE VIEW OF THE RECORDS PAGE IN ACCORDANCE WITH THIS
  /////////////////////////////////////////////////////////////////////////////////////////

  return (
    <tr>
      <td>{!onlyKeepPerson && <span className={isTiedRanking ? "text-secondary" : ""}>{firstColumnValue}</span>}</td>
      <td>
        <Competitors persons={personsToDisplay} noFlag={!showAllTeammates} />
      </td>
      <td>{!onlyKeepPerson && getFormattedTime(ranking.result, { event, showMultiPoints: !forRecordsTable })}</td>
      {!showAllTeammates && (
        <td>
          <Country countryIso2={personsToDisplay[0].regionCode} shorten />
        </td>
      )}
      <td>{!onlyKeepPerson && getFormattedDate(ranking.date)}</td>
      <td>
        {!onlyKeepPerson &&
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
      {showDetailsColumn && (
        <td>
          {!onlyKeepPerson &&
            (ranking.attempts ? (
              <Solves event={event} attempts={ranking.attempts} showMultiPoints={!forRecordsTable} />
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
