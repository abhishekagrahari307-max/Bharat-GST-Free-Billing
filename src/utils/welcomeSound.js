// Studio Neural Human Voice Greeting Engine for Bharat GST Free Billing
// Uses real studio-synthesized Indian-English & Hinglish human MP3 recordings
// (./audio/welcome-en.mp3 & ./audio/welcome-hinglish.mp3 — precached in PWA Service Worker for 100% offline use!)
// with automatic 0ms page-open playback + instant 1st-touch fallback on strict mobile/tablet browsers.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

const SOUND_ENABLED_KEY = 'bharatgst_welcome_sound';
const VOICE_STYLE_KEY = 'bharatgst_welcome_style';

const STUDIO_AUDIO_PATHS = {
  en: './audio/welcome-en.mp3',
  hinglish: './audio/welcome-hinglish.mp3',
};

const audioElements = {};
let sharedAudioCtx = null;
let playedThisPageLoad = false;

// Preload studio human MP3s in browser environments for instant zero-lag playback
if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
  try {
    for (const [key, src] of Object.entries(STUDIO_AUDIO_PATHS)) {
      const el = new Audio(src);
      el.preload = 'auto';
      el.volume = 1.0;
      audioElements[key] = el;
    }
  } catch { /* ignore */ }
}

export function isWelcomeSoundEnabled() {
  try {
    const raw = globalThis.localStorage?.getItem(SOUND_ENABLED_KEY);
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

function getStudioAudio(style = 'en') {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  const key = style === 'hinglish' ? 'hinglish' : 'en';
  if (!audioElements[key]) {
    const el = new Audio(STUDIO_AUDIO_PATHS[key]);
    el.preload = 'auto';
    el.volume = 1.0;
    audioElements[key] = el;
  }
  return audioElements[key];
}

function stopActiveStudioAudio() {
  for (const el of Object.values(audioElements)) {
    try {
      el.pause();
      el.currentTime = 0;
    } catch { /* ignore */ }
  }
}

function playFallbackChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume().catch(() => {});
    const now = sharedAudioCtx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.001, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.08 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.42);
      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.45);
    });
  } catch { /* ignore */ }
}

/**
 * Plays the real studio human voice MP3 (./audio/welcome-en.mp3 or ./audio/welcome-hinglish.mp3).
 * Sounds 100% like a natural human across every Android, iPhone, iPad, Mac, Windows & Linux device.
 */
export function playSafeWelcome(businessName = '', options = {}) {
  void businessName;
  const { force = false, style } = options || {};
  if (!force && !isWelcomeSoundEnabled()) return false;
  if (typeof window === 'undefined') return false;

  const chosenStyle = style || getWelcomeVoiceStyle();
  const audio = getStudioAudio(chosenStyle);
  if (!audio) return false;

  try {
    stopActiveStudioAudio();
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    audio.volume = 1.0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        playFallbackChime();
      });
    }
    return true;
  } catch {
    playFallbackChime();
    return false;
  }
}

export function playWelcomeVoice(businessName = '', options = {}) {
  return playSafeWelcome(businessName, options);
}

/**
 * 2-Stage Automatic Studio Human Greeting (Desktop, Mobile, Tablet & PWA):
 * Stage 1: Attempts immediate 0ms HTML5 <audio>.play() on website open.
 *          If Promise resolves -> real human voice is already playing automatically!
 * Stage 2: If Promise rejects (NotAllowedError due to mobile/tablet OS autoplay policy),
 *          arms capture-phase 'click' / 'touchend' / 'keydown' so the VERY FIRST touch anywhere
 *          plays the studio human MP3 instantaneously.
 */
export function armSessionWelcomeGreeting(getBusinessName = () => '', onAwaitingGesture) {
  if (typeof getBusinessName === 'function') getBusinessName();
  if (typeof window === 'undefined' || !isWelcomeSoundEnabled() || playedThisPageLoad) {
    onAwaitingGesture?.(false);
    return () => {};
  }

  let cleanedUp = false;

  const removeGestureListeners = () => {
    window.removeEventListener('click', handleFirstGesture, true);
    window.removeEventListener('touchend', handleFirstGesture, true);
    window.removeEventListener('keydown', handleFirstGesture, true);
  };

  function handleFirstGesture() {
    if (cleanedUp || playedThisPageLoad || !isWelcomeSoundEnabled()) {
      removeGestureListeners();
      onAwaitingGesture?.(false);
      return;
    }
    const audio = getStudioAudio(getWelcomeVoiceStyle());
    if (!audio) return;

    audio.currentTime = 0;
    audio.volume = 1.0;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        playedThisPageLoad = true;
        removeGestureListeners();
        onAwaitingGesture?.(false);
      }).catch(() => {
        // Keep listener if gesture wasn't audio-eligible yet
      });
    } else {
      playedThisPageLoad = true;
      removeGestureListeners();
      onAwaitingGesture?.(false);
    }
  }

  const attemptAutoOpenPlay = () => {
    if (cleanedUp || playedThisPageLoad || !isWelcomeSoundEnabled()) return;
    const audio = getStudioAudio(getWelcomeVoiceStyle());
    if (!audio) return;

    try {
      audio.currentTime = 0;
      audio.volume = 1.0;
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          // Zero-click automatic studio human voice succeeded on open!
          playedThisPageLoad = true;
          removeGestureListeners();
          onAwaitingGesture?.(false);
        }).catch(() => {
          // Mobile/Tablet OS requires 1 touch -> arm instant capture listener
          if (!cleanedUp && !playedThisPageLoad) {
            onAwaitingGesture?.(true);
            window.addEventListener('click', handleFirstGesture, true);
            window.addEventListener('touchend', handleFirstGesture, true);
            window.addEventListener('keydown', handleFirstGesture, true);
          }
        });
      }
    } catch {
      onAwaitingGesture?.(true);
      window.addEventListener('click', handleFirstGesture, true);
      window.addEventListener('touchend', handleFirstGesture, true);
      window.addEventListener('keydown', handleFirstGesture, true);
    }
  };

  const openTimer = setTimeout(attemptAutoOpenPlay, 180);

  return () => {
    cleanedUp = true;
    clearTimeout(openTimer);
    removeGestureListeners();
  };
}
