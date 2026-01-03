"use client";

import { faClock, faCopy, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useContext, useState } from "react";
import Button from "~/app/components/UI/Button.tsx";
import { MainContext } from "~/helpers/contexts.ts";
import type { ContestState } from "~/helpers/types";
import { getActionError } from "~/helpers/utilityFunctions";
import type { ContestResponse } from "~/server/db/schema/contests.ts";
import { approveContestSF } from "~/server/serverFunctions/contestServerFunctions";

type ModDashboardProps = {
  forPage: "mod-dashboard";
  onUpdateContestState: (competitionId: string, newState: ContestState) => void;
};

type ContestDetailsProps = {
  forPage: "contest-details";
  onUpdateContestState?: never;
};

type Props = {
  contest: ContestResponse;
  isAdmin: boolean;
} & (ModDashboardProps | ContestDetailsProps);

function ContestControls({ contest, isAdmin = false, forPage, onUpdateContestState }: Props) {
  const { changeErrorMessages } = useContext(MainContext);

  const { executeAsync: approveContest } = useAction(approveContestSF);
  const [loadingId, setLoadingId] = useState("");

  const smallButtons = forPage === "mod-dashboard";

  const onApproveContest = async () => {
    if (confirm(`Are you sure you would like to approve ${contest.name}?`)) {
      setLoadingId(`approve_contest_${contest.competitionId}_button`);
      const res = await approveContest({ competitionId: contest.competitionId });

      if (res.serverError || res.validationErrors) {
        changeErrorMessages([getActionError(res)]);
        setLoadingId("");
      } else if (forPage === "mod-dashboard") {
        onUpdateContestState(contest.competitionId, "approved");
        setLoadingId("");
      } else {
        window.location.reload();
      }
    }
  };

  const onFinishContest = () => {};

  const onPublishContest = () => {};

  return (
    <div className="d-flex gap-2">
      {(["created", "approved", "ongoing"].includes(contest.state) || isAdmin) && (
        <Link
          href={`/mod/competition?editId=${contest.competitionId}`}
          prefetch={false}
          className={`btn btn-primary ${smallButtons ? "btn-xs" : ""}`}
          title="Edit"
          aria-label="Edit"
        >
          <FontAwesomeIcon icon={faPencil} />
        </Link>
      )}
      {contest.type !== "wca-comp" && (
        <Link
          href={`/mod/competition?copyId=${contest?.competitionId}`}
          prefetch={false}
          className={`btn btn-primary ${smallButtons ? "btn-xs" : ""}`}
          title="Clone"
          aria-label="Clone"
        >
          <FontAwesomeIcon icon={faCopy} />
        </Link>
      )}
      {(["approved", "ongoing"].includes(contest.state) || (isAdmin && contest.state === "finished")) && (
        <Link
          href={`/mod/competition/${contest.competitionId}`}
          prefetch={false}
          className={`btn btn-success ${smallButtons ? "btn-xs" : ""}`}
        >
          Results
        </Link>
      )}
      {contest.state === "created" && isAdmin && (
        <Button
          id={`approve_contest_${contest.competitionId}_button`}
          type="button"
          onClick={() => onApproveContest()}
          loadingId={loadingId}
          className={`btn btn-warning ${smallButtons ? "btn-xs" : ""}`}
        >
          Approve
        </Button>
      )}
      {contest.state === "ongoing" && (
        <Button
          id={`set_state_finished_${contest.competitionId}_button`}
          type="button"
          onClick={() => onFinishContest()}
          loadingId={loadingId}
          className={`btn btn-warning ${smallButtons ? "btn-xs" : ""}`}
        >
          Finish
        </Button>
      )}
      {contest.state === "finished" &&
        (isAdmin ? (
          <Button
            id={`set_state_published_${contest.competitionId}_button`}
            type="button"
            onClick={() => onPublishContest()}
            loadingId={loadingId}
            className={`btn btn-warning ${smallButtons ? "btn-xs" : ""}`}
          >
            Publish
          </Button>
        ) : (
          <FontAwesomeIcon
            icon={faClock}
            title="Contest pending review"
            aria-label="Contest pending review"
            className="fs-5 my-1"
          />
        ))}
    </div>
  );
}

export default ContestControls;
