import test from 'node:test';
import assert from 'node:assert/strict';
import { cvSchema, cvHeaderLines, cvGenerationContentSchema, cvSnapshotSchema } from '@quba/shared';
import { printTemplate } from '../src/services/pdf/template.js';

const old = {
  version: 2,
  summary: 'نبذة موثقة.',
  talents: ['الرسم'],
  skills: ['الرسم بالقلم'],
  achievements: [],
  projects: [],
  missingInformation: [],
};
const identity = {
  name: 'طالب تجريبي',
  grade: 'SECOND' as const,
  classroom: 'أ',
  primaryTalent: 'الرسم',
  schoolName: 'موهوبين مجمع ثانوية قباء',
  supervisors: [],
};
test('Stored CVs without suggestions remain readable and printable; empty edited suggestions are valid', () => {
  const parsed = cvSchema.parse(old);
  assert.equal(parsed.suggestedSkills, undefined);
  assert.equal(parsed.futureGoals, undefined);
  const html = printTemplate([{ content: parsed, identity }], '', '');
  for (const line of cvHeaderLines) assert.ok(html.includes(line));
  assert.ok(!html.includes('<h2>مهارات مقترحة للتطوير</h2>'));
  assert.ok(!html.includes('<h2>الأهداف المستقبلية</h2>'));
  assert.ok(cvSchema.safeParse({ ...old, suggestedSkills: [], futureGoals: [] }).success);
  assert.ok(cvSnapshotSchema.safeParse(identity).success);
  assert.ok(!html.includes('رقم الجوال:'));
});

test('CV printing includes the saved phone number and updated school header', () => {
  const html = printTemplate(
    [{ content: cvSchema.parse(old), identity: { ...identity, phoneNumber: '+966501234567' } }],
    '',
    '',
  );
  assert.ok(html.includes('مجمع ثانوية قباء'));
  assert.ok(html.includes('رقم الجوال: <bdi dir="ltr">+966501234567</bdi>'));
});
test('New generation requires exactly three suggestions per section, and PDF escapes them in every student', () => {
  const data = {
    ...old,
    suggestedSkills: ['الأشكال', 'الألوان', '<script>bad</script>'],
    futureGoals: ['هدف أول', 'هدف ثانٍ', 'هدف ثالث'],
  };
  const { version, ...content } = data;
  assert.equal(version, 2);
  assert.ok(cvGenerationContentSchema.safeParse(content).success);
  assert.ok(
    !cvGenerationContentSchema.safeParse({ ...content, futureGoals: ['هدف واحد'] }).success,
  );
  const item = { content: cvSchema.parse(data), identity };
  const html = printTemplate(
    [item, { ...item, identity: { ...identity, name: 'طالب ثانٍ' } }],
    '',
    '',
  );
  assert.equal(html.split('class="official-header"').length - 1, 2);
  assert.equal(html.split('<h2>مهارات مقترحة للتطوير</h2>').length - 1, 2);
  assert.equal(html.split('<h2>الأهداف المستقبلية</h2>').length - 1, 2);
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.ok(!html.includes('<script>bad</script>'));
});
