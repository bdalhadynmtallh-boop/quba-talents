# شعار وزارة التعليم السعودية

الصورة الأصلية دون تعديل من حزمة الشعار الرسمية المنشورة في [صفحة هوية الوزارة](https://www.moe.gov.sa/ar/mediacenter/PhotoLibrary/Pages/moe_identity.aspx)، ملف [MOE_logo.zip](https://www.moe.gov.sa/ar/mediacenter/PhotoLibrary/Documents/MOE_logo.zip). تاريخ الحصول: 2026-10-10. استُخدمت نسخة الشعار الملون بخلفية بيضاء.

يظهر الشعار في رأس معاينة السيرة وPDF بجوار اسم المدرسة وشعارها الاختياري. CSS يخفي الهوامش البيضاء المحيطة دون تغيير ألوان الشعار أو أبعاده النسبية. API يقرأ الصورة من هذا المجلد ويضمّنها كـdata URL. نسخة مطابقة في frontend/src/assets/ministry-education.png يضمّنها Vite في بناء الواجهة. لا يتصل التصدير بموقع الوزارة. يجب شحن backend/assets مع الخادم في الإنتاج.
