/**
 * The tutor ends an answer with two questions the learner could ask next, one per line, each
 * starting with ">> " (system instruction in api/learn/_learnGateway.ts). They are shown as buttons,
 * not as text. While the answer streams, a line that has only begun with ">" is held back too, so
 * the marker never flashes on screen.
 */
const FOLLOW_UP = /^\s*>>\s*(.+?)\s*$/;
const MAX_FOLLOW_UPS = 2;
const MAX_FOLLOW_UP_LENGTH = 160;

export function splitAnswer(text: string): { body: string; followUps: string[] } {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const body: string[] = [];
  const followUps: string[] = [];
  lines.forEach((line, index) => {
    const match = FOLLOW_UP.exec(line);
    if (match != null) {
      const question = match[1]!.replace(/^\*\*(.+)\*\*$/, "$1").trim();
      if (question.length > 0 && question.length <= MAX_FOLLOW_UP_LENGTH && followUps.length < MAX_FOLLOW_UPS) followUps.push(question);
      return;
    }
    const isLast = index === lines.length - 1;
    if (isLast && /^\s*>\s*$/.test(line)) return;
    body.push(line);
  });
  return { body: body.join("\n").trimEnd(), followUps };
}
