# Images and media delivery

Images are prepared in the browser, uploaded through `POST /api/uploads`, and stored in S3 under random keys. The database keeps `/uploads/<random>.<ext>` references. The legacy direct-upload ticket code is disabled; Cloudinary is not used by this path.

## Preparing new images (#44)

`apps/web/src/lib/images.ts` limits posts to 1600 px, avatars to a centred 512 px square, and wallpapers to 2560 px. Preferred transfer budgets are 450 KiB, 96 KiB and 700 KiB respectively. The encoder first tries WebP at quality .82, then .72 at the same resolution before reducing dimensions. The preferred budget is not a hard rejection limit; the final attempt can use the existing 2.5 MiB ceiling. Browsers without a WebP encoder use JPEG on white. WebP preserves transparent pixels. GIF bytes are preserved to retain animation.

Only originals below 96 KiB can skip encoding. This removes the old 600 KiB bypass for post photos. Existing stored files are not recompressed or migrated.

## Reusing existing downloads (#58)

`GET /uploads/:file` checks moderation before serving or validating an image. Proxy responses use `private, no-cache` and the S3 ETag. A browser can retain bytes but must revalidate them before reuse. Its `If-None-Match` is forwarded to S3: unchanged objects return 304 without a second download through the API. Moderated and missing files return a noncached 404, including when a browser sends an old validator.

## Optional direct image delivery

Direct image delivery is **off by default**. To prepare a controlled environment:

1. Set `S3_PUBLIC_ENDPOINT` to the S3-compatible endpoint reachable from browsers, with TLS and the same bucket/region/credentials as the internal endpoint. Do not point it at an internal Docker hostname. This endpoint also signs the existing audio and private-message downloads.
2. Check image/audio downloads from the target networks, including Russia without VPN. Check S3 audio range requests and the existing cross-origin font configuration if applicable. A fast result from a developer machine does not establish regional reachability.
3. Set `S3_DIRECT_IMAGES=true` in that environment. Deployment and configuration changes are separate owner actions.

The shared avatar and gallery image component requests `/uploads/<file>?direct=1`. After moderation checks, the API redirects to a signed S3 GET URL valid for 60 seconds with `Cache-Control: no-store` on both the redirect and storage response. No public bucket or new permanent URL is required. A previously issued URL can remain usable for up to 60 seconds after moderation. If signing fails the API streams the image itself. If the browser cannot load the direct image, it retries the plain `/uploads/<file>` proxy URL once. This fallback handles loading errors; it cannot guarantee a short wait for every network timeout.

With direct delivery disabled or no public endpoint configured, the same request uses the normal proxy. Fonts, wallpaper CSS backgrounds, and other image consumers outside the avatar/gallery component continue using the proxy. Images in private messages retain their separate authenticated signing route and 120-second lifetime. Music playback/download already uses signed S3 URLs for 600 seconds; this change does not introduce an audio proxy or transcode music.

Real storage delivery, regional access and production throughput remain unverified locally. No production configuration was changed.
