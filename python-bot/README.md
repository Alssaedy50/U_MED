# محرك السحب التلقائي لمنصة U_MED الطبية (Telegram MTProto ➔ Google Drive ➔ Cloud Firestore)

نظام سحابي متكامل يعمل على مدار الساعة (**24/7**) على استضافة **Hugging Face Spaces (Docker Blank)** لربط مجموعة الدفعة في تيليجرام بمكتبة منصة **U_MED** الطبية تلقائياً.

---

## المعمارية والخصائص الرئيسية

1. **استماع تلقائي لمجموعة الدفعة بدون صلاحية مشرف (`SESSION_STRING`)**:
   - يعتمد على `Pyrogram` عبر حساب عضو في مجموعة الدفعة (`TARGET_GROUP_ID`) لالتقاط كافة الملفات (`PDF`, `Video`, `Audio`, `Slides`) حتى حجم **2GB–4GB**.
2. **رفع متقطع ومستأنف إلى Google Drive (`gdrive.py`)**:
   - يرفع الملفات الضخمة على أجزاء (`20MB Chunks`) عبر `MediaFileUpload(resumable=True)` داخل `asyncio.to_thread` مع ضبط صلاحية القراءة وتوليد رابط المعاينة المدمج `/preview` وحذف الملف المؤقت حتماً داخل `finally: os.remove()`.
3. **إدراج المسودات تلقائياً في Firestore (`firebase_service.py`)**:
   - يحلل عنوان الملف والوسوم (`#سنة_ثانية`, `#دم`, `#نظري`, `#عملي`) وينشئ وثيقة جديدة في مجموعة `educational_resources` و `educationalResources` بحالة **`status: "draft"`** و **`createdBy: "AUTOMATED_TELEGRAM_INGESTION"`** لتظهر فوراً في لوحة تحكم المشرف للمراجعة والاعتماد.
4. **إشعار فوري للمشرف على تيليجرام (`BOT_TOKEN`)**:
   - يرسل رسالة تنبيه فورية إلى حساب المشرف (`ADMIN_TELEGRAM_ID`) تحتوي على اسم الملف وحجمه والمادة المستنتجة.
5. **خادم فحص النبض (`Port 7860`)**:
   - يشغل خادم `aiohttp` خفيفاً على المنفذ `7860` والمستخدم غير الجذري `UID 1000` للتوافق التام مع **Hugging Face Spaces**.

---

## الخطوة 1: استخراج كود الجلسة (`SESSION_STRING`)

يمكنك توليد `SESSION_STRING` في أقل من دقيقة عبر تشغيل ملف `generate_session.py`:

```bash
pip install pyrogram==2.0.106 tgcrypto==1.2.5
python generate_session.py
```

سيرسل السكربت كود `SESSION_STRING` ومعرّف حسابك (`ADMIN_TELEGRAM_ID`) مباشرة إلى **"الرسائل المحفوظة (Saved Messages)"** في حسابك على تيليجرام.

---

## الخطوة 2: المتغيرات السرية الـ 8 المطلوبة في Hugging Face Spaces

افتح إعدادات مساحتك في Hugging Face Spaces (**Settings ➔ Variables and secrets ➔ New secret**) وأضف الأسرار التالية:

| اسم المتغير (`Secret Name`) | القيمة المطلوبة |
| :--- | :--- |
| `API_ID` | الرقم التعريفي للتطبيق من [my.telegram.org](https://my.telegram.org) |
| `API_HASH` | كود API Hash المكون من 32 حرفاً ورقماً من [my.telegram.org](https://my.telegram.org) |
| `SESSION_STRING` | كود جلسة Pyrogram لحساب العضو في مجموعة الدفعة |
| `BOT_TOKEN` | توكن البوت من `@BotFather` (اضغط `/start` في البوت من حسابك الشخصي لتفعيل استلام الإشعارات) |
| `TARGET_GROUP_ID` | معرّف مجموعة الدفعة في تيليجرام (يبدأ بـ `-100` مثل `-1001987654321`) |
| `ADMIN_TELEGRAM_ID` | معرّف حساب المشرف الشخصي في تيليجرام (رقم موجب مثل `123456789`) |
| `GDRIVE_FOLDER_ID` | معرّف مجلد Google Drive الذي تمت مشاركته بصلاحية **محرر (Editor)** مع بريد `client_email` |
| `GDRIVE_CREDENTIALS_B64` | كود Base64 لملف `service_account.json` (يُستخدم أيضاً تلقائياً لـ `FIREBASE_CREDENTIALS_B64`) |
| `FIREBASE_CREDENTIALS_B64` | كود Base64 لملف `service_account.json` الخاص بمشروع Firebase لمنصة U_MED |

---

## الخطوة 3: النشر على Hugging Face Spaces (مجاناً 24/7)

1. أنشئ مساحة جديدة على [huggingface.co/new-space](https://huggingface.co/new-space).
2. اختر **Docker** كبيئة تشغيل، ثم اختر القالب **Blank**.
3. من تبويب **Settings ➔ Variables and secrets**، أضف المتغيرات الموضحة في الجدول أعلاه.
4. من تبويب **Files ➔ Add file ➔ Upload files**، ارفع ملفات هذا المجلد:
   - `Dockerfile`
   - `requirements.txt`
   - `config.py`
   - `firebase_service.py`
   - `gdrive.py`
   - `main.py`
5. ستتحول حالة الحاوية إلى **Running** على المنفذ `7860`، وعند إرسال أي ملف في مجموعة الدفعة سيُرفع تلقائياً إلى Google Drive ويُحفظ كمسودة في لوحة إدارة **U_MED**.
