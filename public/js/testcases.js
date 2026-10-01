/*
 * testcases.js — fixed critiques used by the Test Lab and by `npm test`.
 * Expected results are written for the Standard preset. Changing the rules
 * in the app will make some of them fail on purpose: that is how the Test
 * Lab shows what a change does.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TestCases = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const OUT_EVIDENCE = 'According to the Aotearoa Workforce Futures Report 2024, 64% of New Zealand employers had adopted generative AI tools by mid-2024, and 38% said they had reduced graduate hiring as a result.';
  const OUT_SKILLS = 'Entry-level workers will need strong critical thinking skills, the ability to evaluate AI outputs, clear communication, and adaptability. Digital literacy and an understanding of ethical issues such as bias and privacy will also be important as AI tools become embedded in everyday work.';
  const OUT_REFS = 'Ministry of Business, Innovation and Employment. (2021). Artificial intelligence and the future of work in New Zealand. MBIE.';
  const OUT_CHAT = 'Chatbots can now answer common customer questions, while AI writing tools can produce routine emails and reports in seconds, which is useful for entry-level staff.';
  const OUT_AUTO = 'Task automation means that specific tasks within a job are performed by software rather than people. For graduates, this means routine work such as summarising documents, drafting emails and cleaning data is increasingly automated.';

  return [
    { id: 'T1', title: 'Catches a made-up source', output: OUT_EVIDENCE, decision: 'not_used',
      critique: 'I searched for this report on Google Scholar and the library database and it does not exist, so I treated it as a hallucination and used the Stats NZ survey instead.',
      expectedLevel: 4, expectedFlags: [] },
    { id: 'T2', title: 'Stock phrase, used unchanged', output: OUT_SKILLS, decision: 'unchanged',
      critique: 'Looks good.', expectedLevel: 1, expectedFlags: ['shortCritique', 'genericCritique', 'unchangedNoCheck', 'belowLevel'] },
    { id: 'T3', title: 'Empty critique', output: OUT_SKILLS, decision: 'unchanged',
      critique: '', expectedLevel: 0, expectedFlags: ['noCritique', 'unchangedNoCheck'] },
    { id: 'T4', title: 'Critique pasted from the AI output', output: OUT_CHAT, decision: 'changed',
      critique: 'Chatbots can now answer common customer questions, while AI writing tools can produce routine emails and reports in seconds.',
      expectedLevel: 2, expectedFlags: ['repeatsOutput', 'belowLevel'] },
    { id: 'T5', title: 'Short but specific correction', output: OUT_REFS, decision: 'changed',
      critique: 'Wrong year, checked MBIE site: 2023. Fixed.',
      expectedLevel: 4, expectedFlags: [], note: 'Failed in the first MVP. Short critiques that mention a check or a correction are now exempt from the length rule.' },
    { id: 'T6', title: 'Judgement with a reason, no check', output: OUT_SKILLS, decision: 'changed',
      critique: 'The list is too general and misses anything specific to New Zealand employers, so I rewrote the paragraph around my own example.',
      expectedLevel: 3, expectedFlags: [] },
    { id: 'T7', title: 'Reflection in AI-style wording', output: OUT_SKILLS, decision: 'changed',
      critique: 'It is important to note that the AI response provides a comprehensive overview of the key skills, which offers valuable insights for my essay and its overall argument.',
      expectedLevel: 2, expectedFlags: ['belowLevel', 'aiStyle'] },
    { id: 'T8', title: 'Used unchanged after a check', output: OUT_EVIDENCE, decision: 'unchanged',
      critique: 'Checked against Stats NZ table 3 and the numbers match, so used as is.',
      expectedLevel: 3, expectedFlags: [] },
    { id: 'T9', title: 'Describes without judging', output: OUT_SKILLS, decision: 'changed',
      critique: 'The AI gave me a list of skills like communication and digital literacy for new workers in the future.',
      expectedLevel: 2, expectedFlags: ['belowLevel'] },
    { id: 'T10', title: 'Rejected with no reason', output: OUT_AUTO, decision: 'not_used',
      critique: 'Did not use.', expectedLevel: 1, expectedFlags: ['belowLevel'] },
    { id: 'T11', title: 'Agrees and says why', output: OUT_AUTO, decision: 'unchanged',
      critique: 'I agree because it matches what our lecturer said about routine tasks in week 3.',
      expectedLevel: 3, expectedFlags: [] },
    { id: 'T12', title: 'Long restatement, used unchanged', output: OUT_AUTO, decision: 'unchanged',
      critique: 'The AI explained that task automation means that specific tasks within a job are performed by software rather than people, so routine work is increasingly automated.',
      expectedLevel: 2, expectedFlags: ['unchangedNoCheck', 'repeatsOutput', 'belowLevel'] }
  ];
});
