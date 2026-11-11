import { expect, it } from 'vitest';
import { scenarioById } from '../src/challenge/scenarios';
import { KeyState } from '../src/input/keys';
import { CAR } from '../src/samples/car';
import { RustSimulation } from '../src/sim/rust-simulation';

// On the low-grip lane the brake asks for more than the tyres hold. The locked wheels slide the car to a stop; they must
// not spin backwards and carry it into reverse (it used to roll back 35 m with the brake held).
it('the stock car brakes to a stop on the slick lane and stays there', async () => {
  const keys = new KeyState(new EventTarget());
  const sim = new RustSimulation(CAR, keys, { scenario: scenarioById('braking-box') });
  try {
    await sim.start();
    for (let i = 0; i < 45; i++) sim.step(); // settle first: this approach is the one that reversed
    keys.press(0);
    while (sim.corePosition().z > -36 && sim.frame < 600) sim.step();
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
  } finally { await sim.dispose(); }
});
