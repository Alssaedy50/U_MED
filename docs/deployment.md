# UMED Deployment & Operations Guide (Local, Vercel & Cloud Run)

## 1. التشغيل المحلي على جهازك (Local Development)

لتشغيل المنصة محلياً (الواجهة الأمامية + خادم Node.js الخلفي معاً على المنفذ `3000`):

```bash
# 1. تثبيت الحزم البرمجية
npm install

# 2. تشغيل خادم التطوير المتكامل (Express + Vite)
npm run dev
```

افتح المتصفح على الرابط: `http://localhost:3000`

---

## 2. الرفع والنشر على منصة Vercel (Full-Stack Serverless)

تم إعداد المشروع بملف `vercel.json` ودالة خادمية موحدة في `api/index.ts` ليعمل كـ **Full-Stack (Frontend + Serverless API + Cloud Firestore)** على Vercel مباشرة:

1. ارفع مجلد المشروع إلى مستودع GitHub المرتبط بـ Vercel أو ارفعه مباشرة عبر Vercel CLI (`vercel --prod`).
2. في إعدادات مشروعك داخل **Vercel Dashboard > Settings > Environment Variables**، أضف المتغير:
   - `INITIAL_OWNER_EMAIL` = `alssaedy500@gmail.com`
3. **خطوة ضرورية لعمل تسجيل الدخول عبر Google على Vercel**:
   - انسخ نطاق موقعك على Vercel (مثلاً `your-app.vercel.app` بدون `https://`).
   - افتح [إعدادات مصادقة Firebase (Authorized Domains)](https://console.firebase.google.com/project/active-branch-w83d0/authentication/settings).
   - أضف نطاق `your-app.vercel.app` إلى قائمة **Authorized domains**.
4. **نشر قواعد أمان Firestore المحدثة (`firestore.rules`)**:
   - انسخ محتوى ملف `firestore.rules` المرفق في المشروع والصقه في تبويب **Firestore Database > Rules** داخل لوحة تحكم Firebase ثم اضغط **Publish**.

---

## 3. توليد تطبيق أندرويد (`.apk`) للطلاب

المشروع مزود بملف `public/manifest.json` وأيقونات `icon-192.png` و `icon-512.png` الجاهزة قياسياً:
1. افتح موقع [PWABuilder.com](https://www.pwabuilder.com/) وضع رابط موقعك المنشور على Vercel.
2. اضغط **Start** ثم **Package for stores** واختر **Android** لتحميل ملف **`.apk`** الجاهز للتثبيت المباشر على هواتف الطلاب.
