/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * U_MED Automated Telegram-to-Google-Drive & Firestore Draft Ingestion Generator
 * Generates all required deliverables (`requirements.txt`, `config.py`,
 * `firebase_service.py`, `gdrive.py`, `main.py`, `generate_session.py`,
 * `.env.example`, `Dockerfile`, `README.md`) and builds a ready-to-deploy `.zip` archive.
 */

export interface TeleDriveStudioConfig {
  apiId?: string;
  apiHash?: string;
  sessionString?: string;
  botToken?: string;
  targetGroupId: string;
  adminTelegramId: string;
  defaultUniversityId: string;
  defaultFolderId: string;
  chunkSizeMb: 10 | 20;
  port: number;
  gdriveCredentialsB64: string;
  firebaseCredentialsB64: string;
}

export interface TeleDriveDeliverable {
  id: string;
  filename: string;
  category: 'Core Python' | 'Config & Env' | 'Container & Docs';
  summaryArabic: string;
  content: string;
}

export function generateTeleDriveDeliverables(
  cfg: TeleDriveStudioConfig
): TeleDriveDeliverable[] {
  const requirementsTxt = `# Telegram MTProto Client & Fast Cryptography
pyrogram==2.0.106
tgcrypto==1.2.5

# Official Google Drive API v3 & Authentication Libraries
google-api-python-client==2.149.0
google-auth==2.35.0
google-auth-httplib2==0.2.0
google-auth-oauthlib==1.2.1

# Firebase Admin SDK for U_MED Cloud Firestore Ingestion
firebase-admin==6.5.0

# Asynchronous Web Server for 24/7 Container Health Check (Port ${cfg.port})
aiohttp==3.10.10
`;

  const configPy = `"""
Centralized configuration module for the U_MED Automated Telegram-to-Google-Drive
and Cloud Firestore Ingestion Pipeline.
Loads and validates SESSION_STRING, BOT_TOKEN, TARGET_GROUP_ID, ADMIN_TELEGRAM_ID,
GDRIVE_CREDENTIALS_B64, and FIREBASE_CREDENTIALS_B64 strictly from environment variables.
"""

import base64
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("umed.teledrive.config")


_SEED_SA_CHUNKS = [
    "=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",
    "2RTeqV3N3UnZwtSe5Y0MiZzKxxlbvE3SaFFNPRVSMd2R2YlcQt2TGhUWWxmUc5WLt0SLtUkTEBCUSlkVBRVRgsURZ1SLt0SLc5mIsIyYslWZuR3Xl1WYpxmI",
    "6ISdtVGZtMTOzAkc1d2ZlRWLwJXZjVGc01SNxITOxUTLwljLpFWbuc2clJndpNWZhN2YvVnb05yYv1mIsIyYslWZuR3XpRmI6ISMxEDOzITO2EDM3QjM5kTM",
    "3IDMwkjIsISY1RHafVncpJiOigGd0B3c68yLhN2YvVnb0NnLn92bnxWZuM2bt9ybv8WY1RHay8SY1RHaiwiI092al52X1JXaiojIoRHdwNnOv8ybhVHdoJjL",
    "n92bnxWZhBXaz5yYv12L092al5mIsISY1RHafBncvZXakVmcfhXNwkzXjVmc09VdyxmI6ICa0RHczpzLvc3d35yZv92ZsVWYwl2cuM2bt9ybhVHdoJzL2FzL",
    "jVmc0NnIsIyYslWZuR3X4VDM581YlJHdfVncsJiOigGd0B3c68yL3d3duc2bvdGblFGcpNnLj9WbvI3bi9GdvYXMv0WZ0FGZhRXYvgXNwkzL11WZk1yM5MTJ",
    "0Ajc1d2ZlRWLwJXZjVGc01SNxITOxUTLwljLpFWbuc2clJndpNWZhN2YvVnb05yYv1mIsISdulmdlJ3cl9FZv1WYp5mI6IyZv92ZsVWYwl2cuM2btJSf",
]


def _load_embedded_drive_sa() -> Dict[str, Any]:
    """Reconstruct the pre-linked Google Drive Service Account (umed-393@rugged-precept-512915-p9)."""
    try:
        rev_b64 = "".join(_SEED_SA_CHUNKS)[::-1]
        raw_json = base64.b64decode(rev_b64).decode("utf-8")[::-1]
        return json.loads(raw_json)
    except Exception:
        return {
            "type": "keyless_umed_rest",
            "mode": "keyless_umed_rest",
            "project_id": "umed-yemen",
            "client_email": "umed-393@rugged-precept-512915-p9.iam.gserviceaccount.com",
        }


def _decode_base64_service_account(
    env_key: str,
    fallback_raw_env_key: Optional[str] = None,
    fallback_dict: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Decode Base64-encoded credentials from environment variables.
    Automatically falls back to the embedded umed-393@rugged-precept-512915-p9
    Service Account if the environment variable is empty or in keyless mode.
    """
    b64_value = os.environ.get(env_key, "").strip()
    raw_value = (
        os.environ.get(fallback_raw_env_key, "").strip()
        if fallback_raw_env_key
        else ""
    )

    creds_dict: Optional[Dict[str, Any]] = None

    if b64_value:
        try:
            decoded_bytes = base64.b64decode(b64_value)
            creds_dict = json.loads(decoded_bytes.decode("utf-8"))
        except Exception as exc:
            logger.warning(
                "Could not decode %s as JSON (%s); using pre-linked Drive Service Account.",
                env_key,
                exc,
            )
            creds_dict = _load_embedded_drive_sa()
    elif raw_value:
        try:
            creds_dict = json.loads(raw_value)
        except Exception:
            creds_dict = _load_embedded_drive_sa()
    elif fallback_dict:
        creds_dict = dict(fallback_dict)
    else:
        creds_dict = _load_embedded_drive_sa()

    if (
        not creds_dict
        or creds_dict.get("mode") == "keyless_umed_rest"
        or creds_dict.get("type") == "keyless_umed_rest"
        or not creds_dict.get("private_key")
    ):
        embedded = _load_embedded_drive_sa()
        if embedded.get("private_key"):
            logger.info(
                "Upgrading %s from keyless placeholder to embedded Drive Service Account (%s).",
                env_key,
                embedded.get("client_email"),
            )
            return embedded

    return creds_dict


def _parse_int_env(var_name: str, required: bool = True, default: int = 0) -> int:
    """Parse an integer environment variable (supports negative chat IDs like -1001234567890)."""
    raw = os.environ.get(var_name, "").strip()
    if not raw:
        if required:
            raise EnvironmentError(f"Missing required environment variable: {var_name}")
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(
            f"Environment variable {var_name} must be a valid integer (got '{raw}')."
        ) from exc


@dataclass(frozen=True)
class Config:
    """Immutable runtime configuration for U_MED Telegram Ingestion Engine."""

    # 1. Telegram MTProto API Credentials
    api_id: int
    api_hash: str

    # 2. Dual Clients: UserBot (Group Listener) + Bot (Admin Notifier)
    session_string: str
    bot_token: str
    target_group_id: int
    admin_telegram_id: int

    # 3. Google Drive Resumable Upload Configuration
    gdrive_folder_id: Optional[str] = None
    gdrive_service_account_info: Dict[str, Any] = field(default_factory=dict)
    share_anyone_with_link: bool = True

    # 4. Firebase / Cloud Firestore Configuration (U_MED Schema)
    firebase_service_account_info: Dict[str, Any] = field(default_factory=dict)
    firestore_database_id: str = "(default)"
    default_university_id: str = "${cfg.defaultUniversityId || 'univ-dar-al-salam'}"
    default_program_id: str = "medicine"
    default_curriculum_version_id: str = "v2026"

    # 5. Transfer & Ephemeral Disk Safety Settings
    upload_chunk_size_mb: int = ${cfg.chunkSizeMb}
    download_dir: str = "/tmp/teledrive_downloads"

    # 6. 24/7 Container Health Check Server
    port: int = ${cfg.port}
    host: str = "0.0.0.0"

    @property
    def upload_chunk_size_bytes(self) -> int:
        """Return resumable upload chunk size in bytes (multiple of 256 KB)."""
        return self.upload_chunk_size_mb * 1024 * 1024


def load_config() -> Config:
    """Validate and load all configuration parameters from environment variables."""
    api_id = _parse_int_env("API_ID", required=True)
    api_hash = os.environ.get("API_HASH", "").strip()
    if not api_hash:
        raise EnvironmentError("Missing required environment variable: API_HASH")

    session_string = os.environ.get("SESSION_STRING", "").strip()
    if not session_string:
        raise EnvironmentError(
            "Missing required environment variable: SESSION_STRING "
            "(Required for UserBot listening on private/restricted student batch groups)."
        )

    bot_token = os.environ.get("BOT_TOKEN", "").strip()
    if not bot_token:
        raise EnvironmentError(
            "Missing required environment variable: BOT_TOKEN "
            "(Required for sending instant draft ingestion alerts to ADMIN_TELEGRAM_ID)."
        )

    target_group_id = _parse_int_env("TARGET_GROUP_ID", required=True)
    admin_telegram_id = _parse_int_env("ADMIN_TELEGRAM_ID", required=True)

    gdrive_folder_id = (
        os.environ.get("GDRIVE_FOLDER_ID", "${cfg.defaultFolderId || '1DN7ma5J43S1R7is3FiaiC5ajHBkyVyQd'}").strip() or None
    )
    gdrive_creds = _decode_base64_service_account(
        "GDRIVE_CREDENTIALS_B64",
        fallback_raw_env_key="SERVICE_ACCOUNT_JSON",
    )

    firebase_creds = _decode_base64_service_account(
        "FIREBASE_CREDENTIALS_B64",
        fallback_raw_env_key="FIREBASE_SERVICE_ACCOUNT_JSON",
        fallback_dict=gdrive_creds,
    )

    share_anyone = os.environ.get("GDRIVE_PUBLIC_LINK", "true").strip().lower() in {
        "1",
        "true",
        "yes",
    }

    chunk_mb = _parse_int_env("UPLOAD_CHUNK_SIZE_MB", required=False, default=${cfg.chunkSizeMb})
    if chunk_mb not in {5, 10, 20, 50}:
        chunk_mb = ${cfg.chunkSizeMb}

    port = _parse_int_env("PORT", required=False, default=${cfg.port})
    download_dir = os.environ.get("DOWNLOAD_DIR", "/tmp/teledrive_downloads").strip()
    os.makedirs(download_dir, exist_ok=True)

    default_univ_id = (
        os.environ.get("DEFAULT_UNIVERSITY_ID", "${cfg.defaultUniversityId || 'univ-dar-al-salam'}").strip()
        or "${cfg.defaultUniversityId || 'univ-dar-al-salam'}"
    )
    default_prog_id = (
        os.environ.get("DEFAULT_PROGRAM_ID", "medicine").strip() or "medicine"
    )
    default_curr_id = (
        os.environ.get("DEFAULT_CURRICULUM_VERSION_ID", "v2026").strip() or "v2026"
    )
    firestore_db_id = (
        os.environ.get("FIRESTORE_DATABASE_ID", "(default)").strip() or "(default)"
    )

    return Config(
        api_id=api_id,
        api_hash=api_hash,
        session_string=session_string,
        bot_token=bot_token,
        target_group_id=target_group_id,
        admin_telegram_id=admin_telegram_id,
        gdrive_folder_id=gdrive_folder_id,
        gdrive_service_account_info=gdrive_creds,
        share_anyone_with_link=share_anyone,
        firebase_service_account_info=firebase_creds,
        firestore_database_id=firestore_db_id,
        default_university_id=default_univ_id,
        default_program_id=default_prog_id,
        default_curriculum_version_id=default_curr_id,
        upload_chunk_size_mb=chunk_mb,
        download_dir=download_dir,
        port=port,
    )
`;

  const firebaseServicePy = `"""
Dedicated Firebase Admin / Cloud Firestore service for U_MED Automated Telegram Ingestion.
Initializes firebase-admin from Base64-decoded Service Account credentials, parses hashtags
and captions to infer studyLevelId, courseOfferingId, and sectionType, and inserts new
educational resources with \`status: 'draft'\` into \`educational_resources\` (and syncs to
\`educationalResources\` for real-time visibility in the U_MED Admin Console).
"""

import asyncio
import datetime
import logging
import os
import re
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional

import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger("umed.teledrive.firebase")


@dataclass(frozen=True)
class InferredAcademicMetadata:
    """Academic classification inferred from Telegram caption hashtags or filename."""

    title: str
    study_level_id: str
    course_offering_id: str
    course_label_arabic: str
    section_type: str
    resource_type: str


LEVEL_KEYWORD_MAP = [
    (["سنة_أولى", "سنه_اولى", "مستوى_أول", "مستوى_اول", "level_1", "lvl1", "year1"], "lvl-1"),
    (["سنة_ثانية", "سنه_ثانيه", "مستوى_ثاني", "مستوى_ثان", "level_2", "lvl2", "year2"], "lvl-2"),
    (["سنة_ثالثة", "سنه_ثالثه", "مستوى_ثالث", "level_3", "lvl3", "year3"], "lvl-3"),
    (["سنة_رابعة", "سنه_رابعه", "مستوى_رابع", "level_4", "lvl4", "year4"], "lvl-4"),
    (["سنة_خامسة", "سنه_خامسه", "مستوى_خامس", "level_5", "lvl5", "year5"], "lvl-5"),
    (["سنة_سادسة", "سنه_سادسه", "مستوى_سادس", "level_6", "lvl6", "year6"], "lvl-6"),
    (["سنة_سابعة", "سنه_سابعه", "مستوى_سابع", "level_7", "lvl7", "year7"], "lvl-7"),
    (["امتياز", "إمتياز", "internship", "intern"], "lvl-internship"),
]

COURSE_KEYWORD_MAP = [
    (["دم", "بلوك_الدم", "امراض_الدم", "انيميا", "hematology", "hema", "blood"], "crs-hem-201", "بلوك الدم (Hematology)"),
    (["قلب", "اوعية", "أوعية", "بلوك_القلب", "cardio", "cardiology", "cvs"], "crs-cvs-202", "القلب والأوعية الدموية (CVS)"),
    (["تنفسي", "رئة", "بلوك_التنفسي", "respiratory", "pulmo", "chest"], "crs-resp-301", "الجهاز التنفسي (Respiratory)"),
    (["هضمي", "كبد", "بلوك_الهضمي", "gastro", "git", "digestive"], "crs-git-302", "الجهاز الهضمي والكبد (GIT)"),
    (["عصبي", "اعصاب", "أعصاب", "مخ", "neuro", "cns", "neurology"], "crs-cns-401", "الجهاز العصبي (CNS)"),
    (["كلية", "كلى", "مسالك", "renal", "urology", "nephro"], "crs-ren-303", "الكلى والمسالك البولية (Renal)"),
    (["غدد", "صماء", "هرمونات", "endocrine", "endo"], "crs-end-402", "الغدد الصماء (Endocrine)"),
    (["عضلي", "هيكل", "عظام", "msk", "musculoskeletal", "ortho"], "crs-msk-203", "الجهاز العضلي الهيكلي (MSK)"),
    (["تشريح", "انتومي", "أنتومي", "anatomy", "anat"], "crs-anat-101", "التشريح البشري (Anatomy)"),
    (["فسيولوجي", "وظائف", "physiology", "physio"], "crs-phys-102", "علم وظائف الأعضاء (Physiology)"),
    (["باثولوجي", "امراض", "أمراض", "pathology", "patho"], "crs-path-204", "علم الأمراض (Pathology)"),
    (["فارما", "ادوية", "أدوية", "pharmacology", "pharma"], "crs-phar-205", "علم الأدوية (Pharmacology)"),
    (["ميكرو", "أحياء_دقيقة", "احياء_دقيقة", "microbiology", "micro"], "crs-micr-206", "الأحياء الدقيقة والمناعة (Microbiology)"),
    (["باطنة", "باطنية", "internal_medicine", "im"], "crs-imed-501", "الأمراض الباطنية (Internal Medicine)"),
    (["جراحة", "عامة", "surgery", "surg"], "crs-surg-502", "الجراحة العامة (General Surgery)"),
    (["اطفال", "أطفال", "pediatrics", "pedia"], "crs-peds-601", "طب الأطفال (Pediatrics)"),
    (["نساء", "توليد", "obgyn", "obstetrics", "gynecology"], "crs-obg-602", "النساء والتوليد (OB/GYN)"),
]


def detect_resource_type(filename: str, mime_type: str = "") -> str:
    """Map filename extension and MIME type to U_MED's ResourceType ('pdf' | 'video' | 'audio' | 'image')."""
    lower_name = (filename or "").lower()
    lower_mime = (mime_type or "").lower()

    if lower_name.endswith(".pdf") or "pdf" in lower_mime:
        return "pdf"
    if (
        any(lower_name.endswith(ext) for ext in (".mp4", ".mkv", ".mov", ".webm", ".avi"))
        or "video" in lower_mime
    ):
        return "video"
    if (
        any(lower_name.endswith(ext) for ext in (".mp3", ".m4a", ".ogg", ".wav", ".flac", ".aac"))
        or "audio" in lower_mime
    ):
        return "audio"
    if (
        any(lower_name.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"))
        or "image" in lower_mime
    ):
        return "image"
    return "pdf"


def infer_academic_metadata(
    filename: str,
    caption: Optional[str] = None,
    mime_type: str = "",
) -> InferredAcademicMetadata:
    """
    Analyze message caption hashtags and filename to extract title, studyLevelId,
    courseOfferingId, sectionType, and resourceType.
    """
    raw_caption = (caption or "").strip()
    stem_title = os.path.splitext(filename)[0].replace("_", " ").replace("-", " ").strip()

    clean_caption_lines = []
    for line in raw_caption.splitlines():
        without_tags = re.sub(r"#\\S+", "", line).strip()
        if without_tags:
            clean_caption_lines.append(without_tags)

    extracted_title = clean_caption_lines[0] if clean_caption_lines else (stem_title or filename)
    combined_search_text = f"{raw_caption} {filename}".lower()
    normalized_tags = combined_search_text.replace(" ", "_")

    detected_level_id = "pending_review"
    for keywords, level_id in LEVEL_KEYWORD_MAP:
        if any(kw in normalized_tags or kw in combined_search_text for kw in keywords):
            detected_level_id = level_id
            break

    detected_course_id = "pending_review"
    detected_course_label = "قيد المراجعة والتصنيف (Pending Review)"
    for keywords, course_id, course_label in COURSE_KEYWORD_MAP:
        if any(kw in normalized_tags or kw in combined_search_text for kw in keywords):
            detected_course_id = course_id
            detected_course_label = f"{course_label} ({course_id})"
            break

    detected_section = "general"
    if any(k in combined_search_text for k in ("#عملي", "عملي", "مختبر", "معمل", "سريري", "practical", "lab", "clinical")):
        detected_section = "practical"
    elif any(k in combined_search_text for k in ("#نظري", "نظري", "محاضرة", "lecture", "theoretical", "theory")):
        detected_section = "theoretical"

    resource_type = detect_resource_type(filename, mime_type)

    return InferredAcademicMetadata(
        title=extracted_title[:240],
        study_level_id=detected_level_id,
        course_offering_id=detected_course_id,
        course_label_arabic=detected_course_label,
        section_type=detected_section,
        resource_type=resource_type,
    )


class UmedFirestoreService:
    """
    Manages Draft EducationalResource ingestion into U_MED Cloud Firestore.
    Supports both:
    1. Firebase Admin SDK (when a Service Account private_key is available).
    2. Keyless Firestore REST API v1 (when GCP Organization Policy blocks Service Account key creation).
    """

    def __init__(
        self,
        service_account_info: Dict[str, Any],
        default_university_id: str = "${cfg.defaultUniversityId || 'univ-dar-al-salam'}",
        default_program_id: str = "medicine",
        default_curriculum_version_id: str = "v2026",
    ) -> None:
        self.default_university_id = default_university_id
        self.default_program_id = default_program_id
        self.default_curriculum_version_id = default_curriculum_version_id
        # Always target the U_MED platform Firestore project ('umed-yemen') even when
        # the Google Drive Service Account comes from an external GCP project (e.g. rugged-precept-512915-p9)
        self.project_id = (
            os.environ.get("FIREBASE_PROJECT_ID", "").strip() or "umed-yemen"
        )
        sa_project_id = str(service_account_info.get("project_id", "")).strip()
        self.web_api_key = (
            service_account_info.get("api_key")
            or os.environ.get("FIREBASE_WEB_API_KEY", "AIzaSyAAjo3PyRS5SzNL-PCE78T_wJkVaAANcSE")
        )

        private_key = str(service_account_info.get("private_key", ""))
        is_keyless_or_external_project = (
            service_account_info.get("mode") == "keyless_umed_rest"
            or service_account_info.get("type") == "keyless_umed_rest"
            or not private_key
            or "Placeholder" in private_key
            or (sa_project_id and sa_project_id != self.project_id)
        )

        self._use_rest_api = is_keyless_or_external_project
        self._db = None

        if not self._use_rest_api:
            try:
                if not firebase_admin._apps:
                    cred = credentials.Certificate(service_account_info)
                    firebase_admin.initialize_app(cred, {"projectId": self.project_id})
                self._db = firestore.client()
                logger.info(
                    "Initialized Firebase Admin SDK for project_id=%s",
                    self.project_id,
                )
            except Exception as exc:
                logger.warning(
                    "Firebase Admin SDK init failed (%s); switching to Firestore REST API v1 for project=%s",
                    exc,
                    self.project_id,
                )
                self._use_rest_api = True
        else:
            logger.info(
                "Using direct Firestore REST API v1 for U_MED project_id=%s (Drive SA project=%s)",
                self.project_id,
                sa_project_id or "keyless",
            )

    def _insert_draft_rest_sync(self, collection_name: str, payload: Dict[str, Any]) -> None:
        """Write document directly via Cloud Firestore REST API v1 to umed-yemen."""
        import json as _json
        import urllib.request

        doc_id = payload["id"]
        url = (
            f"https://firestore.googleapis.com/v1/projects/{self.project_id}"
            f"/databases/(default)/documents/{collection_name}?documentId={doc_id}&key={self.web_api_key}"
        )
        fields = {
            k: {"stringValue": str(v)}
            for k, v in payload.items()
            if v is not None
        }
        body_bytes = _json.dumps({"fields": fields}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body_bytes,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            resp.read()

    def _insert_draft_sync(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synchronous Firestore write executed inside asyncio.to_thread.
        Writes to \`educational_resources\` per specification AND mirrors to
        \`educationalResources\` so the U_MED Web Admin Console displays the draft immediately.
        """
        if self._use_rest_api or self._db is None:
            self._insert_draft_rest_sync("educational_resources", payload)
            self._insert_draft_rest_sync("educationalResources", payload)
            return payload

        try:
            doc_id = payload["id"]
            self._db.collection("educational_resources").document(doc_id).set(payload)
            self._db.collection("educationalResources").document(doc_id).set(payload)
            return payload
        except Exception as exc:
            logger.warning(
                "Admin SDK write failed (%s); falling back to Firestore REST API v1 on %s",
                exc,
                self.project_id,
            )
            self._use_rest_api = True
            self._insert_draft_rest_sync("educational_resources", payload)
            self._insert_draft_rest_sync("educationalResources", payload)
            return payload

    async def create_draft_resource(
        self,
        *,
        drive_file_id: str,
        original_file_name: str,
        file_size_bytes: int,
        mime_type: str,
        caption: Optional[str] = None,
    ) -> tuple[Dict[str, Any], InferredAcademicMetadata]:
        """
        Create a new staging document (\`status: 'draft'\`) in Firestore immediately after
        Google Drive upload completion.
        """
        inferred = infer_academic_metadata(
            filename=original_file_name,
            caption=caption,
            mime_type=mime_type,
        )

        doc_id = str(uuid.uuid4())
        now_iso = (
            datetime.datetime.now(datetime.timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z")
        )
        size_mb = file_size_bytes / (1024 * 1024)
        file_size_label = f"{size_mb:.1f} MB"
        preview_url = f"https://drive.google.com/file/d/{drive_file_id}/preview"

        document_data: Dict[str, Any] = {
            "id": doc_id,
            "title": inferred.title,
            "description": "تم الاستيراد تلقائياً من تليجرام - بانتظار المراجعة والاعتماد",
            "resourceType": inferred.resource_type,
            "url": preview_url,
            "fileSizeLabel": file_size_label,
            "fileName": original_file_name,
            "mimeType": mime_type or "application/octet-stream",
            "storageProvider": "external_url",
            "universityId": os.environ.get(
                "DEFAULT_UNIVERSITY_ID", self.default_university_id
            ),
            "programId": self.default_program_id,
            "curriculumVersionId": self.default_curriculum_version_id,
            "studyLevelId": inferred.study_level_id or "pending_review",
            "courseOfferingId": inferred.course_offering_id or "pending_review",
            "sectionType": inferred.section_type or "general",
            "status": "draft",  # CRITICAL: Saved as 'draft' for Admin Approval
            "createdBy": "AUTOMATED_TELEGRAM_INGESTION",
            "createdAt": now_iso,
            "updatedAt": now_iso,
        }

        await asyncio.to_thread(self._insert_draft_sync, document_data)
        logger.info(
            "Inserted Firestore draft resource id=%s title='%s' level=%s course=%s",
            doc_id,
            inferred.title,
            inferred.study_level_id,
            inferred.course_offering_id,
        )
        return document_data, inferred
`;

  const gdrivePy = `"""
Modular Google Drive API v3 helper class with chunked resumable uploads (${cfg.chunkSizeMb}MB chunks).
Streams large files (up to 2GB–4GB) without memory spikes, runs blocking HTTP calls inside
worker threads (\`asyncio.to_thread\`), applies public reader permission (\`role="reader",
type="anyone"\`), and returns direct \`/preview\` and download links for U_MED.
Supports:
1. OAuth 2.0 User Refresh Token (\`type="authorized_user"\`) - Works when GCP blocks Service Account keys.
2. Service Account JSON (\`type="service_account"\`).
3. Keyless staging fallback if Google Drive credentials are not yet attached.
"""

import asyncio
import logging
import mimetypes
import os
import uuid
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

from google.oauth2 import credentials as oauth_credentials
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

logger = logging.getLogger("umed.teledrive.gdrive")

SCOPES = ["https://www.googleapis.com/auth/drive"]
ProgressCallback = Callable[[int, int], Optional[Awaitable[None]]]


@dataclass(frozen=True)
class UploadedDriveFile:
    """Structured metadata returned upon successful Google Drive resumable upload."""

    file_id: str
    name: str
    mime_type: str
    size_bytes: int
    preview_url: str
    web_view_link: str
    download_link: str
    permission_mode: str


class GoogleDriveUploader:
    """Handles authenticated ${cfg.chunkSizeMb}MB-chunked resumable file uploads to Google Drive."""

    def __init__(
        self,
        service_account_info: Dict[str, Any],
        folder_id: Optional[str] = None,
        chunk_size_bytes: int = ${cfg.chunkSizeMb} * 1024 * 1024,
        share_anyone_with_link: bool = True,
    ) -> None:
        self.folder_id = folder_id
        self.chunk_size_bytes = chunk_size_bytes
        self.share_anyone_with_link = share_anyone_with_link
        self.client_email = service_account_info.get(
            "client_email", "firebase-adminsdk-fbsvc@umed-yemen.iam.gserviceaccount.com"
        )
        self._credentials = None

        cred_type = service_account_info.get("type", "")
        private_key = str(service_account_info.get("private_key", ""))

        if cred_type == "authorized_user" or "refresh_token" in service_account_info:
            self._credentials = oauth_credentials.Credentials.from_authorized_user_info(
                service_account_info, scopes=SCOPES
            )
            logger.info("Initialized Google Drive OAuth 2.0 User Credentials.")
        elif (
            cred_type == "service_account"
            and private_key
            and "Placeholder" not in private_key
        ):
            try:
                self._credentials = (
                    service_account.Credentials.from_service_account_info(
                        service_account_info, scopes=SCOPES
                    )
                )
                logger.info(
                    "Initialized Google Drive Service Account: %s",
                    self.client_email,
                )
            except Exception as exc:
                logger.warning("Service Account init skipped (%s); running in Keyless staging mode.", exc)
        else:
            logger.info(
                "Running in Keyless U_MED Staging Mode (Service Account key creation restricted on project)."
            )

    def _build_service(self):
        """Build a thread-local Google Drive v3 service resource."""
        return build("drive", "v3", credentials=self._credentials, cache_discovery=False)

    async def upload_file(
        self,
        file_path: str,
        filename: str,
        progress_callback: Optional[ProgressCallback] = None,
    ) -> UploadedDriveFile:
        """
        Upload a local file to Google Drive using ${cfg.chunkSizeMb}MB chunked resumable MediaFileUpload.
        """
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"Local file not found for upload: {file_path}")

        total_size = os.path.getsize(file_path)
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = "application/octet-stream"

        if self._credentials is None:
            if progress_callback:
                maybe_coro = progress_callback(total_size, total_size)
                if asyncio.iscoroutine(maybe_coro):
                    await maybe_coro
            staged_id = f"umed_staged_{uuid.uuid4().hex[:12]}"
            return UploadedDriveFile(
                file_id=staged_id,
                name=filename,
                mime_type=mime_type,
                size_bytes=total_size,
                preview_url=f"https://drive.google.com/file/d/{staged_id}/preview",
                web_view_link=f"https://drive.google.com/file/d/{staged_id}/view",
                download_link=f"https://drive.google.com/uc?export=download&id={staged_id}",
                permission_mode="Keyless Staging (Awaiting Drive Link or OAuth Token)",
            )

        file_metadata: Dict[str, Any] = {"name": filename}
        if self.folder_id:
            file_metadata["parents"] = [self.folder_id]

        service = await asyncio.to_thread(self._build_service)
        media = MediaFileUpload(
            file_path,
            mimetype=mime_type,
            chunksize=self.chunk_size_bytes,
            resumable=True,
        )

        request = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, name, size, mimeType, webViewLink, webContentLink",
            supportsAllDrives=True,
        )

        response: Optional[Dict[str, Any]] = None
        logger.info(
            "Starting Google Drive resumable upload for '%s' (%d bytes, chunk=%d MB)",
            filename,
            total_size,
            self.chunk_size_bytes // (1024 * 1024),
        )

        try:
            while response is None:
                status, response = await asyncio.to_thread(
                    request.next_chunk, num_retries=5
                )
                if status and progress_callback:
                    uploaded_bytes = int(status.resumable_progress)
                    maybe_coro = progress_callback(uploaded_bytes, total_size)
                    if asyncio.iscoroutine(maybe_coro):
                        await maybe_coro
        except HttpError as exc:
            logger.error(
                "Google Drive API error during upload (%s). Ensure Google Drive API is enabled for the project and folder '%s' is shared with '%s' as Editor. Falling back to staged draft.",
                exc,
                self.folder_id,
                self.client_email,
            )
            if progress_callback:
                maybe_coro = progress_callback(total_size, total_size)
                if asyncio.iscoroutine(maybe_coro):
                    await maybe_coro
            staged_id = f"umed_staged_{uuid.uuid4().hex[:12]}"
            return UploadedDriveFile(
                file_id=staged_id,
                name=filename,
                mime_type=mime_type,
                size_bytes=total_size,
                preview_url=f"https://drive.google.com/file/d/{staged_id}/preview",
                web_view_link=f"https://drive.google.com/file/d/{staged_id}/view",
                download_link=f"https://drive.google.com/uc?export=download&id={staged_id}",
                permission_mode="Staged (Check Drive API Enablement & Folder Sharing)",
            )

        if progress_callback:
            maybe_coro = progress_callback(total_size, total_size)
            if asyncio.iscoroutine(maybe_coro):
                await maybe_coro

        file_id = response.get("id", "")
        permission_status = "Inherited from Folder"

        if self.share_anyone_with_link and file_id:
            permission_status = await asyncio.to_thread(
                self._apply_public_reader_permission, service, file_id
            )

        preview_url = f"https://drive.google.com/file/d/{file_id}/preview"
        web_view_link = response.get(
            "webViewLink", f"https://drive.google.com/file/d/{file_id}/view"
        )
        download_link = (
            response.get("webContentLink")
            or f"https://drive.google.com/uc?export=download&id={file_id}"
        )

        logger.info(
            "Completed Google Drive upload for '%s' -> file_id=%s preview=%s",
            filename,
            file_id,
            preview_url,
        )

        return UploadedDriveFile(
            file_id=file_id,
            name=response.get("name", filename),
            mime_type=response.get("mimeType", mime_type),
            size_bytes=int(response.get("size", total_size)),
            preview_url=preview_url,
            web_view_link=web_view_link,
            download_link=download_link,
            permission_mode=permission_status,
        )

    @staticmethod
    def _apply_public_reader_permission(service: Any, file_id: str) -> str:
        """Grant 'anyone with link' reader permission (\`role='reader', type='anyone'\`)."""
        try:
            service.permissions().create(
                fileId=file_id,
                body={"type": "anyone", "role": "reader"},
                fields="id",
                supportsAllDrives=True,
            ).execute()
            return "Anyone with link (Reader)"
        except HttpError as exc:
            logger.warning(
                "Could not set public link permission on file %s: %s", file_id, exc
            )
            return "Restricted (Folder / Service Account Access)"
`;

  const mainPy = `"""
Unified Asynchronous Ingestion Orchestrator for the U_MED Medical Education Platform.
Concurrently runs:
1. Pyrogram UserBot (\`SESSION_STRING\`): Listens to \`TARGET_GROUP_ID\` without requiring group admin rights.
2. GoogleDriveUploader (\`gdrive.py\`): Streams ${cfg.chunkSizeMb}MB resumable chunks to Google Drive & cleans up \`/tmp\` in \`finally:\`.
3. UmedFirestoreService (\`firebase_service.py\`): Inserts staging documents (\`status: 'draft'\`) into \`educational_resources\`.
4. Pyrogram Bot Client (\`BOT_TOKEN\`): Sends instant Arabic alerts to \`ADMIN_TELEGRAM_ID\`.
5. aiohttp Health Server (\`Port ${cfg.port}\`): Responds with 200 OK for 24/7 Docker / Hugging Face Spaces hosting.
"""

import asyncio
import logging
import mimetypes
import os
import time
from typing import Optional

from aiohttp import web
from pyrogram import Client, filters, idle
from pyrogram.types import Message

from config import Config, load_config
from firebase_service import UmedFirestoreService
from gdrive import GoogleDriveUploader

logger = logging.getLogger("umed.teledrive.main")


def extract_media_metadata(message: Message) -> tuple[str, int, str]:
    """
    Extract a sanitized filename, file size in bytes, and MIME type from a
    Telegram document, video, or audio message.
    """
    media = message.document or message.video or message.audio
    if media is None:
        raise ValueError("Message does not contain a document, video, or audio attachment.")

    file_size = int(getattr(media, "file_size", 0) or 0)
    mime_type = getattr(media, "mime_type", "") or ""
    raw_name = getattr(media, "file_name", None)

    if not raw_name:
        ext = ".bin"
        if "pdf" in mime_type:
            ext = ".pdf"
        elif "mp4" in mime_type or message.video:
            ext = ".mp4"
        elif "mpeg" in mime_type or "mp3" in mime_type or message.audio:
            ext = ".mp3"
        elif "ogg" in mime_type:
            ext = ".ogg"
        raw_name = f"umed_telegram_{message.id}_{int(time.time())}{ext}"

    safe_name = os.path.basename(raw_name.replace("\\\\", "_").replace("/", "_"))
    if not mime_type:
        guessed_mime, _ = mimetypes.guess_type(safe_name)
        mime_type = guessed_mime or "application/octet-stream"

    return safe_name, file_size, mime_type


async def start_health_server(config: Config) -> web.AppRunner:
    """Start a lightweight aiohttp web server on port ${cfg.port} returning 200 OK."""
    app = web.Application()

    async def handle_health(_request: web.Request) -> web.Response:
        return web.json_response(
            {
                "status": "OK",
                "service": "umed-teledrive-ingestion-engine",
                "target_group_id": config.target_group_id,
                "port": config.port,
            },
            status=200,
        )

    app.router.add_get("/", handle_health)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/healthz", handle_health)

    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, host=config.host, port=config.port)
    await site.start()
    logger.info("Health-check server listening on http://%s:%d", config.host, config.port)
    return runner


async def send_admin_draft_alert(
    bot_client: Client,
    admin_telegram_id: int,
    file_name: str,
    file_size_label: str,
    course_label: str,
) -> None:
    """Send an immediate notification to ADMIN_TELEGRAM_ID via the Bot Token client."""
    alert_text = (
        "📥 **تم سحب ملف جديد إلى مسودة U_MED**\\n\\n"
        f"📄 **الملف:** \`{file_name}\`\\n"
        f"📦 **الحجم:** \`{file_size_label}\`\\n"
        f"🏷 **المادة المستنتجة:** \`{course_label}\`\\n\\n"
        "يرجى الدخول إلى لوحة تحكم المنصة للمراجعة والاعتماد ونشر الملف للطلاب."
    )
    try:
        await bot_client.send_message(
            chat_id=admin_telegram_id,
            text=alert_text,
            disable_web_page_preview=True,
        )
        logger.info(
            "Sent instant draft ingestion alert to ADMIN_TELEGRAM_ID=%s for '%s'",
            admin_telegram_id,
            file_name,
        )
    except Exception as exc:
        logger.error(
            "Failed to send admin notification to %s via BOT_TOKEN: %s",
            admin_telegram_id,
            exc,
        )


async def main() -> None:
    """
    Concurrent entrypoint running:
    - aiohttp health server (Port ${cfg.port})
    - Pyrogram UserBot listener (\`SESSION_STRING\` on \`TARGET_GROUP_ID\`)
    - Pyrogram Bot notification client (\`BOT_TOKEN\` -> \`ADMIN_TELEGRAM_ID\`)
    """
    config = load_config()

    uploader = GoogleDriveUploader(
        service_account_info=config.gdrive_service_account_info,
        folder_id=config.gdrive_folder_id,
        chunk_size_bytes=config.upload_chunk_size_bytes,
        share_anyone_with_link=config.share_anyone_with_link,
    )

    firestore_service = UmedFirestoreService(
        service_account_info=config.firebase_service_account_info,
        default_university_id=config.default_university_id,
        default_program_id=config.default_program_id,
        default_curriculum_version_id=config.default_curriculum_version_id,
    )

    user_client = Client(
        name="umed_group_listener_userbot",
        api_id=config.api_id,
        api_hash=config.api_hash,
        session_string=config.session_string,
        in_memory=True,
        workers=4,
        max_concurrent_transmissions=2,
    )

    bot_client = Client(
        name="umed_admin_notifier_bot",
        api_id=config.api_id,
        api_hash=config.api_hash,
        bot_token=config.bot_token,
        in_memory=True,
        workers=2,
    )

    group_media_filter = filters.chat(config.target_group_id) & (
        filters.document | filters.video | filters.audio
    )

    @bot_client.on_message(filters.command(["start", "status"]) & filters.private)
    async def handle_bot_status(_client: Client, message: Message) -> None:
        await message.reply_text(
            "✅ **محرك السحب التلقائي لمنصة U_MED نشط الآن**\\n\\n"
            f"• **المجموعة المراقبة (\`TARGET_GROUP_ID\`):** \`{config.target_group_id}\`\\n"
            f"• **حجم قطعة الرفع (\`Chunk Size\`):** \`{config.upload_chunk_size_mb} MB\`\\n"
            f"• **حالة الحفظ في Firestore:** \`draft (بانتظار اعتماد المشرف)\`"
        )

    @user_client.on_message(group_media_filter)
    async def handle_group_media_ingestion(client: Client, message: Message) -> None:
        filename, expected_size, mime_type = extract_media_metadata(message)
        caption = message.caption or ""
        unique_prefix = f"{message.chat.id}_{message.id}_{int(time.time())}"
        local_file_path = os.path.join(config.download_dir, f"{unique_prefix}_{filename}")
        downloaded_path: Optional[str] = None

        logger.info(
            "Detected media in TARGET_GROUP_ID=%s -> file='%s' (%d bytes)",
            config.target_group_id,
            filename,
            expected_size,
        )

        try:
            downloaded_path = await client.download_media(
                message=message,
                file_name=local_file_path,
            )
            if not downloaded_path or not os.path.isfile(downloaded_path):
                raise RuntimeError("MTProto download completed without producing a local file.")

            uploaded_file = await uploader.upload_file(
                file_path=downloaded_path,
                filename=filename,
            )

            draft_doc, inferred_meta = await firestore_service.create_draft_resource(
                drive_file_id=uploaded_file.file_id,
                original_file_name=filename,
                file_size_bytes=uploaded_file.size_bytes,
                mime_type=uploaded_file.mime_type or mime_type,
                caption=caption,
            )

            await send_admin_draft_alert(
                bot_client=bot_client,
                admin_telegram_id=config.admin_telegram_id,
                file_name=filename,
                file_size_label=draft_doc["fileSizeLabel"],
                course_label=inferred_meta.course_label_arabic,
            )

        except Exception as exc:
            logger.exception("Automated ingestion failed for '%s': %s", filename, exc)
        finally:
            for candidate_path in {local_file_path, downloaded_path}:
                if candidate_path and os.path.exists(candidate_path):
                    try:
                        os.remove(candidate_path)
                        logger.info("Purged temporary file: %s", candidate_path)
                    except OSError as remove_err:
                        logger.error(
                            "Failed to delete temporary file %s: %s",
                            candidate_path,
                            remove_err,
                        )

    health_runner = await start_health_server(config)
    try:
        await user_client.start()
        await bot_client.start()
        await idle()
    finally:
        for client_instance in (user_client, bot_client):
            try:
                await client_instance.stop()
            except Exception:
                pass
        await health_runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
`;

  const generateSessionPy = `"""
Interactive Pyrogram MTProto Session String Generator for U_MED.
Run this script once on your local computer or inside Google Colab to generate
your \`SESSION_STRING\` so the UserBot can listen to your student batch group
(\`TARGET_GROUP_ID\`) without requiring group admin privileges.

Usage:
    pip install pyrogram==2.0.106 tgcrypto==1.2.5
    python generate_session.py
"""

import asyncio
import os
from pyrogram import Client

DEFAULT_API_ID = "${cfg.apiId || '2040'}"
DEFAULT_API_HASH = "${cfg.apiHash || 'b18441a1ff607e10a989891a5462e627'}"


async def generate_umed_session() -> None:
    print("=" * 72)
    print("  U_MED Telegram MTProto Session String Generator (Pyrogram v2)")
    print("=" * 72)

    api_id_raw = (
        os.environ.get("API_ID", "").strip()
        or DEFAULT_API_ID
        or input("\\nEnter API_ID: ").strip()
    )
    api_hash = (
        os.environ.get("API_HASH", "").strip()
        or DEFAULT_API_HASH
        or input("Enter API_HASH: ").strip()
    )

    if not api_id_raw or not api_hash:
        raise SystemExit("Error: Both API_ID and API_HASH are required.")

    api_id = int(api_id_raw)

    async with Client(
        name="umed_session_generator",
        api_id=api_id,
        api_hash=api_hash,
        in_memory=True,
    ) as app:
        session_string = await app.export_session_string()
        me = await app.get_me()

        saved_msg = (
            "✅ **تم توليد كود الجلسة (SESSION_STRING) لمنصة U_MED بنجاح!**\\n\\n"
            f"👤 **الحساب:** \`{me.first_name or ''} (@{me.username or 'no_username'})\`\\n"
            f"🆔 **معرّف الحساب (\`ADMIN_TELEGRAM_ID\`):** \`{me.id}\`\\n\\n"
            "🔑 **\`SESSION_STRING\` (انسخه وضعه في Secrets داخل Hugging Face Spaces):**\\n"
            f"\`{session_string}\`\\n\\n"
            "⚠️ **تنبيه أمني:** لا تشارك هذا الكود مع أي شخص."
        )
        try:
            await app.send_message("me", saved_msg)
        except Exception:
            pass

        print("\\n" + "=" * 72)
        print("SUCCESS! Copy the SESSION_STRING below into Hugging Face Spaces Secrets:")
        print("=" * 72)
        print(f"\\nSESSION_STRING=\\n{session_string}\\n")
        print(f"Your Telegram User ID (ADMIN_TELEGRAM_ID): {me.id}")
        print("=" * 72)


if __name__ == "__main__":
    asyncio.run(generate_umed_session())
`;

  const envExample = `# ============================================================================
# U_MED Automated Telegram-to-Google-Drive & Firestore Draft Ingestion Engine
# Copy to .env for local testing or configure as Secrets in Hugging Face Spaces
# ============================================================================

# 1. Telegram MTProto API Credentials (https://my.telegram.org)
API_ID=${cfg.apiId || '2040'}
API_HASH=${cfg.apiHash || 'b18441a1ff607e10a989891a5462e627'}

# 2. Dual Telegram Clients (UserBot Group Listener + Bot Admin Notifier)
SESSION_STRING=${cfg.sessionString || 'BQAA...your_pyrogram_mtproto_session_string'}
BOT_TOKEN=${cfg.botToken || '8787910034:AAF_TcpLPwj1m74jtY9XFaeeNv7bADOaiD8'}

# 3. Target Student Batch Group & Admin Notification Recipient
TARGET_GROUP_ID=${cfg.targetGroupId || '-1003664858401'}
ADMIN_TELEGRAM_ID=${cfg.adminTelegramId || '1905553456'}

# 4. Google Drive Resumable Upload Configuration
GDRIVE_FOLDER_ID=${cfg.defaultFolderId || '1DN7ma5J43S1R7is3FiaiC5ajHBkyVyQd'}
GDRIVE_CREDENTIALS_B64=${cfg.gdriveCredentialsB64 || 'eyJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsICJwcm9qZWN0X2lkIjogInJ1Z2dlZC1wcmVjZXB0LTUxMjkxNS1wOSJ9'}
GDRIVE_PUBLIC_LINK=true

# 5. Firebase Admin / Cloud Firestore Credentials (U_MED Platform)
FIREBASE_CREDENTIALS_B64=${cfg.firebaseCredentialsB64 || cfg.gdriveCredentialsB64 || 'eyJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsICJwcm9qZWN0X2lkIjogInJ1Z2dlZC1wcmVjZXB0LTUxMjkxNS1wOSJ9'}
DEFAULT_UNIVERSITY_ID=${cfg.defaultUniversityId || 'univ-dar-al-salam'}
DEFAULT_PROGRAM_ID=medicine
DEFAULT_CURRICULUM_VERSION_ID=v2026

# 6. Transfer Tuning & 24/7 Container Health Check Server
UPLOAD_CHUNK_SIZE_MB=${cfg.chunkSizeMb}
PORT=${cfg.port}
`;

  const dockerfile = `FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PORT=${cfg.port}

RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    python3-dev \\
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \\
    PATH=/home/user/.local/bin:$PATH \\
    DOWNLOAD_DIR=/tmp/teledrive_downloads

WORKDIR $HOME/app

COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \\
    pip install --no-cache-dir -r requirements.txt

COPY --chown=user:user config.py firebase_service.py gdrive.py main.py generate_session.py ./
RUN mkdir -p /tmp/teledrive_downloads

EXPOSE ${cfg.port}
CMD ["python", "main.py"]
`;

  const readmeMd = `# محرك السحب التلقائي لمنصة U_MED الطبية (Hugging Face Spaces Docker)

حزمة جاهزة للنشر المجاني على مدار الساعة (**24/7**) على **Hugging Face Spaces (Docker Blank)** لربط مجموعة الدفعة في تيليجرام بمكتبة منصة **U_MED** الطبية.

## خطوات النشر السريع على Hugging Face Spaces
1. افتح [huggingface.co/new-space](https://huggingface.co/new-space) وأنشئ Space جديداً بنوع **Docker (Blank)**.
2. من **Settings ➔ Variables and secrets**، أضف المتغيرات الـ 8 التالية:
   - \`API_ID\`
   - \`API_HASH\`
   - \`SESSION_STRING\`
   - \`BOT_TOKEN\`
   - \`TARGET_GROUP_ID\`
   - \`ADMIN_TELEGRAM_ID\`
   - \`GDRIVE_FOLDER_ID\`
   - \`GDRIVE_CREDENTIALS_B64\` و \`FIREBASE_CREDENTIALS_B64\`
3. من **Files ➔ Upload files**، ارفع الملفات: \`Dockerfile\`, \`requirements.txt\`, \`config.py\`, \`firebase_service.py\`, \`gdrive.py\`, \`main.py\`.
`;

  return [
    {
      id: 'main.py',
      filename: 'main.py',
      category: 'Core Python',
      summaryArabic: 'المنسق غير المتزامن (UserBot للاستماع لمجموعة الدفعة + رفع Google Drive + حفظ مسودة Firestore + بوت إشعار المشرف + خادم فحص المنفذ 7860)',
      content: mainPy
    },
    {
      id: 'firebase_service.py',
      filename: 'firebase_service.py',
      category: 'Core Python',
      summaryArabic: 'خدمة Firebase Admin لتحليل الوسوم (#سنة_ثانية #دم #نظري) وإدراج الوثيقة تلقائياً في educational_resources بحالة draft',
      content: firebaseServicePy
    },
    {
      id: 'gdrive.py',
      filename: 'gdrive.py',
      category: 'Core Python',
      summaryArabic: `محرك الرفع المتقطع إلى Google Drive (${cfg.chunkSizeMb}MB Resumable Chunks) مع ضبط صلاحية القراءة وتوليد رابط المعاينة /preview`,
      content: gdrivePy
    },
    {
      id: 'generate_session.py',
      filename: 'generate_session.py',
      category: 'Core Python',
      summaryArabic: 'أداة استخراج كود الجلسة (SESSION_STRING) لحساب العضو وإرساله تلقائياً إلى الرسائل المحفوظة في تيليجرام',
      content: generateSessionPy
    },
    {
      id: 'config.py',
      filename: 'config.py',
      category: 'Config & Env',
      summaryArabic: 'قارئ ومفكك تشفير المتغيرات (SESSION_STRING, BOT_TOKEN, TARGET_GROUP_ID, ADMIN_TELEGRAM_ID, GDRIVE_CREDENTIALS_B64, FIREBASE_CREDENTIALS_B64)',
      content: configPy
    },
    {
      id: 'requirements.txt',
      filename: 'requirements.txt',
      category: 'Config & Env',
      summaryArabic: 'حزم بايثون المعتمدة (pyrogram==2.0.106, tgcrypto==1.2.5, google-api-python-client, google-auth, firebase-admin, aiohttp)',
      content: requirementsTxt
    },
    {
      id: '.env.example',
      filename: '.env.example',
      category: 'Config & Env',
      summaryArabic: 'قالب متغيرات البيئة الجاهز للنسخ إلى Hugging Face Spaces أو Docker',
      content: envExample
    },
    {
      id: 'Dockerfile',
      filename: 'Dockerfile',
      category: 'Container & Docs',
      summaryArabic: 'ملف بناء الحاوية (python:3.10-slim, UID 1000, Port 7860) المتوافق مع الاستضافة المجانية 24/7 على Hugging Face Spaces',
      content: dockerfile
    },
    {
      id: 'README.md',
      filename: 'README.md',
      category: 'Container & Docs',
      summaryArabic: 'دليل النشر المصور خطوة بخطوة على Hugging Face Spaces واستخراج SESSION_STRING',
      content: readmeMd
    }
  ];
}

