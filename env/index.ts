/**
 * 全局环境配置
 * 通过 process.env.NODE_ENV 区分不同环境，无需手动切换
 *
 * - development：开发环境（HBuilderX 运行/调试时）
 * - production：生产环境（HBuilderX 发行打包时）
 */

/** 环境配置类型定义 */
export interface EnvConfig {
	/** 环境标识 */
	env: 'development' | 'staging' | 'production'
	/** 接口请求基础地址 */
	baseUrl: string
	/** 应用ID */
	appId: string
	/** 应用名称 */
	appName: string
	/** 是否开启调试 */
	debug: boolean
	/** 版本号 */
	version: string
}

/** 开发环境配置 */
const development: EnvConfig = {
	env: 'development',
	baseUrl: 'http://localhost:8080/web/api',
	appId: 'dev-app-id',
	appName: 'study_app',
	debug: true,
	version: '1.0.0'
}

/** 预发布环境配置 */
const staging: EnvConfig = {
	env: 'staging',
	baseUrl: 'http://10.1.3.175:8080/web/api',
	appId: 'staging-app-id',
	appName: 'study_app',
	debug: false,
	version: '1.0.0'
}

/** 生产环境配置 */
const production: EnvConfig = {
	env: 'production',
	baseUrl: 'http://10.1.3.175:8080/web/api',
	appId: 'prod-app-id',
	appName: 'study_app',
	debug: false,
	version: '1.0.0'
}

/** 当前环境 */
const NODE_ENV = process.env.NODE_ENV || 'development'

/** 根据当前环境获取对应配置 */
const envConfigMap: Record<string, EnvConfig> = {
	development,
	staging,
	production
}

/** 导出当前环境配置 */
const envConfig: EnvConfig = envConfigMap[NODE_ENV]

/** 导出所有环境配置 */
export { development, staging, production }

/** 默认导出当前环境配置 */
export default envConfig
