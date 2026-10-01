# CSS Photo Club

A local Korean-style four-cut photo booth for the Computer Science Society fair.

## Run

Requires Node.js 18+ and a current Chrome / Edge browser. The local booth needs no npm packages, FFmpeg or internet connection for capture and downloads.

```powershell
node server.mjs
```

Open http://localhost:3000.

## Host on Vercel

Import this repository into Vercel with the repository root as the Root Directory. The checked-in `vercel.json` selects **Other** (static hosting), runs `node build-static.mjs` and publishes only `dist/`. It overrides framework/build/output defaults; do not configure `app.js` as a Node function or add catch-all function rewrites. Browser code uses `document` and must run in the browser, not a Vercel Function.

The static build includes only HTML, CSS, browser modules, logos and bundled fonts. Server code, tests, recordings, saved photos and backups are never published. Build locally with `node build-static.mjs`; `node server.mjs` runs the local booth with its laptop archive. Vercel also deploys `api/share.js` as a Function for phone sharing.

On the hosted HTTPS site, webcam capture, photo selection, preview, PNG generation, download and printing run on the visitor's device. Nothing is uploaded until **Create phone QR** is pressed. That action uploads a JPEG version of the strip and a short video of the four selected still photos to a connected public Vercel Blob store. The local PNG download stays full resolution.

### Set up phone sharing on Vercel

1. In the Vercel project, open **Storage**, create a **public Blob** store, and connect it to Production (and Preview if used). Vercel supplies `BLOB_READ_WRITE_TOKEN` to the project automatically.
2. Add a secret environment variable named `BOOTH_UPLOAD_KEY` to the project. Use a long random value, for example one generated with `openssl rand -hex 24`. Keep it off the public site and out of Git.
3. Redeploy. On the booth computer, enter that key in the save screen once per browser tab session. It authorizes QR uploads; the phone never needs the key.
4. Select four photos, open **Save your strip**, and press **Create phone QR**. When the status says both files are ready, scan it with a phone. The phone page has separate photo and video download buttons.

The generated video is a silent, roughly seven-second slideshow of the four selected photos. A current Chrome or Edge browser is recommended for video creation. The share link remains available while its Blob files remain in the store. Anyone with the unguessable QR link can open them; delete old files from the Blob store when they are no longer needed. Blob storage and transfer may incur Vercel usage charges.

For the local booth, run `node server.mjs` and connect the phone and booth laptop to the same Wi-Fi. The server listens on the local network and generates a LAN QR URL automatically. If the laptop has multiple network interfaces, set `BOOTH_PUBLIC_URL` to the phone-reachable base URL. Local shared files are saved in `share-media/`.

## The booth

1. Open the camera and allow webcam access, or try the illustrated demo.
2. Start a round of eight photos. Each shot has a three-second countdown, with a short pause to change pose. Click **Take photo now** or press Space to snap sooner.
3. Pick four favourites in the full-width photo grid. Tap again to deselect. Picking order is strip order; selected cards show frame numbers. **Next: see my strip** opens the save screen directly.
4. Change designs on the save screen, using previous / next arrows or Design 1–3. One large preview shows the current design with your selected photos. There is no separate frame-selection page and no named styles.
5. **Save & download PNG** generates the current design, archives it locally and downloads it. **Create phone QR** uploads the selected strip and slideshow video for phone download. Printing uses the same PNG. Changing photos or design clears the active export so the next save cannot use an outdated strip; existing saved files are untouched.

All four numbered step buttons are always available: **Take 8 photos**, **Pick your 4**, **Your strip**, **Save your strip**. Steps 3 and 4 share the preview workspace. You can jump directly from 1 to 3 or 4 without taking or choosing photos; empty slots show placeholders. Only exporting requires four selected photos. Leaving an active countdown pauses the round without erasing partial shots; return to step 1 and press **Continue my photos**.

The strip is a 1000 × 3136 PNG with four landscape photos and the original transparent University of Nottingham logo on the left and CSS logo on the right. Three ready-made designs, with no visitor fields or fiddly editing controls:

- **Design 1** — cream graph paper, pastel tape, pixel hearts and a lavender footer.
- **Design 2** — dark retro-computer windows, mint cursors and a terminal-style footer.
- **Design 3** — mint paper, pink stars, checkerboard edges and a pink footer.

All frames carry the society's signature phrase: **We don't Code, We Build**. Artwork stays outside the photos. Changing designs never crops or filters the chosen photos. Next group clears the active round and resets to Design 1.

Camera images are mirrored and fitted without cropping or magnification. If the camera has a different aspect ratio, letterboxing preserves the whole image. Hardware zoom is set to its minimum where supported. Countdown, flash and screen controls are not baked into photos.

## Privacy and storage

- No microphone. Camera capture and strip generation stay in the browser; pressing **Create phone QR** uploads only the chosen strip and its silent video.
- Raw shots exist only in memory for the current round. No browser photo history is stored.
- Finished strips are saved in `photo-strips/` when downloaded or printed on the local server; previewing designs does not create files. Phone sharing stores a separate copy in `share-media/` locally or Vercel Blob when hosted. Downloads still work if the local archive is unavailable.
- Retaking / next group clears the active shots, not saved strips. Cancel discards the active round. Hiding the tab pauses capture and keeps the shots.
- Existing `recordings/` and previous autograph browser data are untouched. The retired signing source has a recoverable copy in `.legacy-signing-backup/`, not served by the app. Old binary caches are not loaded.
- Printing opens the browser print dialog; choose your printer / paper size there.

Shortcuts: **D** opens the demo, **Space** starts / snaps, **Escape** cancels a round. On the photo screen, **1–8** selects photos and **Enter** opens the save preview. On the shared strip screen, **1–3** or **left / right arrows** changes design. **Enter** moves from step 3 to 4, then saves / downloads when four photos are selected. Focused buttons and links keep their normal Space / Enter behaviour.

## Check

```powershell
node --test photo-session.test.mjs photo-strip.test.mjs photo-storage.test.mjs static-deployment.test.mjs
```

The demo exercises the eight-shot / choose-four / PNG flow without a webcam. Test the live webcam, printer and phone QR on the booth computer before the fair. Hosted Blob upload needs the Vercel store and key above.
