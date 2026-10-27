"""A tolerant parser for the JavaScript/TypeScript object literals in ``src/data/``.

Why not a regular expression? Because the data we need is nested four levels
deep (``confirmedFloorPlans[].rooms[].uSpan``) and contains strings with commas,
comments between entries, trailing commas, and tuple types. A regex over that
produces something that works until the front end is reformatted and then fails
silently - which is the worst failure mode for a seeder whose whole job is
identifier fidelity.

Why not Node? Because evaluating front-end code to read it would mean running
the front end's toolchain, and ``node_modules/`` is tracked in git: a package
manager invocation would dirty paths outside ``backend/``.

So: a small recursive-descent parser for the literal subset actually used here.
It handles object and array literals, single/double/backtick strings with
escapes, numbers, booleans, ``null``/``undefined``, unquoted and quoted keys,
trailing commas, and both comment styles. Anything it does not understand is a
hard :class:`JsLiteralError` - never a guess.

It deliberately does **not** evaluate expressions. If the front end ever changes
``capacity: 30`` to ``capacity: BASE * 2``, parsing fails loudly and a human
decides what to do, rather than a wrong number reaching the database.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

__all__ = ["JsLiteralError", "find_export", "parse_js_literal", "strip_comments"]


class JsLiteralError(ValueError):
    """The source could not be parsed as a literal, with position information."""


_WHITESPACE = " \t\r\n"
_IDENT_START = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$")
_IDENT_REST = _IDENT_START | set("0123456789")
_NUMBER_CHARS = set("0123456789+-.eExXaAbBcCdDfF_")

_ESCAPES = {
    "n": "\n",
    "t": "\t",
    "r": "\r",
    "b": "\b",
    "f": "\f",
    "v": "\v",
    "0": "\0",
    "\\": "\\",
    "'": "'",
    '"': '"',
    "`": "`",
    "\n": "",  # line continuation
}


@dataclass
class _Cursor:
    text: str
    pos: int = 0

    def line_col(self, pos: int | None = None) -> tuple[int, int]:
        at = self.pos if pos is None else pos
        prefix = self.text[:at]
        line = prefix.count("\n") + 1
        col = at - (prefix.rfind("\n") + 1) + 1
        return line, col

    def fail(self, message: str) -> JsLiteralError:
        line, col = self.line_col()
        snippet = self.text[max(0, self.pos - 40) : self.pos + 40].replace("\n", "\\n")
        return JsLiteralError(f"{message} at line {line} column {col}: ...{snippet}...")


def strip_comments(source: str) -> str:
    """Remove ``//`` and ``/* */`` comments, preserving string contents and length.

    Length is preserved (comments become spaces) so that positions reported by
    the parser still line up with the original file, which makes errors
    actionable.
    """
    out: list[str] = []
    i = 0
    n = len(source)
    while i < n:
        ch = source[i]
        if ch in "\"'`":
            quote = ch
            out.append(ch)
            i += 1
            while i < n:
                if source[i] == "\\" and i + 1 < n:
                    out.append(source[i])
                    out.append(source[i + 1])
                    i += 2
                    continue
                out.append(source[i])
                if source[i] == quote:
                    i += 1
                    break
                i += 1
            continue
        if ch == "/" and i + 1 < n and source[i + 1] == "/":
            while i < n and source[i] != "\n":
                out.append(" ")
                i += 1
            continue
        if ch == "/" and i + 1 < n and source[i + 1] == "*":
            while i < n and not (source[i] == "*" and i + 1 < n and source[i + 1] == "/"):
                out.append("\n" if source[i] == "\n" else " ")
                i += 1
            out.append("  ")
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def parse_js_literal(source: str) -> Any:
    """Parse a single JS literal from ``source``, ignoring trailing content."""
    cursor = _Cursor(strip_comments(source))
    value = _parse_value(cursor)
    return value


def find_export(source: str, name: str) -> Any:
    """Parse the literal assigned to ``export const <name>`` (or ``const <name>``).

    Handles an optional TypeScript type annotation between the name and ``=``,
    e.g. ``export const knownBuildings: BuildingStructure[] = [...]``.
    """
    clean = strip_comments(source)
    start = _find_declaration(clean, name)
    cursor = _Cursor(clean, start)
    return _parse_value(cursor)


def _find_declaration(clean: str, name: str) -> int:
    """Return the index of the first character of ``name``'s initialiser."""
    search_from = 0
    while True:
        idx = clean.find(name, search_from)
        if idx == -1:
            raise JsLiteralError(f"no declaration of {name!r} found")
        search_from = idx + 1

        # Must be a whole identifier.
        before = clean[idx - 1] if idx > 0 else " "
        after_idx = idx + len(name)
        after = clean[after_idx] if after_idx < len(clean) else " "
        if before in _IDENT_REST or after in _IDENT_REST:
            continue

        # Must be preceded by const/let/var (optionally after 'export').
        head = clean[:idx].rstrip()
        if not (head.endswith("const") or head.endswith("let") or head.endswith("var")):
            continue

        # Skip an optional type annotation, then require '='.
        j = after_idx
        depth = 0
        while j < len(clean):
            ch = clean[j]
            if ch in "<([{":
                depth += 1
            elif ch in ">)]}":
                depth -= 1
            elif ch == "=" and depth <= 0 and clean[j + 1 : j + 2] != "=":
                return _skip_ws(clean, j + 1)
            elif ch == ";" and depth <= 0:
                break
            j += 1
        continue


def _skip_ws(text: str, pos: int) -> int:
    while pos < len(text) and text[pos] in _WHITESPACE:
        pos += 1
    return pos


