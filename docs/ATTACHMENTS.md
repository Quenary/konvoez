# Message attachments

Messages can include files. Attachment bytes and the original file name are stored as-is.

## Limits

Admin settings (environment variables override the database):

- `ATTACHMENTS_ENABLED` — default on.
- `ATTACHMENTS_MAX_FILE_SIZE` — default 50 MiB (`52428800`). Allowed range is 1 MiB to 1 GiB.
- `ATTACHMENTS_MAX_FILES_PER_MESSAGE` — default 10, maximum 10.
- `ATTACHMENTS_STRIP_IMAGE_METADATA` — default off.

Every setting applies only to new uploads and new messages. Turning stripping on does not rewrite files that are already stored.

With stripping off, a download of a JPEG is byte-for-byte the upload, including EXIF and GPS. Thumbnails never contain metadata. With stripping on, new JPEG, WebP, AVIF and PNG uploads are rotated and saved without metadata. GIF and animated images are not rewritten. If stripping fails, the original bytes are stored as an image and a warning is logged, so metadata may remain. If an image thumbnail cannot be built, the upload is stored as a generic file.

A user can have at most 30 pending (not yet attached) uploads. The cap is checked before the body is accepted and again before the row is inserted. Overlapping uploads can still pass both checks; that excess is temporary. Unclaimed pending uploads are deleted after 24 hours, and the same sweep runs every hour.

## Inline types

Shown in the message when the sniffed type matches:

- Images: JPEG, PNG, GIF, WebP, AVIF.
- Video: MP4, WebM, QuickTime (`.mov`).
- Audio: MP3, Ogg, WAV, MP4/M4A, AAC, FLAC.

Everything else, including SVG, HTML, PDF, HEIC and HEIF, is a download-only file. The server does not convert HEIC.

iPhone Photo Library picks arrive as JPEG or H.264 in a `.mov` container. A HEIC or HEVC file chosen from the Files app, or dropped from a desktop, is stored as uploaded. HEVC `.mov` plays only in browsers that decode it; others get a download.

## Video posters

The browser builds a poster when the file is chosen and sends it with the upload. The same `POST /api/v1/attachments` accepts multipart parts in this order: `videoWidth`, `videoHeight`, `videoDuration` (seconds), `poster`, `file`. Hints that are missing or out of range become null. A bad poster is dropped and the upload continues. A poster on a non-video is ignored.

The server still sniffs the type. Poster choice:

1. If `ffmpeg` returns a frame, that WebP and the duration parsed from `Duration: HH:MM:SS.xx` win. `N/A` or a value over 24 hours is stored as null. The client poster is deleted and not decoded.
2. If `ffmpeg` is missing, hits the deadline, or fails without a bad-input marker, the client poster is re-encoded and the client duration is stored. Width and height are the re-encoded poster size. The upload stays a video.
3. If neither source produced a poster, the upload stays a video. Width and height come from the hints when both are valid, fitted inside 1024. Duration is the client hint or null.
4. A non-zero `ffmpeg` exit whose stderr matches a bad-input marker (invalid data, a missing moov atom, no streams, or no codec parameters) is undecodable. A valid client poster keeps the upload as a video. Without that poster the upload is stored as a generic file and keeps the sniffed type. Other `ffmpeg` failures keep the upload as a video.

The client poster is untrusted: at most 2 MiB, sniffed as WebP, JPEG, or PNG, decoded with a 4096² pixel cap, first frame only, no rotation, then saved as WebP quality 80 inside 1024×1024 with metadata removed. A full disk while writing a poster fails the upload with 507.

Duration is `durationMs` on the attachment. The client draws it as text on the tile (`m:ss`, or `h:mm:ss` from one hour). A null duration hides the badge.

`ffmpeg` is not in the runtime image. The process uses `FFMPEG_PATH` when that variable is non-empty, otherwise `ffmpeg` on `PATH`. A bad `FFMPEG_PATH` is not replaced with `PATH`. Mount a static build that matches the container architecture and Debian 12 glibc, for example:

```yaml
services:
  backend:
    volumes:
      - /opt/ffmpeg/ffmpeg:/usr/local/bin/ffmpeg:ro
    environment:
      FFMPEG_PATH: /usr/local/bin/ffmpeg
```

The operator owns that binary, its updates, and its license. The grab still has a 15 second deadline, on a limit separate from image processing. If the grab at 1 second times out, the first frame is not tried afterwards. A grab that fails immediately still falls back to the first frame. `ffmpeg` is started with one thread, `-loglevel info` so the duration line is present, the first video stream (`0:V:0`), the sniffed container format (`mp4`, `webm`, or `mov`), the `file` protocol only, and an environment that does not include server secrets. The original video bytes are stored unchanged and are not transcoded. The poster is stored as `message-attachments/<uuid>-thumb`.

## Storage

Logical keys look like `message-attachments/<uuid>` and `message-attachments/<uuid>-thumb`. The original name is never part of the key.

`OBJECT_STORAGE_PREFIX` (optional) names the physical container `<prefix>-<logical-bucket>` for both local directories and S3 buckets. The database still stores the logical key. Setting or changing the prefix points the app at new, empty containers. Existing avatars and attachments are not moved; re-upload avatars.

`UPLOAD_TMP_DIR` defaults to `<LOCAL_OBJECT_STORAGE_PATH>/.tmp`, or `.tmp-<prefix>` when a prefix is set.

## Access

Reading an attachment uses the same rules as reading the message. Room messages are readable by any logged-in user. Direct messages are readable only by the sender and the recipient. Pending uploads are readable only by the uploader. Every denial is 404.

Deleting a message follows `canDeleteTextRoomMessage`. The file is removed by the cleanup job after the message row is gone.

## HTTP

- `POST /api/v1/attachments` uploads one file and returns a pending attachment.
- `DELETE /api/v1/attachments/:id` cancels the caller's own pending upload.
- `GET /api/v1/attachments/:id/content` and `.../thumbnail` stream the file. `Range` is supported. `?download=1` forces a download.

Create a message with `attachmentIds` and an optional `clientId` (UUID). Repeating the same `clientId` for the same sender and the same chat returns the original message and does not send another push. A different chat with the same `clientId` is a conflict.

## Reverse proxy

The bundled nginx config allows up to 1100 MiB on `POST /api/v1/attachments`, with `proxy_request_buffering off` and 600s timeouts. Nest enforces the admin limit. The Node request timeout for the API process is 15 minutes.

The 50 MiB default fits Cloudflare Free/Pro (100 MB request-body cap) and typical proxies. If an admin raises the limit, every proxy in front must allow it. Behind Cloudflare Free/Pro, stay at or below 95 MiB.

## Client

Choosing files does not upload them. For a video, the browser starts a poster immediately and shows it in the composer. Upload starts when the message is sent and waits for that poster attempt to finish. Retry sends the same poster. Reloading the page drops unsent messages; uploaded files that were never attached expire after 24 hours.
