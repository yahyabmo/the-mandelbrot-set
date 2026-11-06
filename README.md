# Mandelbrot Odyssey

A real-time journey into the Mandelbrot set, computed live on your graphics card. Scroll into a spiral, fly to the famous places of the set, change the colours as you go, and dive to a magnification of a thousand billion, smoothly.

## Installation

You only need **Node.js 18 or newer**, which is free. Everything else installs itself on the first launch.

### 1. Install Node.js (once)

| System | Easiest way |
| --- | --- |
| **Windows** | Download the **LTS** installer from [nodejs.org](https://nodejs.org/en/download) and run it. Or, in PowerShell: `winget install OpenJS.NodeJS.LTS` |
| **macOS** | Download the **LTS** installer from [nodejs.org](https://nodejs.org/en/download). Or, with Homebrew: `brew install node` |
| **Linux** | Ubuntu 24.04 or Debian 12: `sudo apt install nodejs npm`. Fedora: `sudo dnf install nodejs`. Arch: `sudo pacman -S nodejs npm` |

To check, open a **new** terminal and run `node --version`: it should print `v18` or higher. If your Linux distribution ships an older version, follow the commands for your system on [nodejs.org/en/download](https://nodejs.org/en/download).

### 2. Get Mandelbrot Odyssey

- **Without Git:** click the green **Code** button at the top of this page, choose **Download ZIP**, then unzip it.
- **With Git:** `git clone https://github.com/yahyabmo/the-mandelbrot-set.git`

### 3. Start it

| System | What to do |
| --- | --- |
| **Windows** | Double-click `start.bat` in the folder. |
| **macOS** | Double-click `start.command` in the folder. |
| **Linux** | Open a terminal in the folder and run `./start.sh` |

The first launch installs the dependencies, which takes about a minute. The explorer then opens in your browser at <http://localhost:5191>. Later launches take a few seconds. To stop it, close the terminal window, or press <kbd>Ctrl</kbd>+<kbd>C</kbd> in it.

From a terminal, the same thing works on every system:

```bash
cd the-mandelbrot-set
npm install
npm start
```

### If something goes wrong

| Problem | Fix |
| --- | --- |
| `node` is not recognized, or "Node.js is not installed" | Install Node.js (step 1), then open a **new** terminal or window and try again. |
| "Node.js is too old" | Install the LTS version from [nodejs.org](https://nodejs.org/en/download). |
| Windows shows "Windows protected your PC" | Click **More info**, then **Run anyway**. |
| macOS says the file cannot be opened | Open **System Settings → Privacy & Security**, click **Open Anyway**, then double-click again. Or run `./start.sh` from Terminal. |
| Linux or macOS says "permission denied" | Run `chmod +x start.sh start.command` once in the folder. |
| "Port 5191 is already in use" | The explorer is probably already running: close the other window. Or start it on another port: `npm start -- --port 5192` |
| The page says WebGL2 is missing | Use a recent Chrome, Edge or Firefox, with hardware acceleration turned on in its settings. |
| The browser did not open | Open <http://localhost:5191> yourself. |

## Screenshots

![The whole Mandelbrot set, with the panel of places and colours](docs/screenshots/home.jpg)

*The whole set. On the right, eight famous places and seven palettes; on the left, the zoom, the coordinates and the engine at work.*

![Seahorse valley](docs/screenshots/seahorses.jpg)

*Seahorse valley, between the main cardioid and its largest bulb.*

![A double spiral 100 000 times closer](docs/screenshots/spiral.jpg)

*A double spiral at a magnification of 10⁵, computed with perturbations around a reference orbit.*

| | |
| :-: | :-: |
| ![Elephant valley in the Glacier palette](docs/screenshots/elephants.jpg) | ![Lightning around a bulb in the Ember palette](docs/screenshots/lightning.jpg) |
| *Elephant valley, Glacier* | *Lightning, Ember* |

![The point of the original 2023 script at a magnification of a billion](docs/screenshots/dive-2023.jpg)

*The 2023 dive: the point of the original script, a billion times closer, in its own Turbo colours.*

<p align="center">
  <img src="docs/screenshots/mobile.jpg" alt="The spiral on a phone" width="300">
</p>

<p align="center"><em>On a phone: pinch to zoom, drag to move, and the panel folds away.</em></p>

## What you can do

- **Zoom anywhere.** Scroll or pinch to zoom around the pointer, drag to move, and let go to glide. Double-click dives four times closer, <kbd>Shift</kbd> + double-click goes back.
- **Fly to famous places.** Seahorse valley, a double spiral, elephant valley, a minibrot copy of the whole set, the dendrite at c = i, and the point of the original script. Each flight eases in log space, so a jump of nine orders of magnitude still feels even.
- **Colour it.** Seven palettes, including *Turbo 2023*, the colours of the original script: 150 steps of Turbo, up and back down. Change the density and the shift, or let the colours flow. Colours change instantly, without recomputing the image.
- **Always smooth.** While you move, the image is computed at a lower resolution that fits in the frame budget. When you stop, it sharpens, then smooths its edges with up to 12 samples per pixel.
- **Share it.** The address always holds the current view: copy the link and anyone opens the same place, with the same colours. Save the image as a PNG.

### Controls

| Input | Action |
| --- | --- |
| scroll, pinch | zoom around the pointer |
| drag | move, with inertia |
| double-click | dive ×4 (<kbd>Shift</kbd>: back ×4) |
| <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> | move |
| <kbd>+</kbd> <kbd>−</kbd> | zoom on the centre |
| <kbd>1</kbd>–<kbd>8</kbd> | famous places |
| <kbd>C</kbd> | flowing colours |
| <kbd>S</kbd> | save the image |
| <kbd>H</kbd> | hide the panels |
| <kbd>R</kbd> | back to the whole set |

## How it works

Every pixel is a complex number c. The explorer iterates z → z² + c from z = 0 and counts the steps before |z| grows past 256. Points that never escape belong to the set and stay dark. The others are coloured by a *continuous* count, n − log₂(log₂|z|²) + 4, which removes the bands of a plain count.

Graphics cards compute in 32-bit floats, which blur the image past a magnification of about 10⁴. Below that, the explorer uses **perturbation theory**:

1. One *reference orbit* Zₙ is computed on the CPU, in double precision, at the centre of the view.
2. Each pixel only follows its small offset from it, `dz ← 2·Z·dz + dz² + dc`, which 32-bit floats hold without trouble.
3. **Rebasing:** when a pixel's orbit comes closer to zero than its offset, or the reference runs out, the pixel restarts against the beginning of the same orbit. One reference then serves the whole image, without the glitches of the plain method.

The tests check the CPU version of both methods against an exact 400-bit computation: the perturbation is as accurate as plain double precision, and the shaders follow the same code line for line.

**Depth.** This version reaches a magnification of about 10¹², the limit of a double-precision reference. An arbitrary-precision reference orbit, with deltas that carry their own exponent, comes next, to reach 10¹⁸ and beyond.

**Speed.** On an integrated AMD Radeon (Ryzen 7 5825U), measured in Chrome: no frame took longer than 33 ms during flights to 10⁵ and to 10⁹, out of 542 frames. The renderer learns what one iteration costs on your GPU and sizes every frame to fit the screen refresh.

```
src/math/mandelbrot.ts   iteration, reference orbit, perturbation with rebasing (CPU, tested)
src/math/view.ts         view, zoom around a point, easing in log space
src/render/shaders.ts    the same iteration in GLSL, colouring, display
src/render/renderer.ts   progressive rendering, frame budget, supersampling
src/color/palettes.ts    palettes, Turbo from OpenCV
src/main.ts              navigation, panel, HUD, shared links
legacy/mandelbrot.py     the original 2023 script
```

## Development

```bash
npm install
npm run dev      # http://localhost:5191
npm test
npm run build    # static site in dist/
```

The site runs locally. `.github/workflows/ci.yml` runs the tests and the build on every push.

## Roadmap

- [x] **Phase 1.** Real-time explorer: smooth navigation, perturbation to 10¹², palettes, places, shared links, image export.
- [ ] **Phase 2.** Deep zoom: arbitrary-precision reference, exponent-carrying deltas, bilinear approximation, the 2023 dive to 10¹⁸ and beyond.
- [ ] **Phase 3.** Atlas: periods of the bulbs, live orbits, Julia sets under the pointer, external rays, π in seahorse valley.
- [ ] **Phase 4.** Odyssey: an interactive story in eight chapters, driven by the live explorer.
- [ ] **Phase 5.** Senses: orbits as sound, an endless automatic dive, video export.
- [ ] **Phase 6.** Buddhabrot, 3D relief, other fractals.

## Credits

- The Turbo colormap is by Google (Apache-2.0), read from OpenCV's `COLORMAP_TURBO`.
- Perturbation for deep zoom was introduced by K. I. Martin; rebasing comes from the Fractal Forums community. The continuous count follows Inigo Quilez's article on smooth iteration.
- The original 2023 script, kept in [`legacy/`](legacy/), rendered this zoom one image at a time with 80-bit arithmetic.
