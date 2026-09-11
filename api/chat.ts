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

/** 搜索用户 */
export function searchUsers(data: any): Promise<any> {
	return post<any>('/searchUsers', data);
}

/** 发起好友申请 */
export function addFriend(data: any): Promise<any> {
	return post<any>('/addFriend', data);
}

/** 处理好友申请（同意/拒绝） */
export function dealWithFriendRequest(data: any): Promise<any> {
	return post<any>('/dealWithFriendRequest', data);
}

/** 消息列表 */
export function getMessageRecord(data: any): Promise<any> {
	return post<any>('/getMessageRecord', data);
}

/** 历史记录查询（分页） */
export function getHistoryRecord(params: RecordQuery): Promise<any> {
	return post<any>('/getHistoryRecord', params);
}

/** 持久化一条发送过的消息 */
export function addMessageRecord(data: SaveRecordParams): Promise<any> {
	return post<any>('/addMessageRecord', data);
}

/** 创建群聊 */
export function createGroupChat(data: any): Promise<any> {
	return post<any>('/addGroupChat', data);
}

/** 拉取未读消息数 */
export function getUnreadCount(): Promise<any> {
	// 后端暂无未读接口，返回 0 占位
	return Promise.resolve({ code: 200, data: { count: 0 } });
}
