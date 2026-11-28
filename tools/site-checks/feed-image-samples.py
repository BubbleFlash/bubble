"""Anonymous local upload corpus passed to the loopback benchmark in memory. Never log stdout."""
import base64
import io
import json
from pathlib import Path
from PIL import Image, features

samples = []
for path in sorted(Path("apps/api/uploads").rglob("*")):
    if not path.is_file() or path.suffix.lower() not in {".jpg",".jpeg",".png",".webp"}:
        continue
    with Image.open(path) as image:
        # The square sample is avatar-sized. Actual ownership/use is deliberately unknown.
        square = image.width == image.height
        target = 96 if square else 640
        def sample(label, mime, size, data):
            return {"label":label, "mime":mime,"size":size,"bytes":len(data),
                    "data":base64.b64encode(data).decode("ascii")}
        variants = [sample("stored",Image.MIME[image.format],image.size,path.read_bytes())]
        thumb = image.convert("RGB")
        thumb.thumbnail((target,target),Image.Resampling.LANCZOS)
        for fmt, quality in [("JPEG",82),("WEBP",82),("AVIF",60)]:
            if fmt == "AVIF" and "avif" not in features.get_supported():
                continue
            data = io.BytesIO()
            thumb.save(data,format=fmt,quality=quality)
            variants.append(sample("preview",Image.MIME[fmt],thumb.size,data.getvalue()))
        samples.append(variants)
print(json.dumps(samples))
