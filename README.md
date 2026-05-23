# Chalkboard Presentation

A chalkboard-style presentation app that writes your text slowly on the board with a classroom feel.

Live demo:

https://furkanbayoglu-arch.github.io/chalkboard-presentation/

## Features

- Welcome screen with quick-start templates
- Slow chalk writing animation
- Multiple board themes: green, black, white
- Chalk color and font selection
- Mouse drawing layer on each slide
- Eraser and shape tools: rectangle, ellipse, arrow
- WebM video export for the full presentation
- Slide separation with `---`
- Inline formatting:
  - `[u]text[/u]` underline
  - `[c]text[/c]` circle
  - `[sari]`, `[mavi]`, `[pembe]`, `[yesil]` color tags

## Run locally

```bash
cd chalkboard-presentation
python3 -m http.server 8127
```

Open:

```text
http://127.0.0.1:8127
```
