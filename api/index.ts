/**
 * API 接口统一出口
 * 使用方式：
 *   import { userApi } from '@/api'
 *   const res = await userApi.login({ username: 'xx', password: 'xx' })
 */
import * as userApi from './user'

export {
	userApi
}
