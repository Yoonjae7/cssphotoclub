# CSS Photo Club

A local Korean-style four-cut photo booth for the Computer Science Society fair.

## Run

Requires Node.js 18+ and a current Chrome / Edge browser. No npm packages, hand tracker, FFmpeg or internet connection is needed.

```powershell
node server.mjs
```

Open http://localhost:3000.

## The booth

1. Open the camera and allow webcam access, or try the illustrated demo.
2. Start a round of eight photos. Each shot has a three-second countdown, with a short pause to change pose. Click **Take photo now** or press Space to snap sooner.
3. Pick four favourites in the full-width photo grid. Tap again to deselect. Picking order is strip order; selected cards show frame numbers. **Next: see my strip** opens the save screen directly.
4. Change designs on the save screen, using previous / next arrows or Design 1–3. One large preview shows the current design with your selected photos. There is no separate frame-selection page and no named styles.
5. **Save & download PNG** generates the current design, archives it locally and downloads it. Printing uses the same PNG. Changing photos or design clears the active export so the next save cannot use an outdated strip; existing saved files are untouched.

All four numbered step buttons are always available: **Take 8 photos**, **Pick your 4**, **Your strip**, **Save your strip**. Steps 3 and 4 share the preview workspace. You can jump directly from 1 to 3 or 4 without taking or choosing photos; empty slots show placeholders. Only exporting requires four selected photos. Leaving an active countdown pauses the round without erasing partial shots; return to step 1 and press **Continue my photos**.

The strip is a 1000 × 3136 PNG with four landscape photos and the original transparent University of Nottingham logo on the left and CSS logo on the right. Three ready-made designs, with no visitor fields or fiddly editing controls:

- **Design 1** — cream graph paper, pastel tape, pixel hearts and a lavender footer.
- **Design 2** — dark retro-computer windows, mint cursors and a terminal-style footer.
- **Design 3** — mint paper, pink stars, checkerboard edges and a pink footer.

All frames carry the society's signature phrase: **We don't Code, We Build**. Artwork stays outside the photos. Changing designs never crops or filters the chosen photos. Next group clears the active round and resets to Design 1.

Camera images are mirrored and fitted without cropping or magnification. If the camera has a different aspect ratio, letterboxing preserves the whole image. Hardware zoom is set to its minimum where supported. Countdown, flash and screen controls are not baked into photos.

## Privacy and storage

- No microphone or cloud uploads. Camera capture and strip generation stay on the laptop.
- Raw shots exist only in memory for the current round. No browser photo history is stored.
- Finished strips are saved in `photo-strips/` when downloaded or printed; previewing designs does not create files. Check the confirmation on the save screen. Downloads still work if the local archive is unavailable.
- Retaking / next group clears the active shots, not saved strips. Cancel discards the active round. Hiding the tab pauses capture and keeps the shots.
- Existing `recordings/` and previous autograph browser data are untouched. The retired signing source has a recoverable copy in `.legacy-signing-backup/`, not served by the app. Old binary caches are not loaded.
- Printing opens the browser print dialog; choose your printer / paper size there.

Shortcuts: **D** opens the demo, **Space** starts / snaps, **Escape** cancels a round. On the photo screen, **1–8** selects photos and **Enter** opens the save preview. On the shared strip screen, **1–3** or **left / right arrows** changes design. **Enter** moves from step 3 to 4, then saves / downloads when four photos are selected. Focused buttons and links keep their normal Space / Enter behaviour.

## Check

```powershell
node --test photo-session.test.mjs photo-strip.test.mjs photo-storage.test.mjs
```

The demo exercises the full eight-shot / choose-four / PNG archive flow without a webcam. Test the live webcam and printer on the booth laptop before the fair.
