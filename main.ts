import App from './App'
import { setupRouterGuard } from '@/utils/router'

// 初始化路由守卫（登录鉴权拦截）
setupRouterGuard()

// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'
Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({ ...(App as any) }) as any;
app.$mount()
// #endif

// #ifdef VUE3
import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'

export function createApp() {
	const app = createSSRApp(App)
	app.use(createPinia())
	return { app }
}
// #endif
