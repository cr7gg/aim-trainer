# Aim Trainer

A free, open-source aim trainer that runs entirely in your browser. No install, no build step, no dependencies: just HTML, CSS and vanilla JavaScript.

## Modes

| Mode | What it trains |
| --- | --- |
| **Gridshot** | Speed and target switching. Three targets are always on screen. |
| **Flick** | Snap movements. One target at a time that disappears quickly. |
| **Microshot** | Precision. Tiny targets. |
| **Tracking** | Smooth tracking. Keep your crosshair on a moving target. |

Each run shows score, accuracy, hits and average reaction time. High scores are saved per mode and duration in your browser (`localStorage`).

## Run it

Open `index.html` in any modern browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Controls

- **Mouse / touch**: click or tap targets
- **Esc**: back to the menu
- **R**: restart the current mode

Settings (duration, target size, sound) are on the menu screen.

## Deploy with GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. Your trainer will be live at `https://<your-username>.github.io/aim-trainer/`.

## Project structure

```
index.html      markup for the menu, game screen and results
css/style.css   styling
js/game.js      game loop, modes, rendering, input, high scores
```

## Add a game mode

Modes live in the `MODES` object at the top of `js/game.js`:

```js
mymode: {
  name: 'My Mode',
  desc: 'Shown on the menu card.',
  type: 'click',      // 'click' or 'track'
  count: 4,           // targets on screen (click modes)
  radius: 24,         // base radius in px (scaled by the size setting)
  lifetime: 1200,     // optional: ms before a target expires (counts as a miss)
},
```

It appears on the menu automatically.

## Ideas for contributions

- Pointer-lock 3D / first-person modes
- Custom crosshair settings
- Score history and charts
- More modes (strafing targets, burst targets, reaction-only)
- Mobile-friendly layout polish

Pull requests are welcome. Keep it dependency-free if you can.

## License

MIT, see [LICENSE](LICENSE).
