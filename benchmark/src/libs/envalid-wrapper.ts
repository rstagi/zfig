import { cleanEnv, str, port, bool } from "envalid";
import type { LibWrapper, EnvOnlyResult } from "./types.js";

export const envalidWrapper: LibWrapper = {
  name: "envalid",
  envOnly: (env: Record<string, string>): EnvOnlyResult => {
    const result = cleanEnv(env, {
      HOST: str({ default: "localhost" }),
      PORT: port({ default: 3000 }),
      DEBUG: bool({ default: false }),
    });
    return {
      host: result.HOST,
      port: result.PORT,
      debug: result.DEBUG,
    };
  },
  envValidated: (env: Record<string, string>): EnvOnlyResult => {
    const result = cleanEnv(env, {
      HOST: str({ default: "localhost" }),
      PORT: port({ default: 3000 }),
      DEBUG: bool({ default: false }),
    });
    return {
      host: result.HOST,
      port: result.PORT,
      debug: result.DEBUG,
    };
  },
};
