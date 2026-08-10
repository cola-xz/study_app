// src/stores/setting.ts
import { defineStore } from 'pinia';

export const useSettingStore = defineStore({
  id: 'setting',
  state: (): any => ({
    theme: {
      style: null,
    },
  }),
  getters: {
    getTheme(): String {
      return this.theme;
    },
  },
  actions: {
    setTheme(themeObj: string, themeStyle: string) {
      this.theme[themeObj] = themeStyle;
    },
  },
});
