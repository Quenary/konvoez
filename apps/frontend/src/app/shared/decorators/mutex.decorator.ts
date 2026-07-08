import { Mutex } from 'async-mutex';

type AsyncMethod<TArgs extends any[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

export function Mutexed<T extends object>(
  mutex?: Mutex,
): (
  target: T,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<AsyncMethod<any[], any>>,
) => void {
  mutex = mutex ?? new Mutex();
  return function (
    target,
    propertyKey,
    descriptor: TypedPropertyDescriptor<AsyncMethod<any[], any>>,
  ) {
    const originalMethod = descriptor.value;

    if (!originalMethod) {
      throw new Error(`@Mutexed can only be applied to methods`);
    }

    descriptor.value = async function (...args: any[]) {
      return mutex.runExclusive(() => originalMethod.apply(this, args));
    };
  };
}
