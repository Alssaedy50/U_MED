"""
Dedicated Firebase Admin / Cloud Firestore service for U_MED Automated Telegram Ingestion.
Initializes firebase-admin from Base64-decoded Service Account credentials, parses hashtags
and captions to infer studyLevelId, courseOfferingId, and sectionType, and inserts new
educational resources with `status: 'draft'` into `educational_resources` (and syncs to
`educationalResources` for real-time visibility in the U_MED Admin Console).
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


# Hashtag & Keyword Mapping Rules for U_MED Medical Curriculum
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

    # If the caption has a clean first line (excluding pure hashtags), use it as title
    clean_caption_lines = []
    for line in raw_caption.splitlines():
        without_tags = re.sub(r"#\S+", "", line).strip()
        if without_tags:
            clean_caption_lines.append(without_tags)

    extracted_title = clean_caption_lines[0] if clean_caption_lines else (stem_title or filename)
    combined_search_text = f"{raw_caption} {filename}".lower()
    normalized_tags = combined_search_text.replace(" ", "_")

    # 1. Detect Study Level
    detected_level_id = "pending_review"
    for keywords, level_id in LEVEL_KEYWORD_MAP:
        if any(kw in normalized_tags or kw in combined_search_text for kw in keywords):
            detected_level_id = level_id
            break

    # 2. Detect Course / Block
    detected_course_id = "pending_review"
    detected_course_label = "قيد المراجعة والتصنيف (Pending Review)"
    for keywords, course_id, course_label in COURSE_KEYWORD_MAP:
        if any(kw in normalized_tags or kw in combined_search_text for kw in keywords):
            detected_course_id = course_id
            detected_course_label = f"{course_label} ({course_id})"
            break

    # 3. Detect Section Type ('theoretical' | 'practical' | 'general')
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
    """Manages Firebase Admin initialization and Draft EducationalResource ingestion."""

    def __init__(
        self,
        service_account_info: Dict[str, Any],
        default_university_id: str = "univ-dar-al-salam",
        default_program_id: str = "medicine",
        default_curriculum_version_id: str = "v2026",
    ) -> None:
        self.default_university_id = default_university_id
        self.default_program_id = default_program_id
        self.default_curriculum_version_id = default_curriculum_version_id

        if not firebase_admin._apps:
            cred = credentials.Certificate(service_account_info)
            firebase_admin.initialize_app(cred)
            logger.info(
                "Initialized Firebase Admin SDK for project_id=%s",
                service_account_info.get("project_id", "unknown"),
            )

        self._db = firestore.client()

    def _insert_draft_sync(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synchronous Firestore write executed inside asyncio.to_thread.
        Writes to `educational_resources` per specification AND mirrors to
        `educationalResources` so the U_MED Web Admin Console displays the draft immediately.
        """
        doc_id = payload["id"]
        self._db.collection("educational_resources").document(doc_id).set(payload)
        self._db.collection("educationalResources").document(doc_id).set(payload)
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
        Create a new staging document (`status: 'draft'`) in Firestore immediately after
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
