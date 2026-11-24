// Universal Cross-Device Welcome Chime + Voice Greeting Engine for Bharat GST Free Billing
// Works across Android Chrome, iOS/iPadOS Safari, Windows, macOS, Linux & Installed PWAs:
// 1. Plays a warm 4-Note Web Audio API Harmonic Chime (523.25 -> 659.25 -> 783.99 -> 1046.5 Hz) — 100% offline, 0 KB, works even without TTS voices.
// 2. Speaks dynamic English / Hinglish greeting via SpeechSynthesisUtterance (pre-warmed voices, GC-pinned, zero Chromium cancel+speak race bug).
// 3. Attempts 0ms automatic playback on page open (succeeds immediately in PWAs & high-MEI browsers) and seamlessly falls back to first-gesture ('click' / 'touchend' / 'keydown') on strict mobile/tablet browsers.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

const SOUND_ENABLED_KEY = 'bharatgst_welcome_sound';
const VOICE_STYLE_KEY = 'bharatgst_welcome_style';

let sharedAudioCtx = null;
let cachedVoices = [];
let playedThisPageLoad = false;

// Pre-warm TTS voices asynchronously on module load in browser environments
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    cachedVoices = window.speechSynthesis.getVoices() || [];
    window.speechSynthesis.addEventListener?.('voiceschanged', () => {
      try {
        cachedVoices = window.speechSynthesis.getVoices() || [];
      } catch { /* ignore */ }
    });
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

function getOrCreateAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

function scheduleChimeNotes(ctx) {
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + i * 0.08);
    gain.gain.setValueAtTime(0.001, now + i * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.08 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.52);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.08);
    osc.stop(now + i * 0.08 + 0.56);
  });
}

function pickBestVoice(voices = []) {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  return (
    voices.find((v) => /en[-_]IN/i.test(v.lang)) ||
    voices.find((v) => /hi[-_]IN/i.test(v.lang)) ||
    voices.find((v) => /IN/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0] ||
    null
  );
}

function speakUtteranceSafe(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return false;
  }
  try {
    const synth = window.speechSynthesis;
    const launch = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      // Prevent mobile Safari / Chrome Garbage Collector from dropping active utterance
      window.__bharatGstUtterance = utterance;
      const voices = cachedVoices.length ? cachedVoices : (synth.getVoices() || []);
      const bestVoice = pickBestVoice(voices);
      if (bestVoice) utterance.voice = bestVoice;
      utterance.lang = bestVoice?.lang || 'en-IN';
      utterance.rate = 1.0;
      utterance.pitch = 1.03;
      utterance.volume = 1.0;
      synth.speak(utterance);
    };

    // Avoid Chromium's cancel()+speak() synchronous race bug: only cancel if already speaking
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(launch, 60);
    } else {
      launch();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Plays BOTH the 4-note Web Audio Harmonic Chime (guaranteed on every phone/tablet/PC)
 * AND the spoken Welcome Voice Greeting.
 */
export function playSafeWelcome(businessName = '', options = {}) {
  const { force = false, style } = options || {};
  if (!force && !isWelcomeSoundEnabled()) return false;
  if (typeof window === 'undefined') return false;

  let chimePlayed = false;
  try {
    const ctx = getOrCreateAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          if (ctx.state === 'running') scheduleChimeNotes(ctx);
        }).catch(() => {});
      } else if (ctx.state === 'running') {
        scheduleChimeNotes(ctx);
        chimePlayed = true;
      }
    }
  } catch { /* ignore */ }

  const chosenStyle = style || getWelcomeVoiceStyle();
  const text = buildWelcomeVoiceText(businessName, chosenStyle);
  const voiceQueued = speakUtteranceSafe(text);
  return chimePlayed || voiceQueued;
}

// Primary API used across WelcomeCard, SupportView, and App
export function playWelcomeVoice(businessName = '', options = {}) {
  return playSafeWelcome(businessName, options);
}

/**
 * 2-Stage Automatic Launch Sound (Desktop, Mobile, Tablet & PWA):
 * Stage 1: Immediately attempts 0ms playback on website open (works automatically in PWAs & desktop browsers with MEI).
 * Stage 2: If mobile/tablet OS autoplay policy keeps AudioContext suspended until first touch,
 *          arms capture-phase 'click' / 'touchend' / 'keydown' so the VERY FIRST touch anywhere on screen
 *          synchronously unlocks AudioContext + TTS and plays the welcome chime & voice without fail!
 */
export function armSessionWelcomeGreeting(getBusinessName = () => '', onAwaitingGesture) {
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
    playedThisPageLoad = true;
    removeGestureListeners();
    onAwaitingGesture?.(false);

    const biz = typeof getBusinessName === 'function' ? getBusinessName() : '';
    try {
      const ctx = getOrCreateAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        scheduleChimeNotes(ctx);
      }
    } catch { /* ignore */ }
    const text = buildWelcomeVoiceText(biz, getWelcomeVoiceStyle());
    speakUtteranceSafe(text);
  }

  // Stage 1: Try automatic 0ms playback right as the website opens!
  const attemptAutoOpenPlay = () => {
    if (cleanedUp || playedThisPageLoad || !isWelcomeSoundEnabled()) return;
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) {
        // Fallback if Web Audio API unavailable
        window.addEventListener('click', handleFirstGesture, true);
        window.addEventListener('touchend', handleFirstGesture, true);
        window.addEventListener('keydown', handleFirstGesture, true);
        return;
      }

      const checkState = () => {
        if (cleanedUp || playedThisPageLoad) return;
        if (ctx.state === 'running') {
          // Browser allowed zero-touch automatic playback on open!
          playedThisPageLoad = true;
          removeGestureListeners();
          onAwaitingGesture?.(false);
          scheduleChimeNotes(ctx);
          const biz = typeof getBusinessName === 'function' ? getBusinessName() : '';
          speakUtteranceSafe(buildWelcomeVoiceText(biz, getWelcomeVoiceStyle()));
        } else {
          // Mobile/Tablet OS blocked zero-touch autoplay -> arm instant 1st-touch unlock
          onAwaitingGesture?.(true);
          window.addEventListener('click', handleFirstGesture, true);
          window.addEventListener('touchend', handleFirstGesture, true);
          window.addEventListener('keydown', handleFirstGesture, true);
        }
      };

      if (ctx.state === 'running') {
        checkState();
      } else {
        ctx.resume().then(checkState).catch(checkState);
        setTimeout(checkState, 180);
      }
    } catch {
      onAwaitingGesture?.(true);
      window.addEventListener('click', handleFirstGesture, true);
      window.addEventListener('touchend', handleFirstGesture, true);
      window.addEventListener('keydown', handleFirstGesture, true);
    }
  };

  // Delay 250ms on open so profile name (if cached) & browser audio pipeline settle
  const openTimer = setTimeout(attemptAutoOpenPlay, 250);

  return () => {
    cleanedUp = true;
    clearTimeout(openTimer);
    removeGestureListeners();
  };
}
