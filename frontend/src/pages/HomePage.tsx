import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpLeft,
  CodeXml,
  Palette,
  Mic2,
  FlaskConical,
  Trophy,
  PenLine,
  ShieldCheck,
  FileText,
  FolderOpen,
  Sparkles,
  Check,
  UserRound,
  Plus,
} from 'lucide-react';
import '../styles/home.css';

const talents = [
  { Icon: CodeXml, title: 'البرمجة والتقنية', text: 'فضول يتحول إلى أفكار رقمية.', tone: 'blue' },
  { Icon: Palette, title: 'الفنون والتصميم', text: 'ألوان تعبّر عن رؤية مختلفة.', tone: 'purple' },
  {
    Icon: FlaskConical,
    title: 'العلوم والابتكار',
    text: 'سؤال صغير يفتح باب المعرفة.',
    tone: 'green',
  },
  { Icon: PenLine, title: 'الكتابة والأدب', text: 'كلمات تحمل صوتك وأفكارك.', tone: 'yellow' },
  { Icon: Mic2, title: 'الإلقاء والتواصل', text: 'حضور يلهم، ورسالة تصل.', tone: 'purple' },
  { Icon: Trophy, title: 'الرياضة', text: 'شغف بالممارسة وروح الفريق.', tone: 'green' },
];
const journey = [
  {
    Icon: PenLine,
    title: 'سجّل موهبتك',
    text: 'عرّفنا بشغفك عبر طلب التسجيل، ليُراجعه مسؤول المدرسة.',
  },
  {
    Icon: FolderOpen,
    title: 'وثّق أعمالك',
    text: 'بعد قبول الطلب، يجمع المسؤول أعمالك ومهاراتك والإنجازات الموثقة في ملفك.',
  },
  {
    Icon: Sparkles,
    title: 'احكِ قصتك',
    text: 'تُصاغ مسودة سيرتك بالذكاء الاصطناعي، ثم تُراجع وتُعدّل وتُعتمد قبل تنزيل PDF.',
  },
];

