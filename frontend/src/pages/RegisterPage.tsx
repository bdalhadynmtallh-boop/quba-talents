import { Sparkles } from 'lucide-react';
import { RegistrationForm } from '../features/registrations/RegistrationForm';
export function RegisterPage() {
  return (
    <div className="container page narrow">
      <div className="center-heading">
        <span className="feature-icon">
          <Sparkles />
        </span>
        <h1>كل موهبة تبدأ بخطوة</h1>
        <p>شاركنا موهبتك، ودع إبداعك يحكي عنك.</p>
      </div>
      <div className="form-card">
        <RegistrationForm />
        <p className="form-footnote">
          هذا طلب تسجيل فقط، دون حساب أو كلمة مرور. لا يمنح الوصول إلى ملفات الطلاب.
        </p>
      </div>
    </div>
  );
}
