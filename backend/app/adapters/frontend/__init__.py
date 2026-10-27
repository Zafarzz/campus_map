"""Read-only adapter over the front end's static data.

The front end is read-only for this backend (brief section 0.2 rule 1). Nothing in
this package opens a front-end file for writing, and the API surface here takes
paths and returns plain Python data - there is no write path to accidentally
call.
"""

from app.adapters.frontend.campus_extract import (
    ExtractedBuilding,
    ExtractedFloor,
    ExtractedRoom,
    FrontendInventory,
    extract_inventory,
)
from app.adapters.frontend.js_literal import JsLiteralError, find_export, parse_js_literal

__all__ = [
    "ExtractedBuilding",
    "ExtractedFloor",
    "ExtractedRoom",
    "FrontendInventory",
    "JsLiteralError",
    "extract_inventory",
    "find_export",
    "parse_js_literal",
]
