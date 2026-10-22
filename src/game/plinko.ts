import Matter from "matter-js";
const { Engine, Bodies, Body, Composite } = Matter;
export const DROP_WIDTH = 300;
export const DROP_HEIGHT = 310;
export const DROP_STEP = 1000 / 120;
export const DROP_PAYOUTS = [120, 80, 0, 80, 120] as const;
export const PEGS = Array.from({ length: 7 }, (_, row) =>
  Array.from({ length: row % 2 ? 8 : 9 }, (_, col) => ({
    x: (row % 2 ? 38 : 22) + col * 32,
    y: 55 + row * 29,
  })),
).flat();
export interface DropSimulation {
  engine: Matter.Engine;
  ball: Matter.Body;
  steps: number;
  bin: number | null;
}
/** Each seed owns a physics world, so concurrent launches and reloads replay identically. */
export function createDrop(seed: number): DropSimulation {
  const engine = Engine.create({
    enableSleeping: false,
    positionIterations: 8,
    velocityIterations: 8,
  });
  engine.gravity.y = 1;
  const walls = [
    Bodies.rectangle(-3, 155, 12, 330, { isStatic: true }),
    Bodies.rectangle(303, 155, 12, 330, { isStatic: true }),
    Bodies.rectangle(150, 315, 320, 12, { isStatic: true }),
  ];
  const pegs = PEGS.map(({ x, y }) =>
    Bodies.circle(x, y, 3.7, {
      isStatic: true,
      restitution: 0.55,
      friction: 0,
    }),
  );
  const bins = [60, 120, 180, 240].map((x) =>
    Bodies.rectangle(x, 289, 4, 48, { isStatic: true, restitution: 0.2 }),
  );
  const unsigned = seed >>> 0;
  const ball = Bodies.circle(85 + (unsigned % 13000) / 100, 12, 6, {
    restitution: 0.56,
    friction: 0.003,
    frictionAir: 0.001,
    density: 0.002,
  });
  Body.setVelocity(ball, {
    x: (((unsigned >>> 16) % 2001) - 1000) / 900,
    y: 0.1,
  });
  Composite.add(engine.world, [...walls, ...pegs, ...bins, ball]);
  return { engine, ball, steps: 0, bin: null };
}
export function stepDrop(sim: DropSimulation): number | null {
  if (sim.bin !== null) return sim.bin;
  Engine.update(sim.engine, DROP_STEP);
  sim.steps++;
  // A small deterministic tap frees an exceptionally balanced ball from a peg.
  if (sim.steps % 180 === 0 && sim.ball.speed < 0.25)
    Body.applyForce(sim.ball, sim.ball.position, {
      x: sim.steps % 360 ? 0.00006 : -0.00006,
      y: 0.00003,
    });
  if (sim.ball.position.y >= 285)
    sim.bin = Math.max(0, Math.min(4, Math.floor(sim.ball.position.x / 60)));
  return sim.bin;
}
export function disposeDrop(sim: DropSimulation) {
  Composite.clear(sim.engine.world, false);
  Engine.clear(sim.engine);
}
export function simulateDrop(seed: number): number {
  const sim = createDrop(seed);
  try {
    for (let i = 0; i < 7200; i++) {
      const bin = stepDrop(sim);
      if (bin !== null) return bin;
    }
    throw Error("Ball is still moving; please retry settlement");
  } finally {
    disposeDrop(sim);
  }
}
