"""
Unified Asynchronous Ingestion Orchestrator for the U_MED Medical Education Platform.
Concurrently runs:
1. Pyrogram UserBot (`SESSION_STRING`): Listens to `TARGET_GROUP_ID` without requiring group admin rights.
2. GoogleDriveUploader (`gdrive.py`): Streams 20MB resumable chunks to Google Drive & cleans up `/tmp` in `finally:`.
3. UmedFirestoreService (`firebase_service.py`): Inserts staging documents (`status: 'draft'`) into `educational_resources`.
4. Pyrogram Bot Client (`BOT_TOKEN`): Sends instant Arabic alerts to `ADMIN_TELEGRAM_ID`.
5. aiohttp Health Server (`Port 7860`): Responds with 200 OK for 24/7 Docker / Hugging Face Spaces hosting.
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

    safe_name = os.path.basename(raw_name.replace("\\", "_").replace("/", "_"))
    if not mime_type:
        guessed_mime, _ = mimetypes.guess_type(safe_name)
        mime_type = guessed_mime or "application/octet-stream"

    return safe_name, file_size, mime_type


async def start_health_server(config: Config) -> web.AppRunner:
    """Start a lightweight aiohttp web server on port 7860 returning 200 OK."""
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
        "📥 **تم سحب ملف جديد إلى مسودة U_MED**\n\n"
        f"📄 **الملف:** `{file_name}`\n"
        f"📦 **الحجم:** `{file_size_label}`\n"
        f"🏷 **المادة المستنتجة:** `{course_label}`\n\n"
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
    - aiohttp health server (Port 7860)
    - Pyrogram UserBot listener (`SESSION_STRING` on `TARGET_GROUP_ID`)
    - Pyrogram Bot notification client (`BOT_TOKEN` -> `ADMIN_TELEGRAM_ID`)
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

    # 1. UserBot Client (Listens to private/restricted batch group without admin rights)
    user_client = Client(
        name="umed_group_listener_userbot",
        api_id=config.api_id,
        api_hash=config.api_hash,
        session_string=config.session_string,
        in_memory=True,
        workers=4,
        max_concurrent_transmissions=2,
    )

    # 2. Bot Client (Sends instant staging notifications to ADMIN_TELEGRAM_ID)
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
            "✅ **محرك السحب التلقائي لمنصة U_MED نشط الآن**\n\n"
            f"• **المجموعة المراقبة (`TARGET_GROUP_ID`):** `{config.target_group_id}`\n"
            f"• **حجم قطعة الرفع (`Chunk Size`):** `{config.upload_chunk_size_mb} MB`\n"
            f"• **حالة الحفظ في Firestore:** `draft (بانتظار اعتماد المشرف)`"
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
            # Step 1: Stream download via MTProto UserBot session to ephemeral disk
            downloaded_path = await client.download_media(
                message=message,
                file_name=local_file_path,
            )
            if not downloaded_path or not os.path.isfile(downloaded_path):
                raise RuntimeError("MTProto download completed without producing a local file.")

            actual_size = os.path.getsize(downloaded_path)
            logger.info(
                "Downloaded '%s' (%d bytes) to temporary path %s",
                filename,
                actual_size,
                downloaded_path,
            )

            # Step 2: Resumable 20MB-chunked upload to Google Drive in worker threads
            uploaded_file = await uploader.upload_file(
                file_path=downloaded_path,
                filename=filename,
            )

            # Step 3: Insert staging document (`status: 'draft'`) into Firestore `educational_resources`
            draft_doc, inferred_meta = await firestore_service.create_draft_resource(
                drive_file_id=uploaded_file.file_id,
                original_file_name=filename,
                file_size_bytes=uploaded_file.size_bytes,
                mime_type=uploaded_file.mime_type or mime_type,
                caption=caption,
            )

            # Step 4: Send instant notification to ADMIN_TELEGRAM_ID via Bot Token
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
            # Guaranteed Ephemeral Disk Hygiene: Always remove temporary files
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
        user_me = await user_client.get_me()
        logger.info(
            "UserBot listener started as %s (ID: %s) -> monitoring TARGET_GROUP_ID=%s",
            getattr(user_me, "first_name", "UserBot"),
            user_me.id,
            config.target_group_id,
        )

        await bot_client.start()
        bot_me = await bot_client.get_me()
        logger.info(
            "Admin Notification Bot started as @%s (ID: %s) -> alerting ADMIN_TELEGRAM_ID=%s",
            getattr(bot_me, "username", "bot"),
            bot_me.id,
            config.admin_telegram_id,
        )

        await idle()
    finally:
        logger.info("Shutting down UserBot, Admin Bot, and Health Server...")
        for client_instance in (user_client, bot_client):
            try:
                await client_instance.stop()
            except Exception:
                pass
        await health_runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
