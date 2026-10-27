"""Shared notification template engine (brief sections 6.2 and 9).

Every user-facing notification message is rendered from a template identifier
and locale (`en`, `ru`, `uz`, falling back to `en`) so no service hard-codes
single-language strings.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

__all__ = [
    "NOTIFICATION_CATALOGUE",
    "RenderedNotification",
    "render_notification_template",
]


@dataclass(frozen=True, slots=True)
class RenderedNotification:
    """Subject and body rendered in the recipient's locale."""

    template_id: str
    locale: str
    subject: str
    body: str


#: Built-in multilingual notification templates (en, ru, uz).
NOTIFICATION_CATALOGUE: dict[str, dict[str, tuple[str, str]]] = {
    "study_group.matched": {
        "en": (
            "Study group matched: {topic_tag}",
            "Your study group for {topic_tag} has been matched ({starts_at} - {ends_at}, room {room_id}).",
        ),
        "ru": (
            "Найдена учебная группа: {topic_tag}",
            "Ваша учебная группа по теме {topic_tag} сформирована ({starts_at} - {ends_at}, ауд. {room_id}).",
        ),
        "uz": (
            "O'quv guruhi topildi: {topic_tag}",
            "{topic_tag} bo'yicha o'quv guruhingiz tuzildi ({starts_at} - {ends_at}, xona {room_id}).",
        ),
    },
    "study_group.dissolved": {
        "en": (
            "Study session ended: {topic_tag}",
            "The study group session for {topic_tag} has concluded and been dissolved.",
        ),
        "ru": (
            "Учебная сессия завершена: {topic_tag}",
            "Сессия учебной группы по теме {topic_tag} завершена.",
        ),
        "uz": (
            "O'quv sessiyasi yakunlandi: {topic_tag}",
            "{topic_tag} bo'yicha o'quv guruhi sessiyasi yakunlandi.",
        ),
    },
    "ticket.created": {
        "en": (
            "Ticket #{ticket_short} received: {title}",
            "Your maintenance ticket '{title}' ({category}) has been registered with status '{status}'.",
        ),
        "ru": (
            "Заявка #{ticket_short} принята: {title}",
            "Ваша заявка '{title}' ({category}) зарегистрирована в статусе '{status}'.",
        ),
        "uz": (
            "Murojaat #{ticket_short} qabul qilindi: {title}",
            "Sizning '{title}' ({category}) bo'yicha murojaatingiz '{status}' holati bilan ro'yxatga olindi.",
        ),
    },
    "ticket.status_changed": {
        "en": (
            "Ticket #{ticket_short} updated to {to_status}",
            "Ticket '{title}' moved from '{from_status}' to '{to_status}'.",
        ),
        "ru": (
            "Статус заявки #{ticket_short}: {to_status}",
            "Заявка '{title}' переведена из статуса '{from_status}' в '{to_status}'.",
        ),
        "uz": (
            "Murojaat #{ticket_short} holati: {to_status}",
            "'{title}' murojaati '{from_status}' holatidan '{to_status}' holatiga o'tkazildi.",
        ),
    },
    "lost_found.matched": {
        "en": (
            "Potential match for your {kind} item: {title}",
            "We found a potential match (score {score}) for '{title}' ({category}).",
        ),
        "ru": (
            "Возможное совпадение ({kind}): {title}",
            "Найдено возможное совпадение (оценка {score}) для '{title}' ({category}).",
        ),
        "uz": (
            "Ehtimoliy moslik ({kind}): {title}",
            "'{title}' ({category}) uchun ehtimoliy moslik topildi (ball {score}).",
        ),
    },
    "lost_found.claim_submitted": {
        "en": (
            "New claim on found item: {title}",
            "A user submitted a verification answer to claim '{title}'.",
        ),
        "ru": (
            "Новый запрос на найденную вещь: {title}",
            "Пользователь отправил проверочный ответ для получения '{title}'.",
        ),
        "uz": (
            "Topilgan buyum bo'yicha yangi so'rov: {title}",
            "Foydalanuvchi '{title}' buyumini olish uchun tasdiqlash javobini yubordi.",
        ),
    },
    "lost_found.claim_resolved": {
        "en": (
            "Claim {decision}: {title}",
            "Your claim for '{title}' was {decision}. Handover point: {handover_point}.",
        ),
        "ru": (
            "Запрос на вещь ({decision}): {title}",
            "Ваш запрос на '{title}' получил статус: {decision}. Место передачи: {handover_point}.",
        ),
        "uz": (
            "Buyum so'rovi ({decision}): {title}",
            "'{title}' bo'yicha so'rovingiz holati: {decision}. Topshirish joyi: {handover_point}.",
        ),
    },
    "broadcast.general": {
        "en": ("{subject}", "{body}"),
        "ru": ("{subject}", "{body}"),
        "uz": ("{subject}", "{body}"),
    },
}


class _SafeFormatDict(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        return f"{{{key}}}"


def render_notification_template(
    template_id: str,
    *,
    locale: str = "en",
    params: dict[str, Any] | None = None,
) -> RenderedNotification:
    """Render ``template_id`` in ``locale`` (falling back to ``en``)."""
    lang = (locale or "en").split("-")[0].lower()
    entry = NOTIFICATION_CATALOGUE.get(template_id)
    if entry is None:
        raw_subj = str((params or {}).get("subject", template_id))
        raw_body = str((params or {}).get("body", template_id))
        return RenderedNotification(
            template_id=template_id,
            locale=lang,
            subject=raw_subj,
            body=raw_body,
        )

    subj_tmpl, body_tmpl = entry.get(lang) or entry["en"]
    safe_params = _SafeFormatDict(params or {})
    return RenderedNotification(
        template_id=template_id,
        locale=lang if lang in entry else "en",
        subject=subj_tmpl.format_map(safe_params),
        body=body_tmpl.format_map(safe_params),
    )
