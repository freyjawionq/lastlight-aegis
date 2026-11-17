// Keyboard and mouse state with per-frame edge detection. The game
// polls `held` for movement and `pressed` for one-shot actions
// (dash, pause, restart); edges are cleared at the end of each frame
// by `endFrame`.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.edges = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.rightDown = false;
    this.mouseClicked = false;
    this.rightClicked = false;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.edges.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rightDown = false;
    });

    canvas.addEventListener('mousemove', (event) => {
      const point = this.toGameCoordinates(event);
      this.mouseX = point.x;
      this.mouseY = point.y;
    });
    canvas.addEventListener('mousedown', (event) => {
      const point = this.toGameCoordinates(event);
      this.mouseX = point.x;
      this.mouseY = point.y;
      if (event.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      } else if (event.button === 2) {
        this.rightDown = true;
        this.rightClicked = true;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
      if (event.button === 2) this.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  // The canvas is CSS-scaled to fit the window; map client pixels
  // back into the game's fixed 1280x800 coordinate space.
  toGameCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * this.canvas.height,
    };
  }

  held(code) {
    return this.keys.has(code);
  }

  pressed(code) {
    return this.edges.has(code);
  }

  // Movement axis from WASD or arrow keys, as a raw -1..1 pair.
  moveAxis() {
    let x = 0;
    let y = 0;
    if (this.held('KeyA') || this.held('ArrowLeft')) x -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) x += 1;
    if (this.held('KeyW') || this.held('ArrowUp')) y -= 1;
    if (this.held('KeyS') || this.held('ArrowDown')) y += 1;
    return { x, y };
  }

  endFrame() {
    this.edges.clear();
    this.mouseClicked = false;
    this.rightClicked = false;
  }
}
