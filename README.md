# CSS Photo Club

A four-cut photo booth for the Computer Science Society fair. Visitors take eight photos, pick four, choose a strip design, and download a PNG photo, an MP4 moving strip, or both.

## Vercel setup

Import this repository into Vercel with the repository root as the Root Directory. The checked-in `vercel.json` publishes the browser interface as a static site. There is no backend: no database, storage, environment variables or API functions are needed, and nothing runs on the booth laptop.

Open the deployed HTTPS site in a current Chrome or Edge browser and try a demo round. Photos and videos stay in the browser and are never uploaded.

## Permanent copies on the booth computer

Before the event, expand **Booth archive** at the top of the site, press **Choose / enable archive folder**, select **Downloads**, and allow write access. The browser creates:

```text
Downloads/
  cssbooth/
    photo/   # Finished four-photo PNG strips
    video/   # Silent MP4 strips with four camera clips playing together
```

You can also select an existing `cssbooth` folder. The app remembers the folder handle, but the browser may ask you to enable permission again after restarting. Only the folder handle is stored in IndexedDB; photos are never saved in browser storage. Selecting another parent folder puts `cssbooth` inside that folder.

Once permission is enabled, PNGs and MP4s save automatically as they are created. Existing files in an older `picture` folder stay there. Permanent local copies do not expire. Photo and video downloads work even if the operator has not enabled the local archive. A website cannot silently choose a filesystem folder without browser permission.

## Visitor flow

1. Open the camera and allow webcam access, or use the illustrated demo.
2. Take eight photos, with a five-second countdown and a pause between poses. A silent camera clip is recorded during each countdown; only the clean camera canvas is captured. **Take photo now** or Space snaps sooner.
3. Pick four favourites. Their selection order is the strip and video slot order. **Next: see my strip** opens the final save screen.
4. Choose Design 1, 2, or 3. The app makes a full-resolution 1000 × 3136 PNG and a silent five-second MP4 of the same complete strip. Each of the four slots plays the camera clip recorded during its shot countdown, all at the same time. The design, logos, date, borders and footer match the PNG. The MP4 preserves the exact strip aspect ratio at 750 × 2352 (500 × 1568 on devices that need a smaller encoder input). Quick-shutter clips are slowed to fit the same five-second timeline.
5. Use **Download photo (PNG)** and **Download video (MP4)** on the booth screen to save either file or both.
6. **Next group** clears the active browser round. Changing photos or designs invalidates the active export.

All four numbered steps are accessible without prerequisites; only exporting requires four selected photos. Leaving a countdown pauses it without erasing partial shots. Camera images are mirrored and fitted without cropping. Countdown, flash and other screen controls are not baked into photos. The transparent Nottingham and CSS logos and the phrase **We don't Code, We Build** appear on every strip.

## Privacy

Raw camera shots, their countdown clips and the finished strip stay in the browser's current-round memory and are never sent anywhere. No microphone is used. Files already downloaded or saved in the permanent local archive remain with their owners.

Existing `recordings/`, `photo-strips/`, `share-media/` and `.legacy-signing-backup/` files from older versions are not served or published. New versions do not write to these folders.

## Development and checks

Requires Node.js 18+ for checks and the optional local development preview. Browser libraries are pinned and bundled in `vendor/` with their licenses; no npm dependencies are required.

```sh
npm run check
npm test
npm run build
npm start
```

`npm start` opens a development preview at http://localhost:3000.

Production publishes only the allowlisted browser assets in `dist/`. It excludes media, backups, server preview code and tests. The build refuses unexpected files in `dist/` to avoid accidentally publishing data.

Before the event, test the live webcam and both archive folders. MP4 generation uses H.264 with Mediabunny/WebCodecs, and decodes the recorded camera clips with WebCodecs. No clips are replaced by still-photo slideshows. Current Chrome or Edge is required on the booth computer.
