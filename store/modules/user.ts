import { defineStore } from 'pinia';
import { login, getUserInfo } from '@/api/user';
import { useSettingStore } from '@/store/modules/setting';
import { useRouterStore } from '@/store/modules/router';
import { setToken, getToken } from '@/utils/request';
import { ROUTES, router } from '@/utils/router';
import { clearLoginState } from '@/utils/request';

export const useUserStore = defineStore({
  id: 'user',
  state: (): any => ({
    userInfo: null,
  }),

  getters: {
    // 获取用户信息
    getUserInfo(): Object {
      return this.userInfo || ({} as Object);
    },
  },

  actions: {
    // 设置用户信息
    setUserInfo(userInfo: Object) {
      this.userInfo = userInfo;
    },

    // 模拟登录
    async login(loginParams: {
      username: string;
      password: string;
    }) {
      try {
        // 这里应该是调用实际的登录API
        const { username, password } = loginParams;
        let params: any = {};
        params['username'] = username;
        params['password'] = password;
        // 示例API调用：
        const response = await login(params);
        const { token } = response.data;

        // 设置token和用户信息
        setToken(token);
        let homePath: string | null = await this.fetchUserInfo(); // 获取用户信息并设置到store

        // 登录成功，返回true
        return homePath;
      } catch (error) {
        throw new Error('登录失败');
      }
    },

    // 模拟获取用户信息
    async fetchUserInfo() {
      try {
        let token = getToken();
        if (!token) {
          return router.to(ROUTES.login);
        }

        // 这里应该是调用获取用户信息的API
        const response = await getUserInfo({
			clientType: "app"
		});
        const userInfo = response.data;

        const settingStore = useSettingStore();
        settingStore.setTheme('style', response.data.theme);

        // 留存用户信息到store
        this.setUserInfo(userInfo);

        // 是否加载了动态路由
        const routerStore = useRouterStore();
		await routerStore.generateRoutes();

        // 移动端大屏
        return '/pages/home/home';
      } catch (error) {
        throw error;
      }
    },

    // 模拟登出
    async logout() {
      try {
        // 清除本地存储
        this.userInfo = null;

		const routerStore = useRouterStore();
		routerStore.resetRoutes();

        // 跳转到登录页
        clearLoginState();

		uni.reLaunch({ url: ROUTES.login })

		return uni.showToast({ title: '登出成功', icon: 'none' })
      } catch (error) {
        throw new Error('登出失败');
      }
    },
  },
});
