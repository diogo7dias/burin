# burin

Landscape engravings in the manner of Gustave Doré, generated from a single seed and drawn line by line in the browser.

**Live:** https://diogo7dias.github.io/burin/

Each seed picks a scene (lake and castle, dark wood, gorge, ruined abbey, stormy headland), sometimes by moonlight, sometimes as a tall plate. The plate is sketched in pencil, then hatched in three passes with a burin, detailed, and pulled as a print. The seed lives in the URL, so any plate can be shared.

Keys: `n` new plate, `space` finish, `s` save png.

## Run locally

Static files, no build. Serve the folder with any web server:

```sh
python3 -m http.server
node test.js   # determinism and variety checks
```

## Credits

Hatching streamlines by [@anvaka/streamlines](https://github.com/anvaka/streamlines). Style after the engravings of Gustave Doré.

MIT licence.
