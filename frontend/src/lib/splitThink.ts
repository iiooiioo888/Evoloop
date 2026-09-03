/** 從模型輸出拆出思考過程與可見回答。 */
export function splitThink(text: string): { thinking: string; content: string } {
  const thoughts: string[] = [];
  let rest = text ?? '';
  rest = rest.replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner: string) => {
    const t = String(inner).trim();
    if (t) thoughts.push(t);
    return '';
  });
  const open = rest.match(/<think>([\s\S]*)$/i);
  if (open?.index != null) {
    const extra = open[1].trim();
    if (extra) thoughts.push(extra);
    rest = rest.slice(0, open.index);
  }
  return { thinking: thoughts.join('\n\n'), content: rest.trim() };
}

export function eventBody(data: Record<string, unknown>): string {
  const keys = [
    'output',
    'thinking',
    'feedback',
    'error',
    'title',
    'phase',
    'tool',
    'role',
    'critique',
    'suggestion',
    'score',
  ];
  const parts: string[] = [];
  for (const k of keys) {
    const v = data[k];
    if (v == null || v === '') continue;
    if (k === 'title' || k === 'phase' || k === 'tool' || k === 'role') {
      parts.push(String(v));
      continue;
    }
    parts.push(String(v));
  }
  return parts.join('\n');
}
