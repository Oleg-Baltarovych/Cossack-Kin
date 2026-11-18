// Keeps <html lang> in step with the game language, so screen readers and hyphenation follow it (SPEC §6.8, §11).
import { useEffect } from 'react';
import { useGame } from '../hooks/useGame.ts';

export function DocumentLang() {
  const lang = useGame((s) => s.settings.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
