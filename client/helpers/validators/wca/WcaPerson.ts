import z from "zod";
import { CountryCodes } from "~/helpers/Countries";
import { WcaIdValidator } from "~/helpers/validators/Validators";

export const WcaPersonValidator = z.object({
  wca_id: WcaIdValidator.nullable(),
  name: z.string().nonempty(),
  country_iso2: z.enum(CountryCodes),
});
