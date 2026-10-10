import { cvSchema } from '@quba/shared';
import type { AiInput, TextAi } from '../src/services/ai/qwen.js';
// Dependency injection is rejected outside NODE_ENV=test. No fake environment toggle exists.
export class FakeTextAi implements TextAi {
  calls = 0;
  async generate(input: AiInput) {
    this.calls++;
    return cvSchema.parse({
      version: 2,
      summary: `يهتم الطالب بموهبة ${input.primaryTalent}. ${input.notes}`,
      talents: [input.primaryTalent, ...input.additionalTalents],
      skills: input.skills,
      suggestedSkills: ['فهم المتغيرات', 'استخدام الشروط والحلقات', 'كتابة دوال بسيطة'],
      futureGoals: [
        'كتابة برنامج لحساب المعدل',
        'إنشاء صفحة HTML وCSS',
        'حل ثلاثة تمارين للمبتدئين',
      ],
      achievements: input.achievements.map((a) => ({ ...a, date: a.date ?? null })),
      projects: input.projects,
      missingInformation: input.achievements.length ? [] : ['أضف إنجازات موثقة إن توفرت.'],
    });
  }
}
