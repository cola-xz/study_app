import { getToken } from '@/utils/request'

/**
 * 路由路径常量统一管理
 */
export interface RoutePaths {
	[key: string]: string
}

export const ROUTES: RoutePaths = {
	login: '/pages/system/login',
	home: '/pages/home/home',
}

/**
 * 路由详细元信息配置表
 * 用于自动获取当前页面标题等信息
 */
export interface RouteMeta {
	title?: string
	icon?: string
	[prop: string]: any
}

export interface RouteConfig extends RouteMeta {
	path: string
}

/**
 * 静态路由元信息配置（key 为页面路径）
 * 动态路由可通过 addRouteMeta / buildRouteMeta 在运行时补充
 */
export const ROUTE_META: Record<string, RouteMeta> = {
	'/pages/system/login': { title: '登录' },
	'/pages/home/home': { title: '首页' },
}

/**
 * 往路由元信息表中新增/覆盖配置
 */
export function addRouteMeta(path: string, meta: RouteMeta): void {
	ROUTE_META[path] = { ...ROUTE_META[path], ...meta }
}

/**
 * 根据页面路径获取详情配置（未配置时返回空对象）
 */
export function getRouteMeta(path: string): RouteMeta | undefined {
	return ROUTE_META[path]
}

/**
 * 白名单路由：无需登录即可访问
 * 登录页本身无需登录
 */
const WHITE_LIST: string[] = [
	ROUTES.login
]

/**
 * 获取当前页面路径
 */
export function getCurrentPage(): string {
	const pages = getCurrentPages()
	if (!pages.length) return ''
	const route = (pages[pages.length - 1] as any).route
	return '/' + (route || '')
}

/**
 * 是否需要登录
 */
export function isNeedLogin(path: string): boolean {
	if (WHITE_LIST.includes(path)) return false
	return true
}

/**
 * 判断当前是否已登录
 */
export function isLogin(): boolean {
	return !!getToken()
}

/**
 * 跳转到登录页
 */
export function redirectToLogin(): void {
	uni.navigateTo({ url: ROUTES.login })
}

/**
 * 跳转后返回登录前地址
 */
export function backToLogin(from?: string): void {
	uni.navigateTo({
		url: ROUTES.login + (from ? `?from=${encodeURIComponent(from)}` : '')
	})
}

/**
 * 退出登录并跳转到登录页
 */
export function logout(): void {
	uni.removeStorageSync('study_app_token')
	uni.removeStorageSync('study_app_user_info')
	uni.reLaunch({ url: ROUTES.login })
}

/**
 * 封装页面跳转（带守卫）
 * 未登录且目标页需要登录时，自动跳转登录页并记录来源
 */
function navigateWithGuard(api: 'navigateTo' | 'redirectTo' | 'reLaunch' | 'switchTab', url: string): void {
	if (isNeedLogin(url) && !isLogin()) {
		backToLogin(encodeURIComponent(getCurrentPage() || ROUTES.home))
		return
	}
	uni[api]({ url })
}

/**
 * 页面跳转带守卫
 */
export const router = {
	to(url: string) {
		navigateWithGuard('navigateTo', url)
	},
	toTab(url: string) {
		navigateWithGuard('switchTab', url)
	},
	replace(url: string) {
		navigateWithGuard('redirectTo', url)
	},
	reLaunch(url: string) {
		navigateWithGuard('reLaunch', url)
	},
	back() {
		uni.navigateBack()
	}
}

/**
 * 页面级登录守卫
 * 供业务页（app-layout onLoad）调用，作为 addInterceptor 的跨端兜底校验。
 * 返回 true 表示通过，false 表示未通过（已跳转登录页）
 */
export function guardCurrentPage(): boolean {
	if (isLogin()) return true
	safeRedirectToLogin(getCurrentPage() || ROUTES.home)
	return false
}

/**
 * 是否正在跳转登录页（防止守卫递归触发）
 */
let redirectingToLogin = false

/**
 * 跳转到登录页（由守卫调用，使用顶部模式），防止与拦截器互相干扰
 */
function safeRedirectToLogin(from?: string): void {
	if (redirectingToLogin) return
	redirectingToLogin = true
	const fromStr = from ? `?from=${encodeURIComponent(from)}` : ''
	uni.navigateTo({
		url: ROUTES.login + fromStr,
		complete: () => {
			// 跳转完成后释放标记
			setTimeout(() => {
				redirectingToLogin = false
			}, 600)
		}
	})
}

/**
 * 初始化路由守卫
 * 通过 uni.addInterceptor 拦截所有页面跳转 API
 */
export function setupRouterGuard(): void {
	const guardInterceptor = (args: any) => {
		const url: string = args.url || ''
		// 去除 query 参数，仅比较 path 部分
		const path = url.split('?')[0]

		// 目标页面需要登录且未登录
		if (isNeedLogin(path) && !isLogin()) {
			// 记录来源页面并跳转登录
			safeRedirectToLogin(getCurrentPage() || ROUTES.login)
			// 返回 false 阻止本次跳转
			return false
		}
		// 放行：不显式返回 true（返回 undefined）
	}

	try {
		const methods = ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab'] as const
		methods.forEach((method) => {
			uni.addInterceptor(method, {
				invoke: guardInterceptor
			})
		})
	} catch (e) {
		console.warn('路由守卫初始化失败', e)
	}
}