def _ws(cursor: _Cursor) -> None:
    cursor.pos = _skip_ws(cursor.text, cursor.pos)


def _parse_value(cursor: _Cursor) -> Any:
    _ws(cursor)
    if cursor.pos >= len(cursor.text):
        raise cursor.fail("unexpected end of input")
    ch = cursor.text[cursor.pos]

    if ch == "{":
        return _parse_object(cursor)
    if ch == "[":
        return _parse_array(cursor)
    if ch in "\"'`":
        return _parse_string(cursor)
    if ch in "-+.0123456789":
        return _parse_number(cursor)
    if ch in _IDENT_START:
        return _parse_keyword(cursor)
    raise cursor.fail(f"unexpected character {ch!r}")


def _parse_object(cursor: _Cursor) -> dict[str, Any]:
    cursor.pos += 1  # '{'
    result: dict[str, Any] = {}
    while True:
        _ws(cursor)
        if cursor.pos >= len(cursor.text):
            raise cursor.fail("unterminated object")
        if cursor.text[cursor.pos] == "}":
            cursor.pos += 1
            return result
        key = _parse_key(cursor)
        _ws(cursor)
        if cursor.pos >= len(cursor.text) or cursor.text[cursor.pos] != ":":
            raise cursor.fail(f"expected ':' after key {key!r}")
        cursor.pos += 1
        result[key] = _parse_value(cursor)
        _ws(cursor)
        if cursor.pos < len(cursor.text) and cursor.text[cursor.pos] == ",":
            cursor.pos += 1
            continue
        _ws(cursor)
        if cursor.pos < len(cursor.text) and cursor.text[cursor.pos] == "}":
            cursor.pos += 1
            return result
        raise cursor.fail("expected ',' or '}' in object")


def _parse_key(cursor: _Cursor) -> str:
    ch = cursor.text[cursor.pos]
    if ch in "\"'`":
        return str(_parse_string(cursor))
    if ch == "[":
        raise cursor.fail("computed keys are not supported")
    if ch == ".":
        raise cursor.fail("spread syntax is not supported")
    start = cursor.pos
    while cursor.pos < len(cursor.text) and cursor.text[cursor.pos] in _IDENT_REST:
        cursor.pos += 1
    if start == cursor.pos:
        raise cursor.fail("expected an object key")
    return cursor.text[start : cursor.pos]


def _parse_array(cursor: _Cursor) -> list[Any]:
    cursor.pos += 1  # '['
    result: list[Any] = []
    while True:
        _ws(cursor)
        if cursor.pos >= len(cursor.text):
            raise cursor.fail("unterminated array")
        if cursor.text[cursor.pos] == "]":
            cursor.pos += 1
            return result
        result.append(_parse_value(cursor))
        _ws(cursor)
        if cursor.pos < len(cursor.text) and cursor.text[cursor.pos] == ",":
            cursor.pos += 1
            continue
        _ws(cursor)
        if cursor.pos < len(cursor.text) and cursor.text[cursor.pos] == "]":
            cursor.pos += 1
            return result
        raise cursor.fail("expected ',' or ']' in array")


def _parse_string(cursor: _Cursor) -> str:
    quote = cursor.text[cursor.pos]
    cursor.pos += 1
    chars: list[str] = []
    while cursor.pos < len(cursor.text):
        ch = cursor.text[cursor.pos]
        if ch == "\\":
            nxt = cursor.text[cursor.pos + 1 : cursor.pos + 2]
            if nxt == "u":
                hex_part = cursor.text[cursor.pos + 2 : cursor.pos + 6]
                try:
                    chars.append(chr(int(hex_part, 16)))
                except ValueError as exc:
                    raise cursor.fail("invalid \\u escape") from exc
                cursor.pos += 6
                continue
            if nxt in _ESCAPES:
                chars.append(_ESCAPES[nxt])
                cursor.pos += 2
                continue
            chars.append(nxt)
            cursor.pos += 2
            continue
        if ch == quote:
            cursor.pos += 1
            return "".join(chars)
        if ch == "$" and quote == "`" and cursor.text[cursor.pos + 1 : cursor.pos + 2] == "{":
            raise cursor.fail("template interpolation is not a literal value")
        chars.append(ch)
        cursor.pos += 1
    raise cursor.fail("unterminated string")


def _parse_number(cursor: _Cursor) -> int | float:
    start = cursor.pos
    while cursor.pos < len(cursor.text) and cursor.text[cursor.pos] in _NUMBER_CHARS:
        cursor.pos += 1
    raw = cursor.text[start : cursor.pos].replace("_", "")
    if not raw or raw in {"+", "-", "."}:
        raise cursor.fail("malformed number")
    try:
        if raw.lower().startswith(("0x", "-0x", "+0x")):
            return int(raw, 16)
        if any(c in raw for c in ".eE") and not raw.lower().startswith("0x"):
            return float(raw)
        return int(raw)
    except ValueError as exc:
        raise cursor.fail(f"malformed number {raw!r}") from exc


def _parse_keyword(cursor: _Cursor) -> Any:
    start = cursor.pos
    while cursor.pos < len(cursor.text) and cursor.text[cursor.pos] in _IDENT_REST:
        cursor.pos += 1
    word = cursor.text[start : cursor.pos]

    # A TypeScript `as const` / `satisfies X` suffix is noise around a literal.
    if word in {"true", "false"}:
        return word == "true"
    if word in {"null", "undefined"}:
        return None
    raise cursor.fail(
        f"identifier {word!r} is not a literal value. The extractor refuses to "
        "evaluate expressions: a computed value could silently seed wrong data."
    )
