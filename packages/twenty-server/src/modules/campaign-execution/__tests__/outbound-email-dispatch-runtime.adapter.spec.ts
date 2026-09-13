import { ConservativeSuspendAwareMonotonicClock } from 'src/modules/campaign-execution/adapters/outbound-email-dispatch-runtime.adapter';

const sources = () => {
  let monotonic = 100;
  let wall = 1_000;

  return {
    advance: (monotonicDelta: number, wallDelta = monotonicDelta) => {
      monotonic += monotonicDelta;
      wall += wallDelta;
    },
    clock: new ConservativeSuspendAwareMonotonicClock({
      monotonicNow: () => monotonic,
      wallNow: () => wall,
    }),
  };
};

describe('ConservativeSuspendAwareMonotonicClock', () => {
  it('counts monotonic elapsed time, including a process suspension interval', () => {
    const harness = sources();
    const before = harness.clock.now();

    harness.advance(60_000, 60_000);

    expect(harness.clock.now() - before).toBe(60_000);
  });

  it('fails closed on a forward wall/monotonic drift', () => {
    const harness = sources();

    harness.advance(10, 10_000);

    expect(() => harness.clock.now()).toThrow('forward wall-clock drift');
  });

  it('does not extend a deadline after a backward wall jump', () => {
    const harness = sources();
    const before = harness.clock.now();

    harness.advance(500, -60_000);

    expect(harness.clock.now() - before).toBe(500);
  });

  it('fails closed on backward or non-finite monotonic evidence', () => {
    const backward = sources();
    backward.advance(-1);
    expect(() => backward.clock.now()).toThrow('moved backwards');

    expect(
      () =>
        new ConservativeSuspendAwareMonotonicClock({
          monotonicNow: () => Number.NaN,
          wallNow: () => 1,
        }),
    ).toThrow('non-finite');
  });
});
