"""
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


def _decode_base64_service_account(
    env_key: str,
    fallback_raw_env_key: Optional[str] = None,
    fallback_dict: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Decode a Base64-encoded Google/Firebase Service Account JSON from environment variables.
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
            raise ValueError(
                f"Failed to decode {env_key}. Ensure it contains valid Base64-encoded JSON."
            ) from exc
    elif raw_value:
        try:
            creds_dict = json.loads(raw_value)
        except Exception as exc:
            raise ValueError(
                f"Failed to parse {fallback_raw_env_key}. Ensure it contains valid JSON."
            ) from exc
    elif fallback_dict:
        logger.info(
            "%s not explicitly set; reusing primary Service Account credentials.",
            env_key,
        )
        creds_dict = dict(fallback_dict)
    else:
        raise EnvironmentError(
            f"Missing required Service Account credentials: Set {env_key} in environment variables."
        )

    required_keys = {"type", "project_id", "private_key", "client_email"}
    missing = required_keys - set(creds_dict.keys())
    if missing:
        raise ValueError(
            f"Service Account in {env_key} is missing required fields: {', '.join(sorted(missing))}"
        )

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
    default_university_id: str = "univ-dar-al-salam"
    default_program_id: str = "medicine"
    default_curriculum_version_id: str = "v2026"

    # 5. Transfer & Ephemeral Disk Safety Settings
    upload_chunk_size_mb: int = 20
    download_dir: str = "/tmp/teledrive_downloads"

    # 6. 24/7 Container Health Check Server
    port: int = 7860
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

    gdrive_folder_id = os.environ.get("GDRIVE_FOLDER_ID", "").strip() or None
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

    chunk_mb = _parse_int_env("UPLOAD_CHUNK_SIZE_MB", required=False, default=20)
    if chunk_mb not in {5, 10, 20, 50}:
        chunk_mb = 20

    port = _parse_int_env("PORT", required=False, default=7860)
    download_dir = os.environ.get("DOWNLOAD_DIR", "/tmp/teledrive_downloads").strip()
    os.makedirs(download_dir, exist_ok=True)

    default_univ_id = (
        os.environ.get("DEFAULT_UNIVERSITY_ID", "univ-dar-al-salam").strip()
        or "univ-dar-al-salam"
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
