# الواجهة Frontend

React وVite وTypeScript، عربية RTL وخطوط محلية وثيمان وجوال. لا مفاتيح AI ولا اتصال مباشر بقاعدة البيانات هنا.

```text
frontend/
  src/pages/           الرئيسية والدخول والتسجيل والطلاب والملف
  src/features/        نماذج الطلاب والطلبات والأعمال والمدرسة والسيرة
  src/components/      التخطيط والنوافذ والتأكيد وحالات التحميل
  src/app/             التوجيه والثيم
  src/lib/             HTTP وCSRF والموارد وتنزيل PDF
  src/styles/          الألوان وRTL والتجاوب
  src/assets/          الرسم وشعار الوزارة المحلي
  tests/               رحلات المتصفح
  vite.config.ts       المنفذ 5186 وتوجيه API إلى 3001
```

من جذر المشروع شغّل `npm run dev` لتشغيل الواجهة والخادم معًا. للتشغيل المنفصل بعد بناء shared: `npm run dev -w @quba/web`؛ تحتاج API تعمل على 3001. البناء في frontend/dist.

لتعديل السيرة المعروضة: src/features/cv/CvPreview.tsx وCvEditor.tsx وstyles/cv.css. قالب PDF المطبوع مستقل في backend/src/services/pdf/template.ts.

شعار الوزارة في src/assets/ministry-education.png نسخة من الأصل الرسمي الموثق في backend/assets/branding/README.md؛ لا يتطلب اتصالًا بموقع الوزارة. المخططات التي تستعملها الواجهة تأتي من حزمة @quba/shared داخل backend/shared.
