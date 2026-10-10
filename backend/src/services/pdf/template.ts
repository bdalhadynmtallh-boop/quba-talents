import { cvHeaderLines, gradeLabels, type CvData, type cvSnapshotSchema } from '@quba/shared';
import type { z } from 'zod';
export interface PrintableCv {
  content: CvData;
  identity: z.infer<typeof cvSnapshotSchema>;
}
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export function printTemplate(
  items: PrintableCv[],
  font: string,
  boldFont: string,
  logo?: string,
  ministryLogo?: string,
) {
  const e = escapeHtml;
  const section = (name: string, body: string) =>
    body ? `<section><h2>${name}</h2>${body}</section>` : '';
  const list = (items: string[]) =>
    items.length ? `<ul>${items.map((item) => `<li>${e(item)}</li>`).join('')}</ul>` : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><title>ملف الموهبة والإنجاز</title><style>
  @font-face{font-family:Quba;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400}
  @font-face{font-family:Quba;src:url(data:font/woff2;base64,${boldFont}) format('woff2');font-weight:600}
  @page{size:A4;margin:17mm 16mm 18mm}*{box-sizing:border-box}body{margin:0;color:#122546;background:white;font-family:Quba,sans-serif;font-size:11.5pt;line-height:1.8}
  h1,h2,h3,p{margin:0 0 8px}h1{font-size:20pt;line-height:1.6}h2{font-size:13pt;color:#145cb7;border-bottom:1px solid #cbdcf1;padding-bottom:4px;break-after:avoid}h3{font-size:12pt;break-after:avoid}
  section{margin-top:18px}p,li{overflow-wrap:anywhere;white-space:pre-wrap;orphans:3;widows:3}ul{padding-right:20px;margin:8px 0}li{margin:5px 0}.project{margin:10px 0}.school{display:flex;align-items:center;gap:12px;border-bottom:2px solid #1769ca;padding-bottom:12px;margin-bottom:18px;font-weight:600;font-size:15pt}.school img{height:48px;max-width:90px;object-fit:contain}
  .identity{text-align:center;margin-bottom:22px}.identity p{color:#47617e}.supervisors{break-inside:avoid;page-break-inside:avoid;margin-top:24px;border-top:2px solid #1769ca;padding-top:12px}.supervisors h2{border:0;text-align:center}.supervisors p{text-align:center}.student{break-before:page;page-break-before:always}.single{break-before:auto;page-break-before:auto}.index{break-after:page;page-break-after:always}.index li{margin:14px 0}.hint{font-size:10pt;color:#526779}
  .school{justify-content:space-between;break-inside:avoid}.school-brand{display:flex;align-items:center;gap:12px;min-width:0}.official-header{display:flex;flex-direction:column;font-size:10.5pt;line-height:1.9;text-align:right}.official-header span:last-child{font-size:12pt}.ministry-mark{position:relative;overflow:hidden;width:110px;height:80px;flex-shrink:0;background:white}.school .ministry-mark img{position:absolute;width:230px;height:230px;max-width:none;top:-77px;left:-60px;object-fit:contain}
  </style></head><body>
  ${items.length > 1 ? `<div class="index"><h1>فهرس ملفات الموهبة والإنجاز</h1><p>${e(items[0]!.identity.schoolName)}</p><ol>${items.map(({ identity }) => `<li>${e(identity.name)} · ${e(gradeLabels[identity.grade])} · ${e(identity.classroom)}</li>`).join('')}</ol></div>` : ''}
  ${items
    .map(
      (
        { content: c, identity: id },
        i,
      ) => `<article class="student ${items.length === 1 || i === 0 ? 'single' : ''}">
  <div class="school"><div class="school-brand">${logo ? `<img alt="شعار المدرسة" src="${logo}">` : ''}<div class="official-header">${cvHeaderLines.map((line) => `<span>${e(line)}</span>`).join('')}</div></div>${ministryLogo ? `<div class="ministry-mark"><img alt="شعار وزارة التعليم" src="${ministryLogo}"></div>` : ''}</div>
  <header class="identity"><h1>السيرة الذاتية — ملف الموهبة والإنجاز</h1><h2>${e(id.name)}</h2><p>${e(gradeLabels[id.grade])} · الفصل ${e(id.classroom)}</p>${id.academicYearLabel ? `<p>السنة الدراسية: ${e(id.academicYearLabel)}</p>` : ''}<p>الموهبة الرئيسية: ${e(id.primaryTalent)}</p></header>
  ${section('نبذة عن الطالب', c.summary ? `<p>${e(c.summary)}</p>` : '')}
  ${section('المواهب والاهتمامات', list(c.talents))}${section('المهارات', list(c.skills))}
  ${section('مهارات مقترحة للتطوير', c.suggestedSkills?.length ? `<p class="hint">اقتراحات للتعلّم، لا تعبّر عن مهارات مكتسبة.</p>${list(c.suggestedSkills)}` : '')}
  ${section('الأهداف المستقبلية', list(c.futureGoals ?? []))}
  ${section('الإنجازات والمشاركات', c.achievements.length ? `<ul>${c.achievements.map((a) => `<li>${e(a.title)}${a.date ? ` · <bdi dir="ltr">${e(a.date)}</bdi>` : ''}</li>`).join('')}</ul>` : '')}
  ${section('الأعمال والمشاريع', c.projects.map((p) => `<div class="project"><h3>${e(p.title)}</h3>${p.description ? `<p>${e(p.description)}</p>` : ''}${p.studentRole ? `<p>دور الطالب: ${e(p.studentRole)}</p>` : ''}${p.date ? `<p class="hint">${e(p.date)}</p>` : ''}</div>`).join(''))}
  ${id.supervisors.length ? `<footer class="supervisors"><h2>المشرفون</h2>${id.supervisors.map((s) => `<p><strong>${e(s.name)}</strong> · ${e(s.role)}</p>`).join('')}</footer>` : ''}</article>`,
    )
    .join('')}
  </body></html>`;
}
