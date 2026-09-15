export type CapabilityResult<T> = PromiseSettledResult<T>;

export function readCapabilityResults<T extends Record<string, unknown>>(
  names: readonly string[],
  results: readonly CapabilityResult<unknown>[],
): { values: Partial<T>; failures: string[] } {
  const values: Partial<T> = {};
  const failures: string[] = [];
  names.forEach((name, index) => {
    const result = results[index];
    if (result?.status === 'fulfilled') values[name as keyof T] = result.value as T[keyof T];
    else failures.push(name);
  });
  return { values, failures };
}
