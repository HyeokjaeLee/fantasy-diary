import { assert } from "es-toolkit";

export function assertEnv(key: string): string;
export function assertEnv<T extends string>(
  key: string,
  validValues: readonly T[]
): T;

export function assertEnv<T extends string>(
  key: string,
  validValues?: readonly T[]
): T | string {
  const value = process.env[key];

  assert(value, `Missing env var: ${key}`);

  if (!validValues) return value;

  assert(
    validValues.length > 0,
    `No valid values provided for env var: ${key}`
  );

  const castedValue = value as T;

  assert(validValues.includes(castedValue), `Invalid env var: ${key}`);

  return castedValue;
}
