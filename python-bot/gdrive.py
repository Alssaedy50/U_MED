"""
Modular Google Drive API v3 helper class with chunked resumable uploads (20MB chunks).
Streams large files (up to 2GB–4GB) without memory spikes, runs blocking HTTP calls inside
worker threads (`asyncio.to_thread`), applies public reader permission (`role="reader",
type="anyone"`), and returns direct `/preview` and download links for U_MED.
"""

import asyncio
import logging
import mimetypes
import os
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

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
    """Handles authenticated 20MB-chunked resumable file uploads to Google Drive."""

    def __init__(
        self,
        service_account_info: Dict[str, Any],
        folder_id: Optional[str] = None,
        chunk_size_bytes: int = 20 * 1024 * 1024,
        share_anyone_with_link: bool = True,
    ) -> None:
        self.folder_id = folder_id
        self.chunk_size_bytes = chunk_size_bytes
        self.share_anyone_with_link = share_anyone_with_link
        self.client_email = service_account_info.get("client_email", "unknown")

        self._credentials = service_account.Credentials.from_service_account_info(
            service_account_info, scopes=SCOPES
        )
        logger.info(
            "Initialized Google Drive credentials for Service Account: %s",
            self.client_email,
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
        Upload a local file to Google Drive using 20MB chunked resumable MediaFileUpload.
        """
        if not os.path.isfile(file_path):
            raise FileNotFoundError(f"Local file not found for upload: {file_path}")

        total_size = os.path.getsize(file_path)
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = "application/octet-stream"

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

        while response is None:
            status, response = await asyncio.to_thread(
                request.next_chunk, num_retries=5
            )
            if status and progress_callback:
                uploaded_bytes = int(status.resumable_progress)
                maybe_coro = progress_callback(uploaded_bytes, total_size)
                if asyncio.iscoroutine(maybe_coro):
                    await maybe_coro

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
        """Grant 'anyone with link' reader permission (`role='reader', type='anyone'`)."""
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
