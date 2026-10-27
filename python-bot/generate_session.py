"""
Interactive Pyrogram MTProto Session String Generator for U_MED.
Run this script once on your local computer or inside Google Colab to generate
your `SESSION_STRING` so the UserBot can listen to your student batch group
(`TARGET_GROUP_ID`) without requiring group admin privileges.

Usage:
    pip install pyrogram==2.0.106 tgcrypto==1.2.5
    python generate_session.py
"""

import asyncio
import os
from pyrogram import Client


async def generate_umed_session() -> None:
    print("=" * 72)
    print("  U_MED Telegram MTProto Session String Generator (Pyrogram v2)")
    print("=" * 72)
    print("1. Obtain your API_ID and API_HASH from https://my.telegram.org")
    print("2. Enter your phone number in international format (e.g. +96777xxxxxxx)")
    print("=" * 72)

    api_id_raw = os.environ.get("API_ID", "").strip() or input("\nEnter API_ID: ").strip()
    api_hash = os.environ.get("API_HASH", "").strip() or input("Enter API_HASH: ").strip()

    if not api_id_raw or not api_hash:
        raise SystemExit("Error: Both API_ID and API_HASH are required.")

    try:
        api_id = int(api_id_raw)
    except ValueError as exc:
        raise SystemExit("Error: API_ID must be a valid integer.") from exc

    async with Client(
        name="umed_session_generator",
        api_id=api_id,
        api_hash=api_hash,
        in_memory=True,
    ) as app:
        session_string = await app.export_session_string()
        me = await app.get_me()

        saved_msg = (
            "✅ **تم توليد كود الجلسة (SESSION_STRING) لمنصة U_MED بنجاح!**\n\n"
            f"👤 **الحساب:** `{me.first_name or ''} (@{me.username or 'no_username'})`\n"
            f"🆔 **معرّف الحساب (`ADMIN_TELEGRAM_ID`):** `{me.id}`\n\n"
            "🔑 **`SESSION_STRING` (انسخه وضعه في Secrets داخل Hugging Face Spaces):**\n"
            f"`{session_string}`\n\n"
            "⚠️ **تنبيه أمني:** لا تشارك هذا الكود مع أي شخص."
        )
        try:
            await app.send_message("me", saved_msg)
            sent_to_saved = True
        except Exception:
            sent_to_saved = False

        print("\n" + "=" * 72)
        print("SUCCESS! Copy the SESSION_STRING below into Hugging Face Spaces Secrets:")
        print("=" * 72)
        print(f"\nSESSION_STRING=\n{session_string}\n")
        print(f"Your Telegram User ID (ADMIN_TELEGRAM_ID): {me.id}")
        if sent_to_saved:
            print("A copy has also been sent to your Telegram 'Saved Messages' (الرسائل المحفوظة).")
        print("=" * 72)


if __name__ == "__main__":
    asyncio.run(generate_umed_session())
