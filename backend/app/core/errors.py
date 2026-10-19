"""Error types and a single response envelope.

Every failure the API returns looks the same::

    {"error": {"code": "room_not_found", "message": "...", "details": {...},
               "request_id": "..."}}

``code`` is a stable machine-readable string; ``message`` is human-facing and
therefore goes through the i18n catalogues. Having one envelope means a client
never has to guess the shape of an error, and the compatibility layer can keep
its own 1:1 mapping without inventing error formats.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.i18n import translate
from app.core.logging import get_logger, get_request_id

log = get_logger(__name__)


class AppError(Exception):
    """Base class for errors the API deliberately returns.

    Anything else that escapes a handler is a bug and becomes a 500 with no
    internal detail leaked.
    """

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "internal_error"
    message_id: str = "error.internal"

    def __init__(
        self,
        message: str | None = None,
        *,
        details: dict[str, Any] | None = None,
        code: str | None = None,
    ) -> None:
        self.details = details or {}
        if code is not None:
            self.code = code
        self._message = message
        super().__init__(message or self.code)

    def message(self, locale: str | None = None) -> str:
        if self._message is not None:
            return self._message
        return translate(self.message_id, locale=locale, default=self.code.replace("_", " "))


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    message_id = "error.not_found"


class ValidationError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT
    code = "validation_error"
    message_id = "error.validation"


class ConflictError(AppError):
    """A request lost a race or violated a uniqueness/overlap rule.

    Booking overlaps surface here, carrying alternative slots in ``details``
    (brief section 10.4).
    """

    status_code = status.HTTP_409_CONFLICT
    code = "conflict"
    message_id = "error.conflict"


class AuthenticationError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "not_authenticated"
    message_id = "error.not_authenticated"


class PermissionDeniedError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "permission_denied"
    message_id = "error.permission_denied"


class AmbiguousAliasError(AppError):
    """A legacy identifier maps to more than one current entity.

    The front end's ``legacyId`` values are not unique - ``bld-h-f2-r7`` is
    claimed by both ``A-207`` and ``A-208`` in
    ``src/data/floor-plans/index.ts``. Resolving that by picking one would
    silently lose a room, so it is an explicit error instead
    (see docs/adr/0008-identifiers-and-legacy-aliases.md).
    """

    status_code = status.HTTP_409_CONFLICT
    code = "ambiguous_alias"
    message_id = "error.ambiguous_alias"


class NotImplementedYetError(AppError):
    """A documented endpoint whose implementation belongs to a later phase.

    Returned instead of a silent empty result so a caller is never misled into
    thinking "no data" when the answer is "not built yet".
    """

    status_code = status.HTTP_501_NOT_IMPLEMENTED
    code = "not_implemented_yet"
    message_id = "error.not_implemented_yet"

    def __init__(self, *, phase: str, endpoint: str, detail: str | None = None) -> None:
        super().__init__(
            detail or f"{endpoint} is scheduled for {phase} and is not implemented yet.",
            details={"phase": phase, "endpoint": endpoint},
        )


def error_payload(
    *,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    request_id = get_request_id()
    if request_id:
        payload["request_id"] = request_id
    return {"error": payload}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        locale = request.headers.get("accept-language")
        if exc.status_code >= 500:
            log.error("app_error", code=exc.code, path=request.url.path, exc_info=exc)
        else:
            log.info("app_error", code=exc.code, path=request.url.path, status=exc.status_code)
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(code=exc.code, message=exc.message(locale), details=exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        locale = request.headers.get("accept-language")
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=error_payload(
                code="validation_error",
                message=translate("error.validation", locale=locale, default="Invalid request."),
                # jsonable: pydantic errors can hold non-serialisable context.
                details={"errors": [_safe_error(item) for item in exc.errors()]},
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_payload(code=_code_for_status(exc.status_code), message=str(exc.detail)),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Never leak internals. The request ID in the body is how an operator
        # correlates this with the logged traceback.
        log.error("unhandled_exception", path=request.url.path, exc_info=exc)
        locale = request.headers.get("accept-language")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_payload(
                code="internal_error",
                message=translate("error.internal", locale=locale, default="Internal server error."),
            ),
        )


def _safe_error(item: Any) -> dict[str, Any]:
    raw = dict(item)
    raw.pop("ctx", None)
    raw.pop("input", None)
    return {
        key: str(value) if not isinstance(value, (str, int, float, bool, list)) else value
        for key, value in raw.items()
    }


def _code_for_status(status_code: int) -> str:
    return {
        400: "bad_request",
        401: "not_authenticated",
        403: "permission_denied",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        422: "validation_error",
        429: "rate_limited",
        501: "not_implemented_yet",
        503: "service_unavailable",
    }.get(status_code, "error")
