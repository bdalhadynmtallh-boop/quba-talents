import {
  UserRound,
  Trophy,
  Heart,
  ChartNoAxesColumnIncreasing,
  CodeXml,
  Palette,
  Sparkles,
} from 'lucide-react';
export function HeroArt() {
  return (
    <div className="hero-art" aria-label="تصور لسيرة طالب وأعمال فنية وبرمجية">
      <div className="art-orbit" />
      <Sparkles className="art-spark one" />
      <Sparkles className="art-spark two" />
      <span className="art-dot" />
      <div className="art-card art-work">
        <span className="art-chip">عمل فني</span>
        <div className="abstract-art">
          <div />
          <div />
          <div />
          <Palette />
        </div>
        <strong>مساحة للإبداع</strong>
        <i />
        <i className="short" />
      </div>
      <div className="art-card art-code">
        <span className="art-chip">مشروع برمجي</span>
        <div className="code-window">
          <div className="window-dots">
            <b />
            <b />
            <b />
          </div>
          <CodeXml size={26} />
          {[75, 45, 65, 38, 82, 58, 48].map((width, index) => (
            <i key={index} style={{ width: `${width}%` }} />
          ))}
        </div>
        <strong>فكرة تتحول إلى مشروع</strong>
        <i />
        <i className="short" />
      </div>
      <div className="art-card art-resume">
        <div className="art-resume-title">
          <span className="art-photo">
            <UserRound size={44} />
          </span>
          <div>
            <strong>سيرة ذاتية</strong>
            <i />
            <i className="short" />
          </div>
        </div>
        {[
          { Icon: UserRound, text: 'نبذة عني' },
          { Icon: ChartNoAxesColumnIncreasing, text: 'المهارات' },
          { Icon: Heart, text: 'الاهتمامات' },
          { Icon: Trophy, text: 'الإنجازات' },
        ].map(({ Icon, text }) => (
          <div className="art-section" key={text}>
            <Icon size={18} />
            <div>
              <span>{text}</span>
              <i />
              <i className="short" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
