import { get, post } from '@/utils/request'

/** 登录参数 */
export interface LoginParams {
	username: string
	password: string
}

/** 注册参数 */
export interface RegisterParams {
	username: string
	password: string
	nickname: string
	email?: string
}

/** 用户信息 */
export interface UserInfo {
	id: string
	username: string
	nickname: string
	avatar: string
	email: string
	phone: string
	createdAt: string
}

/** 登录返回值 */
export interface LoginResult {
	token: string
	userInfo: UserInfo
}

/**
 * 用户登录
 */
export function login(data: LoginParams): Promise<any> {
	return post<any>('/login', data, { loading: true, loadingText: '登录中...' })
}

/**
 * 用户注册
 */
export function register(data: RegisterParams): Promise<any> {
	return post<any>('/auth/register', data, { loading: true, loadingText: '注册中...' })
}

/**
 * 获取当前用户信息
 */
export function getUserInfo(data: any): Promise<any> {
	return post<any>('/getUserInfo', data)
}

/**
 * 获取当前用户菜单信息
 */
export function getMenus(data: any): Promise<any> {
	return post<any>('/getMenus', data, { loading: true, loadingText: '加载菜单种...' })
}

/**
 * 扫码登录配置
 */
export function qrCodeScan(data: any): Promise<any> {
	return post<any>('/QrCodeScan', data)
}