export function HomePage() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || !('IntersectionObserver' in window)) return;
    const sections = root.current?.querySelectorAll<HTMLElement>('[data-reveal]') ?? [];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove('reveal-pending');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    const showAll = () => {
      if (reduced.matches) {
        sections.forEach((section) => section.classList.remove('reveal-pending'));
        observer.disconnect();
      }
    };
    sections.forEach((section) => {
      section.classList.add('reveal-pending');
      observer.observe(section);
    });
    reduced.addEventListener('change', showAll);
    return () => {
      observer.disconnect();
      reduced.removeEventListener('change', showAll);
      sections.forEach((section) => section.classList.remove('reveal-pending'));
    };
  }, []);
  return (
    <div className="home-page home-renewed" ref={root}>
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow">
            <Sparkles size={16} /> مساحة الإبداع في ثانوية قباء
          </span>
          <h1>
            شغفك اليوم.
            <br />
            <span>حكايتك للمستقبل.</span>
          </h1>
          <p className="hero-description">
            كل موهبة تبدأ باهتمام.
            <br />
            امنح اهتمامك مساحة، واجمع أعمالك في ملف يحكي ما تتعلمه وما تصنعه.
          </p>
          <div className="hero-buttons">
            <Link className="button home-primary" to="/register">
              سجّل موهبتك <ArrowLeft size={20} />
            </Link>
            <Link className="button button-secondary" to="/students">
              استعراض الطلاب <ArrowUpLeft size={19} />
            </Link>
          </div>
          <p className="hero-footnote">
            <ShieldCheck size={16} /> ملفات الطلاب خاصة، واستعراضها متاح للمسؤول.
          </p>
        </div>
        <div
          className="home-profile-art"
          aria-label="تصور توضيحي لأقسام ملف الطالب، لا يمثل بيانات طالب حقيقي"
        >
          <div className="profile-orbit" aria-hidden="true" />
          <div className="profile-orbit orbit-small" aria-hidden="true" />
          <span className="art-spark-label">
            <Sparkles size={17} /> لكل شغف مساحة
          </span>
          <div className="profile-illustration">
            <div className="illustration-top">
              <span className="illustration-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>ملف الموهبة</span>
              <FileText size={16} />
            </div>
            <div className="illustration-identity">
              <span className="illustration-avatar">
                <UserRound size={37} />
              </span>
              <div>
                <small>ثانوية قباء</small>
                <strong>هنا تبدأ حكايتك</strong>
                <span>موهبة · مهارات · أعمال</span>
              </div>
            </div>
            <div className="illustration-section">
              <span className="illustration-label">اهتماماتك</span>
              <div className="illustration-tags">
                <span>ما تحبّه</span>
                <span>ما تتعلّمه</span>
                <span>ما تطمح إليه</span>
              </div>
            </div>
            <div className="illustration-section">
              <span className="illustration-label">أعمالك الموثقة</span>
              <div className="illustration-work">
                <span>
                  <FolderOpen size={22} />
                </span>
                <div>
                  <strong>من الفكرة إلى الإنجاز</strong>
                  <small>وصف العمل، دورك فيه، وشواهدك</small>
                </div>
                <Check size={18} />
              </div>
            </div>
            <div className="illustration-bottom">
              <span>
                <ShieldCheck size={15} /> تُراجع قبل الاعتماد
              </span>
              <span className="illustration-pdf">
                PDF <ArrowLeft size={13} />
              </span>
            </div>
          </div>
          <div className="floating-talent float-code">
            <CodeXml size={26} />
            <span>فكّر. جرّب. ابتكر.</span>
          </div>
          <div className="floating-talent float-art">
            <Palette size={26} />
            <span>عبّر بطريقتك</span>
          </div>
          <span className="illustration-caption">تصوّر توضيحي لملف الطالب</span>
        </div>
      </section>
      <section
        className="talents-section container home-reveal"
        data-reveal
        aria-labelledby="talents-heading"
      >
        <div className="home-section-heading">
          <div>
            <span className="home-kicker">اهتمامات مختلفة، مساحة واحدة</span>
            <h2 id="talents-heading">موهبتك لها مكان هنا.</h2>
          </div>
          <p>
            هذه مجالات للاهتمام، وليست حصرًا للمواهب.
            <br />
            سجّل موهبتك بالكلمات التي تعبّر عنك.
          </p>
        </div>
        <div className="talent-grid">
          {talents.map(({ Icon, title, text, tone }) => (
            <article className={`talent-card tone-${tone}`} key={title}>
              <span className="talent-icon">
                <Icon size={25} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="talent-card-mark" aria-hidden="true">
                <Plus size={16} />
              </span>
            </article>
          ))}
        </div>
      </section>
      <section
        className="journey-section container home-reveal"
        data-reveal
        aria-labelledby="journey-heading"
      >
        <div className="home-section-heading">
          <div>
            <span className="home-kicker">خطوات واضحة، وحكاية تكتمل</span>
            <h2 id="journey-heading">من اهتمامك… إلى ملفك.</h2>
          </div>
          <span className="journey-pill">
            <ShieldCheck size={16} /> بإشراف المدرسة
          </span>
        </div>
        <ol className="journey-grid">
          {journey.map(({ Icon, title, text }, i) => (
            <li className="journey-card" key={title}>
              <div className="journey-card-top">
                <span className="journey-number">0{i + 1}</span>
                <Icon size={23} />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
        <div className="home-invite">
          <div>
            <span className="home-kicker">البداية منك</span>
            <h2>شاركنا ما يثير شغفك.</h2>
            <p>لا تحتاج إلى قائمة جوائز لتعرّفنا بموهبتك. ابدأ باهتمامك الحقيقي.</p>
          </div>
          <Link className="button home-primary" to="/register">
            تسجيل الموهبة <ArrowLeft size={20} />
          </Link>
        </div>
      </section>
    </div>
  );
}
