/**
 * Fixed-timestep game loop. The simulation always advances in TICK-sized
 * steps (independent of the display refresh rate); rendering happens once per
 * animation frame. `speed` multiplies how many ticks are simulated per second.
 */
export const TICK = 1 / 60;
const MAX_FRAME_DELTA = 0.25;
const MAX_TICKS_PER_FRAME = 12;

export interface LoopCallbacks {
  update: (dt: number) => void;
  render: (alpha: number, frameDt: number) => void;
}

export class GameLoop {
  speed = 1;
  paused = false;
  private running = false;
  private last = 0;
  private accumulator = 0;
  private rafId = 0;

  constructor(private readonly callbacks: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    const frame = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(frame);
      const frameDt = Math.min(MAX_FRAME_DELTA, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        this.accumulator += frameDt * this.speed;
        let ticks = 0;
        while (this.accumulator >= TICK && ticks < MAX_TICKS_PER_FRAME) {
          this.callbacks.update(TICK);
          this.accumulator -= TICK;
          ticks++;
        }
        if (ticks >= MAX_TICKS_PER_FRAME) this.accumulator = 0;
      }
      this.callbacks.render(this.accumulator / TICK, frameDt);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  get isRunning(): boolean {
    return this.running;
  }
}
