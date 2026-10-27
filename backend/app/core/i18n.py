"""Internationalisation.

All user-facing text goes through message catalogues from day one (brief
section 9), so adding a language means adding a catalogue file, not editing
code. English is the default locale.

The repository is bilingual in practice: documentation and some UI strings are
Russian while the code and map labels are English, so Russian is wired up as a
second locale from the start.

Catalogues live in ``backend/locales/<locale>/LC_MESSAGES/messages.po`` and are
compiled to ``.mo`` by ``make i18n-compile``. A missing catalogue is not an
error: the message ID falls back to its ``default``, which keeps the API working
before any translation exists.
"""

from __future__ import annotations

import gettext
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import BACKEND_DIR

LOCALES_DIR: Path = BACKEND_DIR / "locales"
DEFAULT_LOCALE = "en"
SUPPORTED_LOCALES: tuple[str, ...] = ("en", "ru")

DOMAIN = "messages"


@lru_cache(maxsize=len(SUPPORTED_LOCALES) + 1)
def _translation(locale: str) -> gettext.NullTranslations:
    try:
        return gettext.translation(DOMAIN, localedir=LOCALES_DIR, languages=[locale], fallback=False)
    except FileNotFoundError:
        # No compiled catalogue yet. Fall back to the message's default text
        # rather than failing a request.
        return gettext.NullTranslations()


def negotiate_locale(accept_language: str | None) -> str:
    """Pick the best supported locale from an ``Accept-Language`` header.

    Deliberately simple: parse ``q`` weights, take the highest-weighted entry
    whose primary subtag we support, and fall back to English. Good enough for
    error messages and route instructions; a full RFC 4647 implementation would
    be noise here.
    """
    if not accept_language:
        return DEFAULT_LOCALE

    candidates: list[tuple[float, str]] = []
    for part in accept_language.split(","):
        piece = part.strip()
        if not piece:
            continue
        tag, _, params = piece.partition(";")
        quality = 1.0
        if params.strip().startswith("q="):
            try:
                quality = float(params.strip()[2:])
            except ValueError:
                quality = 0.0
        primary = tag.strip().lower().split("-", 1)[0]
        if primary in SUPPORTED_LOCALES:
            candidates.append((quality, primary))

    if not candidates:
        return DEFAULT_LOCALE
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def translate(
    message_id: str,
    *,
    locale: str | None = None,
    default: str | None = None,
    **params: Any,
) -> str:
    """Translate ``message_id``, formatting any ``params`` into the result.

    ``locale`` accepts a raw ``Accept-Language`` header value or a bare locale
    code. ``default`` is the English text used when no catalogue provides a
    translation, which is what makes this safe to call before translators have
    seen the string.
    """
    resolved = locale if locale in SUPPORTED_LOCALES else negotiate_locale(locale)
    text = _translation(resolved).gettext(message_id)
    if text == message_id and default is not None:
        text = default
    if params:
        try:
            return text.format(**params)
        except (KeyError, IndexError):
            # A catalogue with a wrong placeholder must not break the response.
            return text
    return text


def ngettext(
    singular_id: str,
    plural_id: str,
    count: int,
    *,
    locale: str | None = None,
    default_singular: str | None = None,
    default_plural: str | None = None,
    **params: Any,
) -> str:
    """Plural-aware translation."""
    resolved = locale if locale in SUPPORTED_LOCALES else negotiate_locale(locale)
    text = _translation(resolved).ngettext(singular_id, plural_id, count)
    if text in {singular_id, plural_id}:
        fallback = default_singular if count == 1 else default_plural
        if fallback is not None:
            text = fallback
    try:
        return text.format(count=count, **params)
    except (KeyError, IndexError):
        return text


def clear_cache() -> None:
    """Drop cached catalogues, for tests and after ``make i18n-compile``."""
    _translation.cache_clear()