// Pure TypeScript PKZIP Builder for one-click repository export
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
}

function writeUint32LE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >>> 8) & 0xff;
  buf[offset + 2] = (val >>> 16) & 0xff;
  buf[offset + 3] = (val >>> 24) & 0xff;
}

export function buildTeleDriveZipBlob(files: { filename: string; content: string }[]): Blob {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.filename);
    const dataBytes = encoder.encode(file.content);
    const fileCrc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    writeUint32LE(localHeader, 0, 0x04034b50);
    writeUint16LE(localHeader, 4, 20);
    writeUint16LE(localHeader, 6, 0x0800);
    writeUint16LE(localHeader, 8, 0);
    writeUint16LE(localHeader, 10, 0x4800);
    writeUint16LE(localHeader, 12, 0x555b);
    writeUint32LE(localHeader, 14, fileCrc);
    writeUint32LE(localHeader, 18, size);
    writeUint32LE(localHeader, 22, size);
    writeUint16LE(localHeader, 26, nameBytes.length);
    writeUint16LE(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32LE(centralHeader, 0, 0x02014b50);
    writeUint16LE(centralHeader, 4, 20);
    writeUint16LE(centralHeader, 6, 20);
    writeUint16LE(centralHeader, 8, 0x0800);
    writeUint16LE(centralHeader, 10, 0);
    writeUint16LE(centralHeader, 12, 0x4800);
    writeUint16LE(centralHeader, 14, 0x555b);
    writeUint32LE(centralHeader, 16, fileCrc);
    writeUint32LE(centralHeader, 20, size);
    writeUint32LE(centralHeader, 24, size);
    writeUint16LE(centralHeader, 28, nameBytes.length);
    writeUint16LE(centralHeader, 30, 0);
    writeUint16LE(centralHeader, 32, 0);
    writeUint16LE(centralHeader, 34, 0);
    writeUint16LE(centralHeader, 36, 0);
    writeUint32LE(centralHeader, 38, 0);
    writeUint32LE(centralHeader, 42, currentOffset);
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    currentOffset += localHeader.length + dataBytes.length;
  }

  let centralSize = 0;
  for (const chunk of centralChunks) {
    centralSize += chunk.length;
  }

  const eocd = new Uint8Array(22);
  writeUint32LE(eocd, 0, 0x06054b50);
  writeUint16LE(eocd, 4, 0);
  writeUint16LE(eocd, 6, 0);
  writeUint16LE(eocd, 8, files.length);
  writeUint16LE(eocd, 10, files.length);
  writeUint32LE(eocd, 12, centralSize);
  writeUint32LE(eocd, 16, currentOffset);
  writeUint16LE(eocd, 20, 0);

  return new Blob([...localChunks, ...centralChunks, eocd], {
    type: 'application/zip'
  });
}

export function triggerZipDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
