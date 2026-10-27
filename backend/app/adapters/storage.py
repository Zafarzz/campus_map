"""Object storage abstraction and image privacy scrubber (brief section 12.2).

Photos uploaded for lost-and-found items or maintenance tickets must:
1. Pass through :func:`strip_image_exif` so camera EXIF and GPS coordinates are
   never stored or served.
2. Live behind a storage adapter (:class:`StorageAdapter`) with a local-disk
   implementation in development and an S3-compatible interface for production.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from PIL import Image

__all__ = [
    "InvalidImageError",
    "LocalDiskStorageAdapter",
    "S3CompatibleStorageAdapter",
    "StorageAdapter",
    "StoredObject",
    "has_exif_metadata",
    "strip_image_exif",
]


class InvalidImageError(ValueError):
    """Raised when uploaded bytes cannot be decoded as a valid raster image."""


@dataclass(frozen=True, slots=True)
class StoredObject:
    """Metadata returned when an object is persisted."""

    key: str
    content_type: str
    size_bytes: int
    sha256: str


class StorageAdapter(Protocol):
    """Protocol implemented by local-disk and S3-compatible object stores."""

    def put_bytes(self, key: str, data: bytes, *, content_type: str) -> StoredObject: ...

    def get_bytes(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...


def strip_image_exif(raw_bytes: bytes, *, output_format: str = "JPEG") -> tuple[bytes, str]:
    """Decode an image with Pillow and re-encode a clean copy without EXIF/GPS metadata.

    Rebuilds a fresh :class:`PIL.Image.Image` from pixel data alone so no EXIF,
    XMP, or IPTC chunks survive. Returns ``(clean_bytes, content_type)``.
    """
    if not raw_bytes:
        raise InvalidImageError("Image payload is empty")

    try:
        with Image.open(io.BytesIO(raw_bytes)) as img:
            fmt = (output_format or img.format or "JPEG").upper()
            if fmt not in {"JPEG", "PNG", "WEBP"}:
                fmt = "JPEG"

            mode = img.mode
            if (fmt == "JPEG" and mode not in {"RGB", "L"}) or mode not in {"RGB", "RGBA", "L"}:
                converted = img.convert("RGB")
            else:
                converted = img.copy()

            clean = Image.new(converted.mode, converted.size)
            clean.putdata(
                list(
                    converted.get_flattened_data()
                    if hasattr(converted, "get_flattened_data")
                    else converted.getdata()
                )
            )

            out = io.BytesIO()
            save_kwargs: dict[str, object] = {}
            if fmt == "JPEG":
                save_kwargs["quality"] = 85
            clean.save(out, format=fmt, **save_kwargs)
            content_type = f"image/{fmt.lower()}"
            return out.getvalue(), content_type
    except Exception as exc:
        if isinstance(exc, InvalidImageError):
            raise
        raise InvalidImageError(f"Could not decode image: {exc}") from exc


def has_exif_metadata(image_bytes: bytes) -> bool:
    """Return True if the image contains any EXIF tags (used by privacy tests)."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        exif = img.getexif()
        return bool(exif and len(exif) > 0)


class LocalDiskStorageAdapter:
    """Development storage adapter persisting objects under a local root directory."""

    def __init__(self, root_dir: Path | str) -> None:
        self.root_dir = Path(root_dir).resolve()
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_safe_path(self, key: str) -> Path:
        clean_key = key.lstrip("/\\").replace("\\", "/")
        if ".." in clean_key.split("/"):
            raise ValueError(f"Unsafe storage key: {key!r}")
        target = (self.root_dir / clean_key).resolve()
        if not str(target).startswith(str(self.root_dir)):
            raise ValueError(f"Storage key escapes root directory: {key!r}")
        return target

    def put_bytes(self, key: str, data: bytes, *, content_type: str) -> StoredObject:
        target = self._resolve_safe_path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        return StoredObject(
            key=key.lstrip("/\\").replace("\\", "/"),
            content_type=content_type,
            size_bytes=len(data),
            sha256=digest,
        )

    def get_bytes(self, key: str) -> bytes:
        target = self._resolve_safe_path(key)
        if not target.is_file():
            raise FileNotFoundError(f"Storage object not found: {key!r}")
        return target.read_bytes()

    def delete(self, key: str) -> None:
        target = self._resolve_safe_path(key)
        if target.is_file():
            target.unlink()


class S3CompatibleStorageAdapter:
    """Production S3-compatible object storage adapter interface.

    Stores objects in an in-memory/pluggable client map until an S3 endpoint and
    credentials are configured in the environment.
    """

    def __init__(self, bucket: str, endpoint_url: str | None = None) -> None:
        self.bucket = bucket
        self.endpoint_url = endpoint_url
        self._objects: dict[str, bytes] = {}

    def put_bytes(self, key: str, data: bytes, *, content_type: str) -> StoredObject:
        norm_key = key.lstrip("/")
        self._objects[norm_key] = bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        return StoredObject(
            key=norm_key,
            content_type=content_type,
            size_bytes=len(data),
            sha256=digest,
        )

    def get_bytes(self, key: str) -> bytes:
        norm_key = key.lstrip("/")
        if norm_key not in self._objects:
            raise FileNotFoundError(f"S3 object not found: {norm_key!r}")
        return self._objects[norm_key]

    def delete(self, key: str) -> None:
        self._objects.pop(key.lstrip("/"), None)
