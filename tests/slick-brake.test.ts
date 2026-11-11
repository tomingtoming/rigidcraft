import { expect, it } from 'vitest';
import { scenarioById } from '../src/challenge/scenarios';
import { KeyState } from '../src/input/keys';
import { CAR } from '../src/samples/car';
import { RustSimulation } from '../src/sim/rust-simulation';

// On the low-grip lane the brake asks for more than the tyres hold. The locked wheels slide the car to a stop; they must
// not spin backwards and carry it into reverse (it used to roll back 35 m with the brake held).
it.each([0, 45])('the stock car brakes to a stop inside the goal and stays there (run-up after %i frames)', async settle => {
  const course = scenarioById('braking-box')!;
  const keys = new KeyState(new EventTarget());
  const sim = new RustSimulation(CAR, keys, { scenario: course });
  try {
    await sim.start();
    for (let i = 0; i < settle; i++) sim.step(); // the later run-up is the one that reversed
    keys.press(0);
    while (sim.corePosition().z > course.brakeLine! && sim.frame < 600) sim.step();
    keys.release(0);
    keys.press(4);
    let farthest = 0, backward = 0;
    for (let i = 0; i < 700; i++) {
      sim.step();
      farthest = Math.min(farthest, sim.corePosition().z);
      backward = Math.max(backward, sim.coreVelocity().z);
    }
    expect(backward).toBeLessThan(0.3);
    expect(sim.coreVelocity().length()).toBeLessThan(0.3);
    expect(sim.corePosition().z - farthest).toBeLessThan(0.5);
    // braking at the white line, as the description says, ends in the green box with either run-up
    const [, , , , far, near] = course.goal!;
    expect(sim.corePosition().z).toBeGreaterThan(far + 2);
    expect(sim.corePosition().z).toBeLessThan(near - 2);
  } finally { await sim.dispose(); }
});
