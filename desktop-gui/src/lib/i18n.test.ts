import { describe, it, expect } from 'vitest';
import { t, setLang, getLang } from './i18n';

describe('i18n', () => {
  it('returns the Russian source unchanged in ru mode', () => {
    setLang('ru');
    expect(t('Новый чат')).toBe('Новый чат');
    expect(getLang()).toBe('ru');
  });

  it('translates to English', () => {
    setLang('en');
    expect(t('Новый чат')).toBe('New chat');
    expect(t('Настройки')).toBe('Settings');
    expect(t('Отмена')).toBe('Cancel');
    expect(t('Размышления')).toBe('Reasoning');
    expect(t('Готово')).toBe('Done');
    expect(t('Скопировано')).toBe('Copied');
    expect(t('Ожидание запуска...')).toBe('Waiting to run...');
    expect(t('токенов')).toBe('tokens');
  });

  it('translates to Chinese', () => {
    setLang('zh');
    expect(t('Новый чат')).toBe('新对话');
    expect(t('Настройки')).toBe('设置');
    expect(t('Размышления')).toBe('推理');
    expect(t('Готово')).toBe('完成');
    expect(t('Скопировано')).toBe('已复制');
    expect(t('Ожидание запуска...')).toBe('等待运行...');
  });

  it('falls back to the source string for unknown keys', () => {
    setLang('en');
    expect(t('какая-то неизвестная строка')).toBe('какая-то неизвестная строка');
    setLang('ru');
  });
});
