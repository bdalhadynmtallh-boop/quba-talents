import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, FolderOpen, Sparkles, MoveUpLeft } from 'lucide-react';
import { HeroArt } from '../assets/HeroArt';
const features = [
  {
    Icon: FileText,
    title: 'سيرة تحكي قصتك',
    text: 'مساحة تجمع مهارات الطالب واهتماماته وإنجازاته في سيرة ذاتية متكاملة.',
  },
  {
    Icon: FolderOpen,
    title: 'أعمال تصنع الأثر',
    text: 'المشاريع والأفكار والأعمال التي تعبّر عن شغف طلابنا وإبداعهم.',
  },
  {
    Icon: Sparkles,
    title: 'كلمات تليق بموهبتك',
    text: 'مساعدة بالذكاء الاصطناعي في صياغة السيرة، ضمن المرحلة القادمة.',
  },
];
export function HomePage() {
  return (
    <div className="home-page">
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow">
            <span />
            من ثانوية قباء… إلى آفاق أوسع
          </span>
          <h1>
            مواهب تستحق
            <br />
            <span>أن تُروى.</span>
          </h1>
          <p className="hero-description">
            لكل طالب شغف، ولكل موهبة حكاية.
            <br />
            هنا نجمع مواهب طلابنا، ونوثّق سيرهم الذاتية وأعمالهم.
          </p>
          <div className="hero-buttons">
            <Link className="button" to="/students">
              استعراض الطلاب الموهوبين
              <ArrowLeft size={21} />
            </Link>
            <Link className="button button-secondary" to="/register">
              تسجيل الموهبة
              <MoveUpLeft size={19} />
            </Link>
          </div>
          <p className="hero-footnote">
            <span />
            مساحة مدرسية آمنة · ملفات الطلاب خاصة
          </p>
        </div>
        <HeroArt />
      </section>
      <section className="features-section container" aria-labelledby="features-heading">
        <div className="section-caption">
          <span>مساحة لموهبتك</span>
          <h2 id="features-heading">نحفظ اليوم ما تصنعه للمستقبل</h2>
        </div>
        <div className="feature-grid">
          {features.map(({ Icon, title, text }, index) => (
            <article className="feature-card" key={title}>
              <span className="feature-number">0{index + 1}</span>
              <span className="feature-icon">
                <Icon size={27} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
