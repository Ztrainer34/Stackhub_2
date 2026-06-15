// Convert exceptions into error as values
export const to = <T>(promise: Promise<T>): Promise<[Error, null] | [null, T]> =>
  promise
    .then((data: T) => [null, data] as [null, T])
    .catch((err: Error) => [err, null] as [Error, null]);

