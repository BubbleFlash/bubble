# Images and media delivery

Images are prepared in the browser, uploaded through `POST /api/uploads`, and stored in S3 under random keys. The database keeps `/uploads/<random>.<ext>` references. The legacy direct-upload ticket code is disabled; Cloudinary is not used by this path.

API проверяет сигнатуру файла и принимает изображение до 10 МиБ. В репозиторных конфигурациях Nginx лимит 11 МиБ оставляет запас для multipart. Внешний прокси имеет собственную конфигурацию.

## Preparing new images (#44)

`apps/web/src/lib/images.ts` limits posts to 1600 px, avatars to a centred 512 px square, and wallpapers to 2560 px. Preferred transfer budgets are 450 KiB, 96 KiB and 700 KiB respectively. The encoder first tries WebP at quality .82, then .72 at the same resolution before reducing dimensions. The preferred budget is not a hard rejection limit; the final attempt can use the existing 2.5 MiB ceiling. Browsers without a WebP encoder use JPEG on white. WebP preserves transparent pixels. GIF bytes are preserved to retain animation.

GIF files within the limit keep their original bytes. For other formats, the original can skip encoding if it needs no resizing or square crop and fits both the 96 KiB cap and its target budget. Existing stored files are not recompressed or migrated.

## Responsive previews for new uploads (#234)

The public upload endpoint accepts `?preview=post` or `?preview=avatar`. It keeps the uploaded original bytes and uses Sharp in the existing API to write smaller WebP objects into the same S3 bucket. Post variants are 640 and 1280 pixels wide. Avatar variants are 96 and 192 pixels wide. The API skips animation, upscaling, and previews larger than the uploaded original. It prepares up to two uploads concurrently and falls back to an original-only upload when capacity is unavailable or preview generation fails. The returned canonical path advertises the prepared variants and the original width. No database migration is required.

The gallery and avatar select resources with `srcset` and `sizes`. The full-screen viewer uses the preserved original. A legacy path works as before. The preview URL adds `?w=<width>` to the canonical path. The API checks moderation using the canonical path before reading the variant. Preview responses use the proxy and its ETag policy. A missing preview falls back to the original. Normal deletion of an unreferenced upload deletes its previews.

The API and the shared schema must support the new path before the frontend requests variants. A rollback to an API version that predates the new path format would reject paths already produced by the new version. To pause new variants, stop requesting or generating them while retaining the new path reader and validator.

## Reusing existing downloads (#58)

`GET /uploads/:file` checks moderation before serving or validating an image. Proxy responses use `private, no-cache` and the S3 ETag. A browser can retain bytes but must revalidate them before reuse. `If-None-Match` goes to S3. An unchanged object can return 304, and a provider that rejects the conditional request with 400 gets retried without it. Blocked images and missing objects return 404. Consult the [access boundaries](../BUBBLE_CONTEXT.md#изображения-и-прочие-файлы) when changing this route.

## Optional direct image delivery

Direct image delivery is **off by default**. To prepare a controlled environment:

1. Set `S3_PUBLIC_ENDPOINT` to the S3-compatible endpoint reachable from browsers, with TLS and the same bucket/region/credentials as the internal endpoint. Do not point it at an internal Docker hostname. This endpoint also signs the existing audio and private-message downloads.
2. Check image/audio downloads from the target networks, including Russia without VPN. Check S3 audio range requests and the existing cross-origin font configuration if applicable. A fast result from a developer machine does not establish regional reachability.
3. Set `S3_DIRECT_IMAGES=true` in that environment. Deployment and configuration changes are separate owner actions.

The shared avatar and gallery image component requests `/uploads/<file>?direct=1`. After moderation checks, the API redirects to a signed S3 GET URL valid for 60 seconds with `Cache-Control: no-store` on both the redirect and storage response. No public bucket or new permanent URL is required. A previously issued URL can remain usable for up to 60 seconds after moderation. If signing fails the API streams the image itself. If the browser cannot load the direct image, it retries the plain `/uploads/<file>` proxy URL once. This fallback handles loading errors; it cannot guarantee a short wait for every network timeout.

With direct delivery disabled or no public endpoint configured, the same request uses the normal proxy. Fonts, wallpaper CSS backgrounds, and other image consumers outside the avatar/gallery component continue using the proxy. Images in private messages retain their separate authenticated signing route and 120-second lifetime. Music playback/download already uses signed S3 URLs for 600 seconds; this change does not introduce an audio proxy or transcode music.

Real storage delivery, regional access and production throughput remain unverified locally. No production configuration was changed.
