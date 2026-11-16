// Copiar al portapapeles en cualquier navegador. Muchos (los de dentro de WhatsApp o
// Instagram, algunos de móvil, los integrados en apps) no dejan usar navigator.clipboard
// y bloquean prompt() sin avisar, así que se prueba también el método antiguo.

/** Copia el texto; devuelve false si el navegador no lo permite de ninguna forma. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permiso denegado: se intenta a la antigua */
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  const sel = document.getSelection();
  const prev = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const active = document.activeElement as HTMLElement | null;
  ta.focus({ preventScroll: true });
  ta.select();
  ta.setSelectionRange(0, text.length); // iOS sólo copia con un rango explícito
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  if (prev && sel) {
    sel.removeAllRanges();
    sel.addRange(prev);
  }
  active?.focus?.({ preventScroll: true });
  return ok;
}

/** Hay menú nativo de compartir y es un móvil o tableta (en el ordenador no aporta). */
export function canShare(): boolean {
  try {
    return typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}
