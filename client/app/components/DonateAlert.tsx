import Link from "next/link";

function DonateAlert() {
  return (
    <div className="alert alert-light mx-2 mb-4" role="alert">
      <Link href="/donate" target="_blank">
        Keep the lights on!
      </Link>{" "}
      Cubing Contests is supported by our generous donors.
    </div>
  );
}

export default DonateAlert;
