import { get, post } from '@/utils/request'

/**
 * 获取小说列表
 */
export function getAllFilesByFileType(data: any): Promise<any> {
	return post<any>('/getAllFilesByFileType', data)
}

/**
 * 获取用户阅读的集数
 */
export function getUserNovel(data: any): Promise<any> {
	return post<any>('/getUserNovel', data)
}

/**
 * 获取小说集数
 */
export function getChapterInfo(data: any): Promise<any> {
	return post<any>('/getChapterInfo', data)
}
