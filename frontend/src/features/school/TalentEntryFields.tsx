export function TalentEntryFields({
  initial,
}: {
  initial?: { classroom?: string; primaryTalent?: string; additionalTalents?: string[] };
}) {
  return (
    <>
      <label className="field">
        الفصل
        <input
          name="classroom"
          defaultValue={initial?.classroom ?? ''}
          placeholder="اكتب فصلك، مثل ٢ / ٣"
          maxLength={30}
          required
        />
      </label>
      <label className="field">
        الموهبة الرئيسية
        <input
          name="primaryTalent"
          defaultValue={initial?.primaryTalent ?? ''}
          placeholder="اكتب موهبتك الرئيسية"
          minLength={2}
          maxLength={80}
          required
        />
      </label>
      <label className="field">
        مواهب إضافية (اختياري، كل موهبة في سطر، حتى 10)
        <textarea
          name="additionalTalents"
          defaultValue={initial?.additionalTalents?.join('\n') ?? ''}
          placeholder="اكتب مواهبك الإضافية إن وجدت"
          rows={3}
          maxLength={809}
        />
      </label>
    </>
  );
}
