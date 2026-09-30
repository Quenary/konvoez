import { Mutex } from 'async-mutex';

type AsyncMethod<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

export function Mutexed(mutex?: Mutex) {
  const exclusiveMutex = mutex ?? new Mutex();

  return function <TThis, TArgs extends unknown[], TResult>(
    _target: object,
    _propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<
      AsyncMethod<TArgs, TResult> &
        ((this: TThis, ...args: TArgs) => Promise<TResult>)
    >,
  ): void {
    const originalMethod = descriptor.value;

    if (!originalMethod) {
      throw new Error(`@Mutexed can only be applied to methods`);
    }

    descriptor.value = async function (this: TThis, ...args: TArgs) {
      return exclusiveMutex.runExclusive(() =>
        originalMethod.apply(this, args),
      );
    } as typeof originalMethod;
  };
}
