import { el } from './dom';

export interface ModalHandle {
  close: () => void;
  element: HTMLElement;
}

/** Shows a modal over the given root; returns a handle to close it. */
export function showModal(
  root: HTMLElement,
  content: HTMLElement,
  opts: { dismissible?: boolean; onClose?: () => void } = {},
): ModalHandle {
  const backdrop = el('div', { class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true' });
  const modal = el('div', { class: 'modal' }, content);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && opts.dismissible !== false) {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  if (opts.dismissible !== false) {
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) close();
    });
  }
  const focusable = modal.querySelector<HTMLElement>('button, input, select');
  focusable?.focus();
  return { close, element: modal };
}

export function confirmModal(root: HTMLElement, message: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const content = el('div', { class: 'buttons' });
    content.appendChild(el('p', { text: message, style: { margin: '0 0 8px' } }));
    const row = el('div', { class: 'buttons row' });
    const handle = showModal(root, content, { onClose: () => resolve(false) });
    row.appendChild(
      el('button', {
        class: 'danger',
        text: yes,
        onclick: () => {
          resolve(true);
          handle.close();
        },
      }),
    );
    row.appendChild(el('button', { text: no, onclick: () => handle.close() }));
    content.appendChild(row);
  });
}
