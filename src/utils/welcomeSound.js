// Welcome Voice Greeting Engine for Bharat GST Free Billing
// Supports English ('en') & Hinglish ('hinglish') greetings + Dynamic Business Name.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

const SOUND_ENABLED_KEY = 'bharatgst_welcome_sound';
const VOICE_STYLE_KEY = 'bharatgst_welcome_style';
const SESSION_PLAYED_KEY = 'bharatgst_welcome_played_session';

export function isWelcomeSoundEnabled() {
  try {
    const raw = globalThis.localStorage?.getItem(SOUND_ENABLED_KEY);
    // Default off for silent offices unless explicitly enabled, OR wait: default true per user spec!
    return raw === null ? true : raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

export function setWelcomeSoundEnabled(enabled) {
  try {
    globalThis.localStorage?.setItem(SOUND_ENABLED_KEY, enabled ? '1' : '0');
  } catch { /* ignore */ }
}

export function getWelcomeVoiceStyle() {
  try {
    const v = globalThis.localStorage?.getItem(VOICE_STYLE_KEY);
    return v === 'hinglish' ? 'hinglish' : 'en';
  } catch {
    return 'en';
  }
}

export function setWelcomeVoiceStyle(style = 'en') {
  try {
    globalThis.localStorage?.setItem(VOICE_STYLE_KEY, style === 'hinglish' ? 'hinglish' : 'en');
  } catch { /* ignore */ }
}

export function buildWelcomeVoiceText(businessName = '', style = getWelcomeVoiceStyle()) {
  const cleanBiz = String(businessName || '').trim();
  if (style === 'hinglish') {
    return cleanBiz
      ? `Bharat GST Free Billing mein aapka swagat hai, ${cleanBiz} — created by Abhishek Agrahari.`
      : 'Bharat GST Free Billing mein aapka swagat hai — created by Abhishek Agrahari.';
  }
  return cleanBiz
    ? `Welcome to Bharat GST Free Billing, ${cleanBiz}. Created by Abhishek Agrahari.`
    : 'Welcome to Bharat GST Free Billing, created by Abhishek Agrahari.';
}

export function playWelcomeVoice(businessName = '', options = {}) {
  const { force = false, style } = options || {};
  if (!force && !isWelcomeSoundEnabled()) return false;
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const chosenStyle = style || getWelcomeVoiceStyle();
    const text = buildWelcomeVoiceText(businessName, chosenStyle);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 1.0;
    utterance.pitch = 1.05;
    utterance.volume = 0.9;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function armSessionWelcomeGreeting(getBusinessName = () => '') {
  if (typeof window === 'undefined' || !isWelcomeSoundEnabled()) return () => {};
  try {
    if (window.sessionStorage?.getItem(SESSION_PLAYED_KEY) === '1') return () => {};
  } catch { /* ignore */ }

  const triggerOnce = () => {
    window.removeEventListener('pointerdown', triggerOnce);
    window.removeEventListener('keydown', triggerOnce);
    if (!isWelcomeSoundEnabled()) return;
    try {
      if (window.sessionStorage?.getItem(SESSION_PLAYED_KEY) === '1') return;
      window.sessionStorage?.setItem(SESSION_PLAYED_KEY, '1');
    } catch { /* ignore */ }
    playWelcomeVoice(typeof getBusinessName === 'function' ? getBusinessName() : '');
  };

  window.addEventListener('pointerdown', triggerOnce, { once: true, passive: true });
  window.addEventListener('keydown', triggerOnce, { once: true });
  return () => {
    window.removeEventListener('pointerdown', triggerOnce);
    window.removeEventListener('keydown', triggerOnce);
  };
}
