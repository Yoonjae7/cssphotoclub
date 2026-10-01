# CSS Photo Club

A Korean-style four-cut photo booth for the Computer Science Society fair. The capture page can run on Vercel or on the booth laptop. A small server on the booth laptop saves the finished PNG and slideshow video and serves the five-minute phone QR.

## Run

Requires Node.js 18+ and a current Chrome or Edge browser. The local booth needs no npm packages or FFmpeg.

```powershell
node server.mjs
```

Open http://localhost:3000 on the booth laptop. Connect the laptop and phone to the same Wi-Fi. Allow Node through the laptop firewall if prompted. The QR points to the laptop's LAN address; it does not work for a phone outside that network.

## Host on Vercel

Import this repository into Vercel with the repository root as the Root Directory. The checked-in `vercel.json` selects **Other** (static hosting), runs `node build-static.mjs` and publishes only `dist/`. It overrides framework/build/output defaults; do not configure `app.js` as a Node function or add catch-all function rewrites. Browser code uses `document` and must run in the browser, not a Vercel Function.

The static build includes only HTML, CSS, browser modules, logos and bundled fonts. Server code, tests, recordings, saved photos and backups are never published. Build locally with `node build-static.mjs`.

On the hosted HTTPS site, webcam capture, photo selection, preview, PNG generation and printing run in the booth browser. The finished PNG is sent to the booth laptop when generated; **Create phone QR** sends the PNG and a silent slideshow video of the four selected stills to the laptop. The Vercel deployment stores no photos and needs no Blob store or sharing key.

### Connect the hosted site to the booth laptop

1. Keep this repository and Node.js on the booth laptop. Start the local server with the exact Vercel site origin (no trailing path):

   ```sh
   BOOTH_SITE_ORIGIN=https://YOUR-SITE.vercel.app node server.mjs
   ```

   In Windows PowerShell, use `$env:BOOTH_SITE_ORIGIN='https://YOUR-SITE.vercel.app'; node server.mjs` instead.
2. Open that Vercel site in Chrome or Edge on the **same laptop**. On the save screen, leave **Booth laptop server** at `http://127.0.0.1:3000` and click **Check connection**. Allow the browser's local network access prompt. If the server uses another port, change this address to match.
3. Connect a phone to the same Wi-Fi as the laptop. Select four photos, open **Save your strip**, and press **Create phone QR**. Scan the QR and use the separate photo and video download buttons.

The video is a silent, roughly seven-second slideshow. The QR starts its five-minute clock when the photo is saved. After five minutes the local server rejects the link and removes its temporary photo/video copies; it also removes expired copies after a restart. Keep the server running for timely deletion. Anyone with the unguessable QR link can download during those five minutes. Files a visitor has already downloaded to a phone cannot be recalled.

The laptop keeps the finished PNG in `~/Downloads/cssbooth/photo/` and the slideshow in `~/Downloads/cssbooth/video/`; these **do not expire**. On Windows, `~` means the current user's profile directory. If the laptop has multiple network interfaces, set `BOOTH_PUBLIC_URL=http://LAPTOP-LAN-IP:3000` before starting the server. `BOOTH_ARCHIVE_DIR` can override the archive's `cssbooth` folder. Temporary QR files live in `share-media/` and are removed on expiry. Existing files previously uploaded to Vercel Blob under the old version require manual removal from that store.

## The booth

1. Open the camera and allow webcam access, or try the illustrated demo.
2. Start a round of eight photos. Each shot has a three-second countdown, with a short pause to change pose. Click **Take photo now** or press Space to snap sooner.
3. Pick four favourites in the full-width photo grid. Tap again to deselect. Picking order is strip order; selected cards show frame numbers. **Next: see my strip** opens the save screen directly.
4. Change designs on the save screen, using previous / next arrows or Design 1–3. One large preview shows the current design with your selected photos. There is no separate frame-selection page and no named styles.
5. **Save & download PNG** generates the current design, saves it on the booth laptop and downloads it in the browser. **Create phone QR** sends the selected strip and slideshow video to the laptop for phone download. Printing uses the same PNG. Changing photos or design clears the active export so the next save cannot use an outdated strip; existing saved files are untouched.

All four numbered step buttons are always available: **Take 8 photos**, **Pick your 4**, **Your strip**, **Save your strip**. Steps 3 and 4 share the preview workspace. You can jump directly from 1 to 3 or 4 without taking or choosing photos; empty slots show placeholders. Only exporting requires four selected photos. Leaving an active countdown pauses the round without erasing partial shots; return to step 1 and press **Continue my photos**.

The strip is a 1000 × 3136 PNG with four landscape photos and the original transparent University of Nottingham logo on the left and CSS logo on the right. Three ready-made designs, with no visitor fields or fiddly editing controls:

- **Design 1** — cream graph paper, pastel tape, pixel hearts and a lavender footer.
- **Design 2** — dark retro-computer windows, mint cursors and a terminal-style footer.
- **Design 3** — mint paper, pink stars, checkerboard edges and a pink footer.

All frames carry the society's signature phrase: **We don't Code, We Build**. Artwork stays outside the photos. Changing designs never crops or filters the chosen photos. Next group clears the active round and resets to Design 1.

Camera images are mirrored and fitted without cropping or magnification. If the camera has a different aspect ratio, letterboxing preserves the whole image. Hardware zoom is set to its minimum where supported. Countdown, flash and screen controls are not baked into photos.

## Privacy and storage

- No microphone. Camera capture and strip generation stay in the browser. The finished strip and silent video go only to the booth laptop's local server.
- Raw shots exist only in memory for the current round. No browser photo history is stored.
- Finished strips are saved in `~/Downloads/cssbooth/photo/` when generated, and slideshow videos in `~/Downloads/cssbooth/video/` when shared. Phone sharing stores temporary copies in `share-media/` for five minutes. A browser PNG download still works if the local server is unavailable, but it will not be saved in `cssbooth` until the server is running.
- Retaking / next group clears the active shots, not saved strips. Cancel discards the active round. Hiding the tab pauses capture and keeps the shots.
- Existing `recordings/` and previous autograph browser data are untouched. The retired signing source has a recoverable copy in `.legacy-signing-backup/`, not served by the app. Old binary caches are not loaded.
- Printing opens the browser print dialog; choose your printer / paper size there.

Shortcuts: **D** opens the demo, **Space** starts / snaps, **Escape** cancels a round. On the photo screen, **1–8** selects photos and **Enter** opens the save preview. On the shared strip screen, **1–3** or **left / right arrows** changes design. **Enter** moves from step 3 to 4, then saves / downloads when four photos are selected. Focused buttons and links keep their normal Space / Enter behaviour.

## Check

```powershell
npm run check
npm test
npm run build
```

The demo exercises the eight-shot / choose-four / PNG flow without a webcam. Test the live webcam, printer, local archive and phone QR on the booth computer before the fair.
