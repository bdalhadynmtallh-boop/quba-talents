import test from 'node:test';
import assert from 'node:assert/strict';
import { QwenTextAi, type AiInput } from '../src/services/ai/qwen.js';
import type { Environment } from '../src/config/env.js';
import { testDefaults } from './env.js';
const env: Environment = {
  ...testDefaults,
  AI_BASE_URL: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  AI_API_KEY: 'test-only-secret',
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test/test',
  COOKIE_SECRET: 'a'.repeat(32),
  APP_ORIGIN: 'http://localhost:5173',
  HOST: '127.0.0.1',
  PORT: 3001,
  SESSION_HOURS: 8,
  STORAGE_DIR: '.data/test',
};
const input: AiInput = {
  primaryTalent: 'البرمجة',
  additionalTalents: [],
  skills: [],
  achievements: [],
  projects: [],
  notes: '',
};
const content = {
  summary: 'طالب مهتم بالبرمجة.',
  talents: ['البرمجة'],
  skills: [],
  suggestedSkills: ['فهم المتغيرات', 'استخدام الشروط والحلقات', 'كتابة دوال بسيطة'],
  futureGoals: ['كتابة برنامج لحساب المعدل', 'إنشاء صفحة HTML وCSS', 'حل ثلاثة تمارين للمبتدئين'],
  achievements: [],
  projects: [],
  missingInformation: ['أضف أعمالًا موثقة.'],
};
const response = (body: unknown, finish_reason = 'stop') =>
  new Response(
    JSON.stringify({ choices: [{ finish_reason, message: { content: JSON.stringify(body) } }] }),
    { status: 200 },
  );
test('Qwen contract uses documented endpoint, non-thinking structured output and text only', async () => {
  const ai = new QwenTextAi(env, async (url, options) => {
    assert.equal(url, env.AI_BASE_URL + '/chat/completions');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.model, 'qwen3.8-max');
    assert.equal(body.enable_thinking, false);
    assert.equal(body.response_format.type, 'json_schema');
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.stream, false);
    assert.equal(options?.redirect, 'error');
    assert.deepEqual(JSON.parse(body.messages[1].content), { documentedStudentData: input });
    assert.match(body.messages[0].content, /لا تخترع/);
    assert.match(body.messages[0].content, /primaryTalent/);
    assert.match(body.messages[0].content, /ليست حقائق عن الطالب/);
    assert.match(body.messages[0].content, /لا تعمم مهارات البرمجة/);
    return response(content);
  });
  assert.equal((await ai.generate(input)).version, 2);
});
test('Other providers get no invented thinking/schema parameters; official Singapore uses JSON mode', async () => {
  for (const [base, mode] of [
    ['https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1', 'json_object'],
    ['https://provider.example/v1', undefined],
  ] as const) {
    const ai = new QwenTextAi({ ...env, AI_BASE_URL: base }, async (_, options) => {
      const body = JSON.parse(String(options?.body));
      assert.equal(body.response_format?.type, mode);
      if (!base.includes('aliyuncs.com')) assert.equal(body.enable_thinking, undefined);
      return response(content);
    });
    await ai.generate(input);
  }
});
test('Invalid, truncated or invented structured content is rejected without retry', async () => {
  for (const [output, finish] of [
    [{ summary: 'missing fields' }, 'stop'],
    [content, 'length'],
    [{ ...content, suggestedSkills: ['مهارة واحدة'] }, 'stop'],
    [{ ...content, futureGoals: undefined }, 'stop'],
    [{ ...content, achievements: [{ title: 'جائزة مختلقة', date: '2026-01-01' }] }, 'stop'],
  ] as const) {
    let calls = 0;
    const ai = new QwenTextAi(env, async () => {
      calls++;
      return response(output, finish);
    });
    await assert.rejects(ai.generate(input), { code: 'AI_INVALID' });
    assert.equal(calls, 1);
  }
});

test('Talent-specific input reaches generation while suggestions stay separate from acquired skills', async () => {
  const drawing = {
    ...content,
    talents: ['الرسم'],
    summary: 'طالب مهتم بالرسم.',
    suggestedSkills: ['رسم الأشكال الأساسية', 'مزج الألوان الأساسية', 'التظليل بالقلم الرصاص'],
    futureGoals: [
      'رسم طبيعة صامتة بسيطة',
      'إكمال رسم بالألوان الأساسية',
      'التدرّب على التظليل في ثلاث رسومات',
    ],
  };
  const ai = new QwenTextAi(env, async (_, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(JSON.parse(body.messages[1].content).documentedStudentData.primaryTalent, 'الرسم');
    return response(drawing);
  });
  const result = await ai.generate({ ...input, primaryTalent: 'الرسم' });
  assert.deepEqual(result.skills, []);
  assert.deepEqual(result.projects, []);
  assert.deepEqual(result.achievements, []);
  assert.equal(result.suggestedSkills?.length, 3);
  assert.equal(result.futureGoals?.length, 3);
  assert.ok(!result.suggestedSkills?.some((s) => /المتغيرات|الدوال/.test(s)));
});
test('Missing key, provider failure and timeout report safe Arabic errors', async () => {
  await assert.rejects(new QwenTextAi({ ...env, AI_API_KEY: undefined }).generate(input), {
    code: 'AI_NOT_CONFIGURED',
  });
  await assert.rejects(
    new QwenTextAi(
      env,
      async () => new Response('secret student content', { status: 401 }),
    ).generate(input),
    { code: 'AI_SERVICE' },
  );
  await assert.rejects(
    new QwenTextAi(env, async () => {
      throw new DOMException('secret', 'TimeoutError');
    }).generate(input),
    { code: 'AI_TIMEOUT' },
  );
});
test('Free notes cannot authorize invented acquired skills, awards or projects', async () => {
  for (const invented of [
    { ...content, skills: ['مهارة مختلقة'] },
    { ...content, achievements: [{ title: 'جائزة مختلقة', date: null }] },
    {
      ...content,
      projects: [{ title: 'مشروع مختلق', description: '', studentRole: '', date: null }],
    },
  ]) {
    const ai = new QwenTextAi(env, async () => response(invented));
    await assert.rejects(
      ai.generate({ ...input, notes: 'ملاحظات عامة وليست دليلًا على اكتساب مهارات أو جوائز.' }),
      { code: 'AI_INVALID' },
    );
  }
});
