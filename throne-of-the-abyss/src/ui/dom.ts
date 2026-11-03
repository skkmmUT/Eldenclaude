/** Tiny DOM helper: el('div.cls1.cls2', {attrs}, children). */
export function el<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}`,
  props: Partial<Record<string, string>> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag as K);
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
