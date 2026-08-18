// Deliberate violations. See README.md in this directory.
export class Drifting {
  #value = 0;

  readonly stamped = new Date();
  readonly millis = Date.now();

  set value(next: number) {
    this.#value = next;
  }

  get value(): number {
    return this.#value;
  }
}
