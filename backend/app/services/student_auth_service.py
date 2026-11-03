"""University student authentication, official roster, and password policy.

Implements student-only sign-in backed by the official Ajou University in
Tashkent student group list:

* Only students whose ``student_id`` is registered in the university roster
  (or provisioned as a student ``AppUser``) may sign in.
* Initial credentials: ``login = student_id`` and ``password = student_id``
  (for example ``202590207`` / ``202590207``).
* While a student is still using their default initial password (equal to their
  ``student_id``), the login and profile responses flag
  ``must_change_password = True`` so the client can prompt an immediate password
  change.
* Changing or resetting the password enforces standard password strength rules:
  at least 6 characters, at least one uppercase letter, at least one lowercase
  letter, at least one digit, at least one special character, and not equal to
  the student ID or current password.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import AuthenticationError, NotFoundError, ValidationError
from app.core.security import Role, create_access_token, hash_password, verify_password
from app.core.time import now
from app.domain.people import AppUser, UserRole
from app.domain.platform import AuditLog

STUDENT_REF_PREFIX = "student:"
MIN_PASSWORD_LENGTH = 6
MAX_PASSWORD_LENGTH = 256

PASSWORD_REQUIREMENTS: tuple[str, ...] = (
    "At least 6 characters long",
    "At least one uppercase letter (A-Z)",
    "At least one lowercase letter (a-z)",
    "At least one number (0-9)",
    "At least one special character (e.g. !@#$%^&*)",
    "Must not be the same as your Student ID",
)


@dataclass(frozen=True, slots=True)
class StudentRosterEntry:
    """Official university student record from the group list."""

    department: str
    last_name: str
    first_name: str
    fathers_name: str
    group_no: str
    examination_no: str
    student_id: str

    @property
    def full_name(self) -> str:
        return f"{self.last_name} {self.first_name} {self.fathers_name}".strip()

    @property
    def external_ref(self) -> str:
        return f"{STUDENT_REF_PREFIX}{self.student_id}"


# Official student roster from "New students Group List (2025.9.7)" (Pages 1-3).
_RAW_STUDENT_ROSTER: tuple[tuple[str, str, str, str, str, str, str], ...] = (
    # Page 1
    ("IT-Business", "BAHODIROVA", "MUSLIMAXON", "SHAVKAT QIZI", "I25A", "253650675", "202590143"),
    ("IT-Business", "ABDILXAKOVA", "SADIA", "ABDUKAXXOROVA", "I25C", "252610163", "202590144"),
    ("IT-Business", "ABDUG'AFFOROV", "ABDUVOHID", "ABDUG'ANI", "I25A", "254610042", "202590145"),
    ("IT-Business", "ABDUKARIMOVA", "SHAXZODA", "SHUXRAT QIZI", "I25C", "252610384", "202590146"),
    ("IT-Business", "ABDULAZIZOV", "ABBOS", "AKROM O'G'LI", "I25D", "251610454", "202590147"),
    ("IT-Business", "ABDULLAYEV", "ASLIDDIN", "AZIZJON O'G'LI", "I25C", "252610536", "202590148"),
    ("IT-Business", "ABDULLAYEVA", "SHAXNOZA", "RUSTAM QIZI", "I25B", "251610472", "202590149"),
    ("IT-Business", "ABDUMANNAPOVA", "SOLIHA", "BAXODIR QIZI", "I25A", "251650041", "202590150"),
    ("IT-Business", "ABDURAZOQOVA", "NIGINA", "SHAVKAT QIZI", "I25D", "254610041", "202590151"),
    ("IT-Business", "ABDURUYKULOVA", "MADINA", "XABIBULLAEVNA", "I25A", "252610267", "202590152"),
    ("IT-Business", "ABDUVAHOBOV", "ISLOM", "RAVSHAN O'G'LI", "I25C", "252610694", "202590153"),
    ("IT-Business", "ADHAMOV", "AHRORXO'JA", "RUSTAM O'G'LI", "I25C", "251610402", "202590154"),
    ("IT-Business", "AHMADALIYEV", "ULUG'BEK", "AKMALJON O'G'LI", "I25E", "252650837", "202590155"),
    ("IT-Business", "AKHMEDOV", "ISLOMBEK", "NODIRBEK UGLI", "I24E-2", "254690040", "202490902"),
    ("IT-Business", "AKRAMOV", "AKBARJON", "ANVARJON O'G'LI", "I25C", "252610715", "202590156"),
    ("IT-Business", "ALIYEV", "MUHAMMADALI", "SHAVKAT O'G'LI", "I25E", "253610222", "202590157"),
    ("IT-Business", "ALIYEVA", "SAFIYA", "ILXOMOVNA", "I25C", "251650363", "202590158"),
    ("IT-Business", "AMANKELDIYEVA", "MUXABBAT", "JALALOVNA", "I25E", "253650560", "202590159"),
    ("IT-Business", "AMINOVA", "AMIRA", "AMINOVNA", "I25E", "251650122", "202590160"),
    ("IT-Business", "ARAPBAYEVA", "MALIKA", "RUSTAM QIZI", "I25D", "253650367", "202590161"),
    ("IT-Business", "ASADDULLAYEV", "BAXODIRJON", "BAXTIYORJON O'G'LI", "I24E-1", "251680633", "202490903"),
    ("IT-Business", "ASADOV", "AHMADJON", "SHUHRAT O'G'LI", "I25B", "251610359", "202590162"),
    ("IT-Business", "ASTANKULOV", "ERNAZAR", "FURKAT ULI", "I25A", "254610034", "202590163"),
    ("IT-Business", "ATAJANOVA", "LAYLO", "ALISHER QIZI", "I25C", "253650120", "202590164"),
    ("IT-Business", "AXMEDOV", "AZIZBEK", "YUSUFOVICH", "I25A", "253650235", "202590165"),
    ("IT-Business", "AYTMURATOV", "AKILBEK", "KONISBAEVICH", "I25E", "251610329", "202590166"),
    ("IT-Business", "AZIMOVA", "NIGINA", "UMIDJONOVNA", "I25B", "252650722", "202590167"),
    ("IT-Business", "AZIMOVA", "NIGINA", "UMIDJONOVNA", "I25C", "251650204", "202590168"),
    ("IT-Business", "AZIZOV", "ABDULAZIZBEK", "IXTIYOROVICH", "I25B", "252650326", "202590169"),
    ("IT-Business", "CHORIYEVA", "CHAROS", "LAZIZOVNA", "I25A", "252650773", "202590170"),
    ("IT-Business", "DADOXODJAEVA", "MEHRANGEZ", "MUBINXODJAEVNA", "I25C", "253670327", "202590171"),
    ("IT-Business", "DYO", "DMITRIY", "GERMANOVICH", "I25C", "251610251", "202590172"),
    ("IT-Business", "ERGASHEV", "SARDOR", "ISLOM O'G'LI", "I25D", "252610463", "202590173"),
    ("IT-Business", "FARXODOV", "SARDORBEK", "FARXOD O'G'LI", "I25B", "251610432", "202590174"),
    ("IT-Business", "FATTAYEV", "AZIZ", "ARMANOVICH", "I25E", "251610452", "202590175"),
    ("IT-Business", "GALAUTDINOVA", "RUZANA", "MARATOVNA", "I25D", "252650553", "202590176"),
    ("IT-Business", "G'ANIYEVA", "ZILOLA", "ZOKIRJONOVNA", "I25E", "251650161", "202590177"),
    ("IT-Business", "HASANOVA", "RUSHANIYA", "JAVDATOVNA", "I25D", "253650440", "202590178"),
    ("IT-Business", "HATAMJONOVA", "MUHLISA", "MUZAFFAROVNA", "I25A", "252610021", "202590179"),
    ("IT-Business", "IBRAGIMOV", "AZIZ", "AKMAL O'G'LI", "I25E", "252650451", "202590180"),
    ("IT-Business", "JALGASOV", "SULTANBEK", "MURAT ULI", "I25E", "251610023", "202590441"),
    ("IT-Business", "JALOLOVA", "JASMINA", "NODIR QIZI", "I25B", "253650576", "202590181"),
    ("IT-Business", "JO'RABOYEVA", "MADINA", "MURODJON QIZI", "I25E", "252650540", "202590442"),
    ("IT-Business", "JUMAYEV", "TOXIRJON", "AKBAROVICH", "I25C", "253650171", "202590182"),
    ("IT-Business", "KAMALOV", "FELIKS", "TIMUROVICH", "I25D", "252610198", "202590183"),
    ("IT-Business", "KAN", "DANIIL", "VLADIMIROVICH", "I25D", "252610726", "202590184"),
    ("IT-Business", "KARIMOV", "ISLOMBEK", "MUHIDDIN O'G'LI", "I25B", "253610166", "202590185"),
    ("IT-Business", "KASIMOV", "RAXMAN", "ABDULLAYEVICH", "I25D", "251610090", "202590186"),
    # Page 2
    ("IT-Business", "KAZAKOV", "ARSEN", "USMANOVICH", "I25D", "253650149", "202590187"),
    ("IT-Business", "KAZAKOV", "ARTYOM", "VLADIMIROVICH", "I25C", "253650529", "202590188"),
    ("IT-Business", "KELDIYOROV", "FARID", "MAXSUD O'G'LI", "I25A", "253650085", "202590189"),
    ("IT-Business", "KIM", "ANASTASIYA", "LEONIDOVNA", "I25B", "252650174", "202590190"),
    ("IT-Business", "KIM", "ARTYOM", "DMITRIYEVICH", "I25D", "253640526", "202590191"),
    ("IT-Business", "KOMILOV", "A'ZAMXON", "SHUKURULLOXON O'G'LI", "I25C", "253650276", "202590192"),
    ("IT-Business", "KOMILOVA", "SAMIRA", "OZOD QIZI", "I25D", "251650039", "202590193"),
    ("IT-Business", "LEBEDEV", "RATMIR", "KARIMOVICH", "I25C", "253670547", "202590194"),
    ("IT-Business", "MAGAY", "SARRA", "ANATOLEVNA", "I25B", "251610007", "202590195"),
    ("IT-Business", "MAMURJONOVA", "RAYYONA", "MUZAFFAR QIZI", "I25B", "252610654", "202590196"),
    ("IT-Business", "MASHARIPOV", "SOBURJON", "RASULBEK OGLI", "I25E", "252610250", "202590197"),
    ("IT-Business", "MELIYEV", "IZZATXO'JA", "ZARIFXO'JA O'G'LI", "I25D", "252650055", "202590198"),
    ("IT-Business", "MELQO'ZIYEVA", "MUQADDAMXON", "BAHROM QIZI", "I25A", "251650357", "202590199"),
    ("IT-Business", "MIRZABEKOV", "ABDULAZIZ", "MUHAMMAD O'G'LI", "I25B", "251610103", "202590200"),
    ("IT-Business", "MUMINJONOV", "ADXAMBEK", "FAZLIDDIN", "I25A", "252650787", "202590201"),
    ("IT-Business", "MURADOVA", "ZARINA", "SHERZADOVNA", "I25E", "251650193", "202590202"),
    ("IT-Business", "MURATOV", "ALIMJAN", "ARMANJANOVICH", "I25B", "252660259", "202590203"),
    ("IT-Business", "MUSHAKOV", "ANDREY", "DMITRIYEVICH", "I25D", "251650076", "202590204"),
    ("IT-Business", "MUSTAFOYEV", "MIRANSHOX", "JAMSHIDOVICH", "I25E", "252610600", "202590205"),
    ("IT-Business", "MUXAMEDJANOV", "IBROHIM", "SHAVKATOVICH", "I25E", "251610055", "202590206"),
    ("IT-Business", "MUZAFFAROVA", "ROBIYAXON", "JAHONGIR QIZI", "I25D", "251650638", "202590207"),
    ("IT-Business", "NAJMIDDINOVA", "NAZOKAT", "NAIM QIZI", "I25D", "253610628", "202590208"),
    ("IT-Business", "NORMURODOV", "SARDOR", "DILMUROD O'G'LI", "I25C", "251650595", "202590209"),
    ("IT-Business", "NORMURODOVA", "NIGINA", "ALISHER QIZI", "I25D", "252650300", "202590210"),
    ("IT-Business", "NOSIROVA", "GULIRUX", "ABDULLAYEVNA", "I25E", "253650335", "202590211"),
    ("IT-Business", "NURULLAYEV", "ELYORBEK", "XABIBULLO O'G'LI", "I25B", "252610485", "202590212"),
    ("IT-Business", "NURULLAYEVA", "FAZILAT", "SHAROF QIZI", "I25E", "252650817", "202590213"),
    ("IT-Business", "O'LJABOYEV", "ADHAMBEK", "NODIRBEKOVICH", "I25A", "252610320", "202590214"),
    ("IT-Business", "ORTIQOV", "MIRZARAXIM", "BAXRIDDIN O'G'LI", "I25B", "251610455", "202590215"),
    ("IT-Business", "OSPANOV", "BEKASIL", "BAXTIYOR O'G'LI", "I25E", "252610356", "202590216"),
    ("IT-Business", "PARAXATOV", "DILMURAT", "POLATOVICH", "I25C", "251660489", "202590217"),
    ("IT-Business", "PO'LATOVA", "MUSLIMAXON", "JAMOLIDDIN QIZI", "I25C", "252650176", "202590218"),
    ("IT-Business", "QOSIMOVA", "KAMOLA", "MANSUROVNA", "I25E", "251650273", "202590219"),
    ("IT-Business", "RADJABBOYEV", "QUDRATILLA", "QODIR O'G'LI", "I25B", "252610033", "202590220"),
    ("IT-Business", "RAIMBERDIYEVA", "ASALYA", "FARRUXOVNA", "I25D", "251610437", "202590221"),
    ("IT-Business", "RAJABBOYEV", "MURODJON", "MUZAFFAR O'G'LI", "I25D", "251610563", "202590222"),
    ("IT-Business", "RAXMONOV", "FAYOZBEK", "FAXRIDDIN O'G'LI", "I25A", "253610070", "202590223"),
    ("IT-Business", "RISBAYEVA", "FARANGIZ", "AZIZ QIZI", "I25B", "251670276", "202590224"),
    ("IT-Business", "RIXSIBOYEV", "DONIYOR", "DAVRON O'G'LI", "I25A", "251610104", "202590225"),
    ("IT-Business", "RUGACHAEVA", "ARINA", "ALEKSEEVNA", "I25A", "251670044", "202590226"),
    ("IT-Business", "RUSTAMOVA", "MUSHTARIYBEGIM", "RAVSHAN QUZI", "I25E", "253650531", "202590227"),
    ("IT-Business", "SAIDAZIZOVA", "OMINAXON", "SAIDAVAZXON QIZI", "I25B", "252650656", "202590228"),
    ("IT-Business", "SHAKRIDDINOVA", "SEVINCHXON", "SHUXRAT QIZI", "I25E", "252650814", "202590229"),
    ("IT-Business", "SULTANOVA", "MADINA", "SULTANBAY QIZI", "I25B", "252610293", "202590230"),
    ("IT-Business", "SXAY", "NIKITA", "YUREVICH", "I25C", "252650018", "202590231"),
    ("IT-Business", "TOJIBOYEVA", "MUNISA", "ABDURAXMON QIZI", "I25C", "251660325", "202590232"),
    ("IT-Business", "TO'RAYEV", "BAHODIR", "RUSTAM O'G'LI", "I25D", "253650193", "202590233"),
    ("IT-Business", "TOYIROV", "BEHRO'Z", "USMONOVICH", "I25A", "252650464", "202590234"),
    ("IT-Business", "TURSUNALIYEVA", "ZAHROXON", "UMIDJON QIZI", "I25B", "253610623", "202590235"),
    ("IT-Business", "TURSUNBOYEV", "SARDORBEK", "ERKIN O'GLI", "I25E", "252610602", "202590236"),
    ("IT-Business", "TURSUNOV", "MUHAMMAD XUSAYN", "RASULJON O'G'LI", "I25A", "251610162", "202590237"),
    ("IT-Business", "TUYGUNOV", "ABDUJALIL", "MIRJASUR O'G'LI", "I25B", "251610180", "202590238"),
    ("IT-Business", "TYO", "STANISLAV", "DMITRIEVICH", "I25A", "251650540", "202590239"),
    # Page 3
    ("IT-Business", "TYO", "VLADISLAV", "SERGEYEVICH", "I25D", "252650260", "202590240"),
    ("IT-Business", "UZAQBERGENOV", "SUNNETULLA", "KADIRBERGEN ULI", "I25B", "252650841", "202590241"),
    ("IT-Business", "XALILOV", "MUHAMMAD SOLIH", "MAXMUDJON O'G'LI", "I25E", "252610727", "202590242"),
    ("IT-Business", "XAMIDULLAYEVA", "XAMIDULLAYEVA", "ZARIFA", "I25C", "253650119", "202590243"),
    ("IT-Business", "XASANBOYEVA", "IRODA", "JAMSHID QIZI", "I25C", "252650337", "202590244"),
    ("IT-Business", "XASANOVA", "TAXMINA", "ULUG'BEKOVNA", "I25D", "253610390", "202590245"),
    ("IT-Business", "XOJAKBAROVA", "GULSANAM", "JAMSHID QIZI", "I25A", "253650255", "202590246"),
    ("IT-Business", "XOLIQJONOV", "XUMOYUN", "SHAVKAT O'G'LI", "I25A", "252650745", "202590247"),
    ("IT-Business", "ZOITOVA", "NOZIMA", "SODIQJON QIZI", "I25A", "252650345", "202590248"),
    ("IT-Business", "ZOYIRJONOV", "MUHAMMADZOHID", "DAVRON O'G'LI", "I25B", "252660589", "202590249"),
    ("IT-Business", "ZUFARALIYEV", "ZAFARALI", "ZUFARALIYEVICH", "I25A", "252610283", "202590250"),
)

OFFICIAL_STUDENT_ROSTER: dict[str, StudentRosterEntry] = {
    row[6]: StudentRosterEntry(
        department=row[0],
        last_name=row[1],
        first_name=row[2],
        fathers_name=row[3],
        group_no=row[4],
        examination_no=row[5],
        student_id=row[6],
    )
    for row in _RAW_STUDENT_ROSTER
}


@dataclass(frozen=True, slots=True)
class StudentProfileInfo:
    """Resolved student profile metadata."""

    user_id: uuid.UUID
    student_id: str
    display_name: str
    first_name: str
    last_name: str
    fathers_name: str
    department: str
    group_no: str
    examination_no: str | None
    must_change_password: bool
    roles: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class StudentAuthResult:
    """Outcome of student login or password change."""

    access_token: str
    expires_in: int
    profile: StudentProfileInfo


# A dummy hash computed once at import time so unknown-student-ID login
# attempts perform the same PBKDF2 work as valid ones (preventing timing leaks).
_DUMMY_PASSWORD_HASH: str = hash_password("dummy-timing-guard-password")


def validate_password_strength(
    new_password: str,
    *,
    student_id: str | None = None,
    confirm_password: str | None = None,
) -> list[str]:
    """Check password complexity rules and return a list of violation messages.

    Standard requirements:
    1. At least 6 characters (and at most 256).
    2. At least one uppercase letter (A-Z).
    3. At least one lowercase letter (a-z).
    4. At least one digit (0-9).
    5. At least one special character (non-alphanumeric symbol).
    6. Must not equal the student's ``student_id``.
    7. Must match ``confirm_password`` when provided.
    """
    violations: list[str] = []

    if len(new_password) < MIN_PASSWORD_LENGTH:
        violations.append(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."
        )
    if len(new_password) > MAX_PASSWORD_LENGTH:
        violations.append(
            f"Password must not exceed {MAX_PASSWORD_LENGTH} characters."
        )
    if not any(ch.isupper() for ch in new_password):
        violations.append("Password must contain at least one uppercase letter (A-Z).")
    if not any(ch.islower() for ch in new_password):
        violations.append("Password must contain at least one lowercase letter (a-z).")
    if not any(ch.isdigit() for ch in new_password):
        violations.append("Password must contain at least one number (0-9).")
    if not any(not ch.isalnum() and not ch.isspace() for ch in new_password):
        violations.append(
            "Password must contain at least one special character (e.g. !@#$%^&*)."
        )
    if student_id and new_password.strip() == student_id.strip():
        violations.append("New password cannot be the same as your Student ID.")
    if confirm_password is not None and new_password != confirm_password:
        violations.append("Password confirmation does not match the new password.")

    return violations


def _build_profile(
    user: AppUser,
    student_id: str,
    *,
    must_change_password: bool,
) -> StudentProfileInfo:
    entry = OFFICIAL_STUDENT_ROSTER.get(student_id)
    role_scope = next(
        (r.scope for r in user.roles if r.role is Role.student and r.scope),
        None,
    )
    roles = tuple(sorted(r.value for r in (user.role_set or frozenset({Role.student}))))

    if entry is not None:
        return StudentProfileInfo(
            user_id=user.id,
            student_id=student_id,
            display_name=user.display_name or entry.full_name,
            first_name=entry.first_name,
            last_name=entry.last_name,
            fathers_name=entry.fathers_name,
            department=entry.department,
            group_no=entry.group_no,
            examination_no=entry.examination_no,
            must_change_password=must_change_password,
            roles=roles,
        )

    parts = (user.display_name or student_id).split(" ", 2)
    last_name = parts[0] if len(parts) >= 1 else ""
    first_name = parts[1] if len(parts) >= 2 else ""
    fathers_name = parts[2] if len(parts) >= 3 else ""
    return StudentProfileInfo(
        user_id=user.id,
        student_id=student_id,
        display_name=user.display_name or student_id,
        first_name=first_name,
        last_name=last_name,
        fathers_name=fathers_name,
        department="IT-Business",
        group_no=role_scope or "",
        examination_no=None,
        must_change_password=must_change_password,
        roles=roles,
    )


async def _ensure_student_user(
    session: AsyncSession,
    student_id: str,
) -> AppUser | None:
    """Look up a student account by ``student_id``, auto-provisioning from the
    official university roster on first access if not yet stored in ``app_user``.
    """
    clean_id = student_id.strip()
    if not clean_id:
        return None

    ext_ref = f"{STUDENT_REF_PREFIX}{clean_id}"
    res = await session.execute(select(AppUser).where(AppUser.external_ref == ext_ref))
    user = res.scalar_one_or_none()
    if user is not None:
        return user

    entry = OFFICIAL_STUDENT_ROSTER.get(clean_id)
    if entry is None:
        return None

    user = AppUser(
        external_ref=entry.external_ref,
        display_name=entry.full_name,
        password_hash=hash_password(entry.student_id),
        is_active=True,
        is_demo=False,
    )
    session.add(user)
    await session.flush()

    role_row = UserRole(
        user_id=user.id,
        role=Role.student,
        scope=entry.group_no,
    )
    session.add(role_row)
    await session.flush()
    await session.refresh(user)
    return user


async def seed_student_roster(session: AsyncSession) -> dict[str, int]:
    """Idempotently seed all official university students into ``app_user``.

    Existing accounts keep their current ``password_hash`` so a student who has
    already changed their password is never reset back to the default ID.
    """
    existing_rows = (
        await session.scalars(
            select(AppUser).where(AppUser.external_ref.like(f"{STUDENT_REF_PREFIX}%"))
        )
    ).all()
    by_ref = {u.external_ref: u for u in existing_rows if u.external_ref}

    created = 0
    updated = 0
    for student_id, entry in OFFICIAL_STUDENT_ROSTER.items():
        user = by_ref.get(entry.external_ref)
        if user is None:
            user = AppUser(
                external_ref=entry.external_ref,
                display_name=entry.full_name,
                password_hash=hash_password(student_id),
                is_active=True,
                is_demo=False,
            )
            session.add(user)
            await session.flush()
            session.add(
                UserRole(
                    user_id=user.id,
                    role=Role.student,
                    scope=entry.group_no,
                )
            )
            created += 1
        else:
            user.display_name = entry.full_name
            updated += 1

    await session.flush()
    return {
        "created": created,
        "updated": updated,
        "total": len(OFFICIAL_STUDENT_ROSTER),
    }


async def authenticate_student(
    session: AsyncSession,
    *,
    student_id: str,
    password: str,
    settings: Settings | None = None,
    request_id: str | None = None,
) -> StudentAuthResult:
    """Authenticate a university student by ``student_id`` and ``password``."""
    cfg = settings or get_settings()
    clean_id = student_id.strip()

    user = await _ensure_student_user(session, clean_id)
    if user is None or not user.password_hash:
        verify_password(password, _DUMMY_PASSWORD_HASH)
        session.add(
            AuditLog(
                at=now(),
                action="auth.student_login.failed",
                actor_label=clean_id or "unknown",
                outcome="denied",
                request_id=request_id,
                details={"reason": "unknown_student_id"},
            )
        )
        await session.commit()
        raise AuthenticationError(
            "Invalid Student ID or password. Only registered university students can sign in.",
            code="invalid_credentials",
        )

    password_ok = verify_password(password, user.password_hash)
    if not user.is_active or not password_ok:
        session.add(
            AuditLog(
                at=now(),
                actor_id=user.id,
                actor_label=clean_id,
                action="auth.student_login.failed",
                outcome="denied",
                request_id=request_id,
                details={"reason": "invalid_password_or_inactive"},
            )
        )
        await session.commit()
        raise AuthenticationError(
            "Invalid Student ID or password.",
            code="invalid_credentials",
        )

    # Since password_ok is True, the student is still on their default password
    # if and only if the password they just authenticated with equals their student_id.
    must_change_password = password == clean_id
    roles = user.role_set or frozenset({Role.student})
    profile = _build_profile(user, clean_id, must_change_password=must_change_password)

    token = create_access_token(
        str(user.id),
        roles,
        settings=cfg,
    )

    user.last_seen_at = now()
    session.add(
        AuditLog(
            at=now(),
            actor_id=user.id,
            actor_label=clean_id,
            action="auth.student_login.succeeded",
            target_type="app_user",
            target_id=str(user.id),
            request_id=request_id,
            details={
                "student_id": clean_id,
                "group_no": profile.group_no,
                "must_change_password": must_change_password,
            },
        )
    )
    await session.commit()

    return StudentAuthResult(
        access_token=token,
        expires_in=cfg.jwt_access_ttl_seconds,
        profile=profile,
    )


async def change_student_password(
    session: AsyncSession,
    *,
    new_password: str,
    confirm_password: str | None = None,
    current_password: str | None = None,
    examination_no: str | None = None,
    student_id: str | None = None,
    authenticated_user_id: uuid.UUID | None = None,
    settings: Settings | None = None,
    request_id: str | None = None,
) -> StudentAuthResult:
    """Change or reset a student's password after enforcing password policy."""
    cfg = settings or get_settings()
    user: AppUser | None = None
    resolved_student_id: str = (student_id or "").strip()

    if authenticated_user_id is not None:
        user = await session.get(AppUser, authenticated_user_id)
        if user is None or not user.is_active:
            raise NotFoundError("Authenticated user account was not found.", code="user_not_found")
        if user.external_ref and user.external_ref.startswith(STUDENT_REF_PREFIX):
            resolved_student_id = user.external_ref[len(STUDENT_REF_PREFIX) :]
        if current_password is not None:
            if not user.password_hash or not verify_password(current_password, user.password_hash):
                raise AuthenticationError(
                    "Current password is incorrect.",
                    code="invalid_credentials",
                )
    else:
        if not resolved_student_id:
            raise ValidationError(
                "Either an Authorization token or a student_id is required to change the password.",
                code="missing_student_id",
            )
        user = await _ensure_student_user(session, resolved_student_id)
        if user is None or not user.is_active or not user.password_hash:
            verify_password(current_password or "x", _DUMMY_PASSWORD_HASH)
            raise AuthenticationError(
                "Invalid Student ID or current password.",
                code="invalid_credentials",
            )

        roster_entry = OFFICIAL_STUDENT_ROSTER.get(resolved_student_id)
        verified = False
        if current_password is not None and verify_password(current_password, user.password_hash):
            verified = True
        elif (
            examination_no is not None
            and roster_entry is not None
            and examination_no.strip() == roster_entry.examination_no
        ):
            verified = True
        elif current_password is None and verify_password(resolved_student_id, user.password_hash):
            # First-time password change when account still has the default student_id password
            verified = True

        if not verified:
            session.add(
                AuditLog(
                    at=now(),
                    actor_id=user.id,
                    actor_label=resolved_student_id,
                    action="auth.student_password.change_failed",
                    outcome="denied",
                    request_id=request_id,
                )
            )
            await session.commit()
            raise AuthenticationError(
                "Current password is incorrect.",
                code="invalid_credentials",
            )

    violations = validate_password_strength(
        new_password,
        student_id=resolved_student_id or None,
        confirm_password=confirm_password,
    )
    if not violations and user.password_hash and verify_password(new_password, user.password_hash):
        violations.append("New password must be different from your current password.")

    if violations:
        raise ValidationError(
            " ".join(violations),
            code="weak_password",
            details={
                "violations": violations,
                "requirements": list(PASSWORD_REQUIREMENTS),
            },
        )

    user.password_hash = hash_password(new_password)
    user.last_seen_at = now()

    roles = user.role_set or frozenset({Role.student})
    profile = _build_profile(user, resolved_student_id, must_change_password=False)

    token = create_access_token(
        str(user.id),
        roles,
        settings=cfg,
    )

    session.add(
        AuditLog(
            at=now(),
            actor_id=user.id,
            actor_label=resolved_student_id or str(user.id),
            action="auth.student_password.changed",
            target_type="app_user",
            target_id=str(user.id),
            request_id=request_id,
            details={"student_id": resolved_student_id},
        )
    )
    await session.commit()

    return StudentAuthResult(
        access_token=token,
        expires_in=cfg.jwt_access_ttl_seconds,
        profile=profile,
    )


async def get_student_profile_for_user(
    session: AsyncSession,
    user_id: uuid.UUID,
) -> StudentProfileInfo | None:
    """Return student profile metadata for an authenticated ``user_id``, if applicable."""
    user = await session.get(AppUser, user_id)
    if user is None or not user.external_ref:
        return None
    if not user.external_ref.startswith(STUDENT_REF_PREFIX):
        return None
    student_id = user.external_ref[len(STUDENT_REF_PREFIX) :]
    must_change = bool(
        user.password_hash and verify_password(student_id, user.password_hash)
    )
    return _build_profile(user, student_id, must_change_password=must_change)
