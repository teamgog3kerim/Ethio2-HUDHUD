import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '@/lib/app';
import './startup-welcome.css';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const SKIP_PATH = /^\/(sign-in|sign-up|start|billing|choose-plan|sso-callback|oauth)(\/|$)/;
const SKIP_PARAM = /(^|[?&#])(code|state|session_id|checkout_id|customer_session_token|checkout|oauth_callback|error)=/i;

function shouldSkip(): boolean {
  const { pathname, search, hash } = window.location;
  const path = base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
  return SKIP_PATH.test(path) || SKIP_PARAM.test(search) || SKIP_PARAM.test(hash) || /sso-callback|callback/i.test(path + hash);
}

// Evaluated once per document launch; route transitions never re-trigger it.
let pending = typeof window !== 'undefined' && !shouldSkip();
const DURATION = 16000;

export function StartupWelcome() {
  const { t, lang } = useApp();
  const [open, setOpen] = useState(pending);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { pending = false; setOpen(false); }, []);

  useEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const prev = document.activeElement as HTMLElement | null;
    btn.current?.focus();
    const timer = window.setTimeout(close, DURATION);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', key);
      root?.removeAttribute('inert');
      if (prev && document.contains(prev)) prev.focus?.();
    };
  }, [open, close]);

  if (!open) return null;
  return createPortal(
    <div className="sw-root" role="dialog" aria-modal="true" aria-label={t('مرحبًا بك في هدهد', 'Welcome to Hudhud')} dir={lang === 'ar' ? 'rtl' : 'ltr'} data-testid="startup-welcome">
      <div className="sw-inner">
        <img className="sw-bird" src={`${base}/icons/icon-512.png`} alt="" width={160} height={160} />
        <h1 className="sw-title sw-line" style={{ animationDelay: '.35s' }}>{t('مرحبًا بك في هدهد', 'Welcome to Hudhud')}</h1>
        <p className="sw-sub sw-line" style={{ animationDelay: '.7s' }}>{t('تعلّم الأمهرية بالعربية', 'Learn Amharic through Arabic')}</p>
        <p className="sw-body sw-line" style={{ animationDelay: '1.1s' }}>{t('تواصل مع أهل إثيوبيا، واكتشف ثقافتها العريقة وثراء تراثها، في واحدة من أكبر دول أفريقيا.', 'Connect with the people of Ethiopia and discover its ancient culture and rich heritage, in one of Africa\u2019s largest countries.')}</p>
        <p className="sw-enjoy sw-line" style={{ animationDelay: '1.6s' }}>{t('استمتع برحلتك في التعلّم', 'Enjoy your learning journey')}</p>
        <button ref={btn} type="button" className="sw-skip sw-line" style={{ animationDelay: '.9s' }} onClick={close} data-testid="button-startup-skip">{t('متابعة', 'Continue')}</button>
      </div>
      <span className="sw-bar" aria-hidden="true" />
    </div>,
    document.body,
  );
}
