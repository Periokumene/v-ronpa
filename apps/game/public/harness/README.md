# Harness Assets

Temporary first-slice assets live here so subsystem worktrees can validate
presentation behavior without entering the production asset pipeline.

Expected generated files:

- `models/academy-hall.gltf`
- `models/classroom.gltf`
- `models/props-case-file.gltf`
- `models/props-door.gltf`
- `portraits/felix-neutral.png`
- `portraits/felix-concerned.png`
- `portraits/mira-neutral.png`
- `thumbnails/item-notebook.png`
- `thumbnails/evidence-keycard.png`
- `media/bgm/bgm-validation-main.ogg`
- `media/bgm/bgm-validation-alt.ogg`
- `media/bgm/bgm-validation-layer.ogg`
- `media/bgm/bgm-validation-extra.ogg`
- `media/sfx/rain-inside-car-loop.ogg`
- `media/sfx/shock-fadeout.ogg`
- `media/sfx/knock-door.ogg`
- `media/video/movie-validation-intro.mp4`

Media command validation ids:

| Asset id | Public URI | Intended validation use |
|---|---|---|
| `bgm:validation-main` | `/harness/media/bgm/bgm-validation-main.ogg` | Default BGM group playback |
| `bgm:validation-alt` | `/harness/media/bgm/bgm-validation-alt.ogg` | Same-group BGM replacement |
| `bgm:validation-layer` | `/harness/media/bgm/bgm-validation-layer.ogg` | Second BGM group coexistence |
| `bgm:validation-extra` | `/harness/media/bgm/bgm-validation-extra.ogg` | Reserved BGM resolver coverage |
| `sfx:rain-inside-car-loop` | `/harness/media/sfx/rain-inside-car-loop.ogg` | Looping SFX tracking |
| `sfx:shock-fadeout` | `/harness/media/sfx/shock-fadeout.ogg` | One-shot or `sfxFast` |
| `sfx:knock-door` | `/harness/media/sfx/knock-door.ogg` | One-shot SFX |
| `video:validation-intro` | `/harness/media/video/movie-validation-intro.mp4` | Blocking movie playback |

These files are harness fixtures. They may be removed after the vertical-slice
integration has been accepted or replaced by production assets.
