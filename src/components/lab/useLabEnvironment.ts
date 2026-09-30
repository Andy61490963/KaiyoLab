import { useEffect, useMemo, useState } from 'react';

type Environment = {
  language: 'en' | 'zh-TW';
  reducedMotion: boolean;
  visible: boolean;
  theme: 'light' | 'dark';
};

// 伺服器與第一次 hydration 使用相同值，掛載後才讀瀏覽器偏好
const initial: Environment = {
  language: 'en',
  reducedMotion: true,
  visible: false,
  theme: 'light',
};

export function useLabEnvironment() {
  const [environment, setEnvironment] = useState<Environment>(initial);
  useEffect(() => {
    const root = document.documentElement;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      const next: Environment = {
        language: root.dataset.uiLanguage === 'zh-TW' ? 'zh-TW' : 'en',
        reducedMotion: motion.matches,
        visible: document.visibilityState === 'visible',
        theme: root.dataset.theme === 'dark' ? 'dark' : 'light',
      };
      setEnvironment((previous) =>
        Object.keys(next).every(
          (key) => previous[key as keyof Environment] === next[key as keyof Environment],
        )
          ? previous
          : next,
      );
    };
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-ui-language', 'data-theme'],
    });
    motion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return useMemo(
    () => ({
      ...environment,
      t: (zh: string, en: string) => (environment.language === 'zh-TW' ? zh : en),
    }),
    [environment],
  );
}
