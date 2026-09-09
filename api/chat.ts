import { get, post } from '@/utils/request';

/**
 * 聊天相关后端接口
 * 以下接口/路径为按业务约定的占位实现；后端实际地址确认后按
 * 你项目 utils/request 的返回约定（{ code, data, message }）替换即可运行。
 * 多数返回空列表，避免影响前端联调。
 */

export interface RecordQuery {
	sendUserId?: string;
	receiveUserId?: string;
	isGroup?: number;
	groupId?: string;
	page?: number;
	size?: number;
}

export interface SaveRecordParams {
	id?: string;
	sendUserId?: string;
	receiveUserId?: string;
	type?: string;
	content?: string;
	isGroup?: number;
	groupId?: string;
}

/** 好友列表 */
export function getFriendList(data: any): Promise<any> {
	return post<any>('/getFriendList', data);
}

/** 消息列表 */
export function getMessageRecord(data: any): Promise<any> {
	return post<any>('/getMessageRecord', data);
}

/** 历史记录查询（分页） */
export function getHistoryRecord(params: RecordQuery): Promise<any> {
	// TODO 后端地址未定：示例 get('/chat/history', params)
	return Promise.resolve({ code: 200, page: params.page || 1, data: [] });
}

/** 持久化一条发送过的消息 */
export function addMessageRecord(data: SaveRecordParams): Promise<any> {
	// TODO post('/chat/record', data)
	return Promise.resolve({ code: 200, data: null });
}

/** 拉取未读消息数 */
export function getUnreadCount(): Promise<any> {
	// TODO get('/chat/unread')
	return Promise.resolve({ code: 200, data: { count: 0 } });
}
