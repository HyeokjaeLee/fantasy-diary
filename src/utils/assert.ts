import { assert as esAssert } from 'es-toolkit';

export const assert = (env: string, message = 'Assertion failed') =>
  esAssert(env, message);
