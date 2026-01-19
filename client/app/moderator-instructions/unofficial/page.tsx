import Link from "next/link";
import Tabs from "~/app/components/UI/Tabs.tsx";
import { tabs } from "~/app/moderator-instructions/tabs.ts";

function ModeratorInstructionsUnofficial() {
  return (
    <>
      <Tabs tabs={tabs} activeTab="unofficial" forServerSidePage />

      <div className="mt-4">
        <p>
          B1. If you are holding an unofficial competition, you must use the <b className="hl">Competition</b> contest
          type and fill out the contest details manually. Both WCA events and unofficial events may be held at these
          kinds of competitions.
        </p>
        <p>
          B2. The rest of the process is the same as{" "}
          <Link href="wca" prefetch={false}>
            {tabs[0].title}
          </Link>
          .
        </p>
        <p>
          B3. Unofficial competitions are <b>only</b> allowed if they cannot reasonably be held as official WCA
          competitions. Please <b>DO NOT</b> attempt to use Cubing Contests as a substitute for the WCA. Your
          competition may be rejected if it is deemed that it could be held as a WCA competition instead.
        </p>
        <p className="ms-3">
          B3.1. On the day of the competition, make sure to take photos in accordance with rule U2.
        </p>
      </div>
    </>
  );
}

export default ModeratorInstructionsUnofficial;
