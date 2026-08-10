import envConfig from '@/env/index'

/**
 * 统一响应结构（与后端约定）
 * code: 业务状态码，0 表示成功
 */
export interface ApiResponse<T = any> {
	code: number
	data: T
	message: string
	timestamp: string
}

/**
 * 请求选项扩展
 */
export interface RequestOptions {
	/** 请求路径（不包含 baseUrl） */
	url: string
	/** 请求方法 */
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
	/** 请求参数 */
	data?: any
	/** 是否显示加载提示 */
	loading?: boolean
	/** 加载提示文字 */
	loadingText?: string
	/** 是否携带 token */
	withToken?: boolean
	/** 请求超时时间（毫秒） */
	timeout?: number
	/** 是否静默失败（不弹错误提示） */
	silent?: boolean
	/** 额外请求头 */
	header?: Record<string, string>
}

/** 接口响应数据 */
export interface IApiResult<T = any> {
	code: number
	data: T
	message: string
}

/** Token 管理 key */
const TOKEN_KEY = 'study_app_token'

/**
 * appId 用于自定义请求头，可帮助后端识别来源
 */
const DEFAULT_TIMEOUT = 15000

/** 当前是否正在显示 loading */
let isLoading = false

/**
 * 存储 token
 */
export function setToken(token: string): void {
	uni.setStorageSync(TOKEN_KEY, token)
}

/**
 * 获取 token
 */
export function getToken(): string {
	return uni.getStorageSync(TOKEN_KEY) || ''
}

/**
 * 清除 token
 */
export function clearToken(): void {
	uni.removeStorageSync(TOKEN_KEY)
}

/**
 * 清除登录状态（token信息）
 */
export function clearLoginState(): void {
	clearToken()
}

/**
 * 显示 loading
 */
function showLoading(text: string): void {
	if (isLoading) return
	isLoading = true
	uni.showLoading({
		title: text || '加载中...',
		mask: true
	})
}

/**
 * 隐藏 loading
 */
function hideLoading(): void {
	if (!isLoading) return
	isLoading = false
	uni.hideLoading()
}

/**
 * 提示错误信息
 */
function showError(message: string, silent: boolean): void {
	if (silent) return
	uni.showToast({
		title: message || '请求失败',
		icon: 'none',
		duration: 2000
	})
}

/**
 * 统一的登录失效处理
 */
function handleUnauthorized(): void {
	clearLoginState()
	// 跳转登录页，配合路由守卫使用
	uni.navigateTo({ url: '/pages/system/login' })
}

/**
 * 核心请求方法
 */
export function request<T = any>(options: RequestOptions): Promise<IApiResult<T>> {
	const {
		url,
		method = 'GET',
		data = {},
		loading = false,
		loadingText = '加载中...',
		withToken = true,
		timeout = DEFAULT_TIMEOUT,
		silent = false,
		header = {}
	} = options

	const token = getToken()

	// 拼接完整地址
	const requestUrl = url.startsWith('http') ? url : envConfig.baseUrl + url

	if (loading) {
		showLoading(loadingText)
	}

	return new Promise<IApiResult<T>>((resolve, reject) => {
		uni.request({
			url: requestUrl,
			method,
			data,
			timeout,
			header: {
				'Content-Type': 'application/json',
				'appId': envConfig.appId,
				...(withToken && token ? { 'Authorization': `Bearer ${token}` } : {}),
				...header
			},
			success: (res) => {
				if (res.statusCode === 200) {
					const body = res.data as ApiResponse<T>
					if (body.code === 200) {
						resolve({ code: body.code, data: body.data, message: body.message })
					} else if (body.code === 401) {
						// 登录失效
						handleUnauthorized()
						showError('登录已过期，请重新登录', silent)
						reject({ code: body.code, data: null, message: body.message })
					} else {
						showError(body.message || '请求失败', silent)
						reject({ code: body.code, data: null, message: body.message })
					}
				} else {
					showError(`请求异常（${res.statusCode}）`, silent)
					reject({
						code: res.statusCode,
						data: null,
						message: `请求异常（${res.statusCode}）`
					})
				}
			},
			fail: (err) => {
				showError('网络异常，请检查网络后重试', silent)
				reject({ code: -1, data: null, message: err.errMsg || '网络异常' })
			},
			complete: () => {
				if (loading) {
					hideLoading()
				}
			}
		})
	})
}

/**
 * GET 请求快捷方法
 */
export function get<T = any>(url: string, data?: any, options?: Partial<RequestOptions>): Promise<IApiResult<T>> {
	return request<T>({ url, method: 'GET', data, ...options })
}

/**
 * POST 请求快捷方法
 */
export function post<T = any>(url: string, data?: any, options?: Partial<RequestOptions>): Promise<IApiResult<T>> {
	return request<T>({ url, method: 'POST', data, ...options })
}

/**
 * PUT 请求快捷方法
 */
export function put<T = any>(url: string, data?: any, options?: Partial<RequestOptions>): Promise<IApiResult<T>> {
	return request<T>({ url, method: 'PUT', data, ...options })
}

/**
 * DELETE 请求快捷方法
 */
export function del<T = any>(url: string, data?: any, options?: Partial<RequestOptions>): Promise<IApiResult<T>> {
	return request<T>({ url, method: 'DELETE', data, ...options })
}

export default request
