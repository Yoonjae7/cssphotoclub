# CSS Photo Club

A four-cut photo booth for the Computer Science Society fair. Visitors take eight photos, pick four, choose a strip design, and scan a QR to download a PNG photo, an MP4 moving strip, or both.

## Vercel setup

Import this repository into Vercel with the repository root as the Root Directory. The checked-in `vercel.json` uses static hosting for the browser interface and deploys `api/share.js` for temporary phone downloads. No server needs to run on the booth laptop.

1. In the Vercel project, open **Storage** and create **Upstash Redis**. Connect it to the project for **Production** (and Preview if wanted).
2. Check **Settings → Environment Variables** for `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The integration normally supplies these. `KV_REST_API_URL` and `KV_REST_API_TOKEN` are also supported. Keep these credentials in Vercel; they are never sent to visitors.
3. Redeploy after adding the storage connection or changing environment variables.
4. Open the deployed HTTPS site in a current Chrome or Edge browser and try a demo round. The final save screen prepares its QR automatically. A phone can use Wi-Fi or mobile data.

The app needs internet access to share files. Vercel Blob, `BOOTH_UPLOAD_KEY`, and `BOOTH_SITE_ORIGIN` are no longer used. If a previous version uploaded files to Vercel Blob, remove those old files from that store separately.

## Booth password

Opening or reloading the booth page requires its operator password. The server checks a salted scrypt verifier, rate limits password attempts, and authorizes photo/video uploads with a random access token. The browser keeps that token in memory only; it does not remember the password or unlock state across page loads. An open tab can stay unlocked for up to twelve hours. QR download pages stay accessible to visitors without the booth password, with the existing five-minute expiry.

This uses the connected Redis database and needs no additional environment variables. Only the password verifier is in server code; it is excluded from the published static assets.

## Permanent copies on the booth computer

Before the event, expand **Booth archive** at the top of the site, press **Choose / enable archive folder**, select **Downloads**, and allow write access. The browser creates:

```text
Downloads/
  cssbooth/
    photo/   # Finished four-photo PNG strips
    video/   # Silent MP4 strips with four camera clips playing together
```

You can also select an existing `cssbooth` folder. The app remembers the folder handle, but the browser may ask you to enable permission again after restarting. Only the folder handle is stored in IndexedDB; photos are never saved in browser storage. Selecting another parent folder puts `cssbooth` inside that folder.

Once permission is enabled, PNGs and MP4s save automatically as they are created. Existing files in an older `picture` folder stay there. Permanent local copies do not expire. Photo/video downloads and QR sharing work even if the operator has not enabled the local archive. A website cannot silently choose a filesystem folder without browser permission.

## Visitor flow

1. Open the camera and allow webcam access, or use the illustrated demo.
2. Take eight photos, with a five-second countdown and a pause between poses. A silent camera clip is recorded during each countdown; only the clean camera canvas is captured. **Take photo now** or Space snaps sooner.
3. Pick four favourites. Their selection order is the strip and video slot order. **Next: see my strip** opens the final save screen.
4. Choose Design 1, 2, or 3. The app makes a full-resolution 1000 × 3136 PNG and a silent five-second MP4 of the same complete strip. Each of the four slots plays the camera clip recorded during its shot countdown, all at the same time. The design, logos, date, borders and footer match the PNG. The MP4 preserves the exact strip aspect ratio at 750 × 2352 (500 × 1568 on devices that need a smaller encoder input). Quick-shutter clips are slowed to fit the same five-second timeline.
5. The QR appears when both uploads are complete. Scan it to open separate **Download photo (PNG)** and **Download video (MP4)** buttons. Both files also have download buttons on the booth screen.
6. **Next group** clears the active browser round. Changing photos or designs invalidates the active export and prepares a fresh QR. Links already shown keep their own five-minute expiry.

All four numbered steps are accessible without prerequisites; only exporting requires four selected photos. Leaving a countdown pauses it without erasing partial shots. Camera images are mirrored and fitted without cropping. Countdown, flash and other screen controls are not baked into photos. The transparent Nottingham and CSS logos and the phrase **We don't Code, We Build** appear on every strip.

## Five-minute sharing and privacy

The five-minute countdown starts when both files finish uploading and the QR is ready. Each temporary file chunk and the share record has the same Redis expiry. The download API also checks the expiry on every request. Redis automatically expires the temporary data even if the booth tab closes; no laptop server, browser timer or cron job is needed for cloud cleanup.

The share ID is a random, unguessable download capability. Anyone with the QR link can download until expiry. Upload permissions are separate and cannot alter a completed share. Upload sizes and creation rates are limited. Larger PNGs upload in small chunks so they fit Vercel's request limits. Files are served through the expiry-checking API with caching disabled; there are no permanent public media URLs.

Raw camera shots and their countdown clips stay in the browser's current-round memory. Only the selected strip and silent MP4 are sent to temporary storage. No microphone is used. At QR expiry, the active browser round is cleared. Files already downloaded to a phone or saved in the permanent local archive remain with their owners.

Existing `recordings/`, `photo-strips/`, `share-media/` and `.legacy-signing-backup/` files from older versions are not served or published. New versions do not write to these folders.

## Development and checks

Requires Node.js 18+ for checks and the optional local development preview. Browser libraries are pinned and bundled in `vendor/` with their licenses; no npm dependencies are required.

```sh
npm run check
npm test
npm run build
npm start
```

`npm start` opens a development preview at http://localhost:3000. For local sharing tests, export the Redis variables first; on Node.js 20+ you can also use `node --env-file=.env.local server.mjs`. Copy `.env.example` for the variable names and keep real credentials out of Git.

Production publishes only the allowlisted browser assets in `dist/` plus the Vercel sharing function. It excludes media, backups, server preview code and tests. The build refuses unexpected files in `dist/` to avoid accidentally publishing data.

Before the event, test the live webcam, both archive folders, and the QR on an actual phone. MP4 generation uses H.264 with Mediabunny/WebCodecs, and decodes the recorded camera clips with WebCodecs. No clips are replaced by still-photo slideshows. Current Chrome or Edge is required on the booth computer.
