import "server-only";
import { fileURLToPath } from "node:url";
import pino from "pino";

if (!process.env.LOGFLARE_PUBLIC_ACCESS_TOKEN)
  throw new Error("LOGFLARE_PUBLIC_ACCESS_TOKEN environment variable not set!");
if (!process.env.LOGFLARE_API_BASE_URL) throw new Error("LOGFLARE_API_BASE_URL environment variable not set!");

/**
 * Use this query in Supabase Logs to view Cubing Contests logs:
 *
 * select id, timestamp, event_message, metadata from function_edge_logs where metadata->>'cc_code' is not null order by timestamp desc limit 100;
 *
 * That query can also be used to filter by a specific CC log code.
 */

const transport = pino.transport({
  target: "pino-logflare",
  options: {
    apiBaseUrl: process.env.LOGFLARE_API_BASE_URL,
    apiKey: process.env.LOGFLARE_PUBLIC_ACCESS_TOKEN,
    // sourceToken: "your-source-token",
    // either sourceToken or sourceName can be provided. sourceToken takes precedence.
    sourceName: "deno-relay-logs",

    // handle errors on the client side
    // onError: { module: "my_utils", method: "handleErrors" },
    // transform events before sending
    onPreparePayload: {
      module: fileURLToPath(import.meta.url.replace(/\/logger.ts$/, "/loggerUtils.js")),
      method: "handlePayload",
    },
  },
});

export const logger = pino(transport);

export type LogCode =
  | "CC0001" // affiliate link click
  | "CC0002" // create event
  | "CC0003" // update event
  | "CC0004"
  | "CC0005" // create contest
  | "CC0006" // approve contest
  | "CC0007" // finish contest
  | "CC0008" // un-finish contest
  | "CC0009" // publish contest
  | "CC0010" // update contest
  | "CC0011" // delete contest
  | "CC0012" // open round
  | "CC0013" // create contest result
  | "CC0014" // update contest result
  | "CC0015" // delete contest result
  | "CC0016" // create video-based result
  | "CC0017" // update video-based result
  | "CC0018" // delete video-based result
  | "CC0019" // create person
  | "CC0020" // update person
  | "CC0021" // delete person
  | "CC0022" // approve person
  | "CC0023" // approve persons
  | "CC0024" // set result record
  | "CC0025" // set future result record
  | "CC0026" // cancel future result record
  | "CC0027" // create record config
  | "CC0028" // update record config

  // Error codes
  | "CC5001" // send email error
  | "CC5002"; // approve person error
