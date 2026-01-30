"use client";

import { useAction } from "next-safe-action/hooks";
import { useEffect } from "react";
import { logErrorSF } from "~/server/serverFunctions/serverFunctions";

type Props = {
  error: Error & { digest?: string };
};

function ErrorPage({ error }: Props) {
  const { execute: logError } = useAction(logErrorSF);

  useEffect(() => {
    logError({ message: error.message });
  }, [error]);

  return (
    <section>
      <h4 className="mt-4 text-center">Error</h4>

      <p className="mt-4 text-center">An unexpected error has occurred. Please contact the development team.</p>
    </section>
  );
}

export default ErrorPage;
