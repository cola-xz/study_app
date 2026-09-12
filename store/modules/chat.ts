/**
 * 「聊天」Pinia store
 *
 * 说明：
 *  - 底层 WS 走 @/utils/stomp（基于 uni.connectSocket 的轻量 STOMP 客户端，多端可用）。
 *  - 鉴权 token 取 @/utils/request.getToken()，WS 地址取 @/env 的 wsUrl。
 *  - 后端接口目前多为占位实现，为保证前端可完整跑通，store 内置了
 *    mock 数据（会话列表 / 历史消息 / 好友列表 / 好友申请）。
 *    接口就绪后把 MOCK 开关置为 false 即可，无需改动页面。
 */
import { defineStore } from 'pinia';
import {
	connect as wsConnect,
	disconnect as wsDisconnect,
	send as wsSend,
	subscribe as wsSubscribe,
	StompState,
	type StompFrame,
} from '@/utils/stomp';
import { getToken } from '@/utils/request';
import { getHistoryRecord, addMessageRecord, getUnreadCount, getMessageRecord } from '@/api/chat';
import { getRequestFriendList } from '@/api/user';
import { useUserStore } from '@/store/modules/user';
import { generateUUID } from '@/utils/uuid';
import envConfig from '@/env/index';

/** 是否使用内置 mock 数据（后端接口未就绪时置 true） */
const USE_MOCK = false;

/** 消息类型枚举 */
export enum MessageType {
	CHAT = 'CHAT',
	JOIN = 'JOIN',
	LEAVE = 'LEAVE',
	TYPING = 'TYPING',
}

/** 聊天消息 */
export interface ChatMessage {
	id?: string;
	sendUserName?: string;
	sendUserId?: string;
	sendUserAvatar?: string;
	receiveUserName?: string;
	receiveUserId?: string;
	receiveUserAvatar?: string;
	content?: string;
	contentDate?: string;
	type?: MessageType | string;
	isGroup?: boolean;
	groupId?: string;
	isPublic?: boolean;
	messageType?: string;
	otherParams?: Record<any, string>;
	[key: string]: any;
}

/** 会话项：左侧「消息列表」使用 */
export interface ConversationItem {
	receiveUserInfo: {
		id: string;
		username: string;
		realName?: string;
		avatarUrl?: string | string[];
		isGroup?: boolean;
	};
	sendUserInfo?: Record<string, any>;
	lastMessage?: string;
	lastTime?: string;
	unreadCount?: number;
}

export interface ChatState {
	messages: ChatMessage[];
	isConnected: boolean;
	isConnecting: boolean;
	currentRoomId: string;
	unreadCount: number;
}

export interface ChatRoom {
	id: string;
	name: string;
	memberCount: number;
	lastMessage?: ChatMessage;
}

/** 统一的轻提示入口（替代 antd message，多端可用） */
function toast(text: string, icon: 'none' | 'success' | 'error' | 'loading' = 'none') {
	uni.showToast({ title: text, icon, duration: 2000 });
}

function warnLog(...args: any[]) {
	console.warn('[chat-store]', ...args);
}

/** 时间戳格式化：当天显示 HH:mm，昨天显示「昨天 HH:mm」，更早显示 MM-DD HH:mm */
export function formatChatTime(input?: string): string {
	if (!input) return '';
	// 兼容 ISO（2026-09-04T02:53:25.000+00:00）与普通（2026-09-04 10:00:00）
	let d = new Date(input);
	if (isNaN(d.getTime())) {
		d = new Date(input.replace(/-/g, '/').replace('T', ' ').replace(/\.\d+.*$/, ''));
	}
	if (isNaN(d.getTime())) return input;
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	const sameDay =
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate();
	if (sameDay) return hm;
	const y = new Date(now.getTime() - 24 * 3600 * 1000);
	const isYesterday =
		d.getFullYear() === y.getFullYear() &&
		d.getMonth() === y.getMonth() &&
		d.getDate() === y.getDate();
	if (isYesterday) return `昨天 ${hm}`;
	return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
}

function nowStr(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
		d.getHours()
	)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const useChatStore = defineStore({
	id: 'chat',

	state: (): any => ({
		/** 底层连接是否活跃（stomp 总线） */
		_wsActive: false,

		isConnected: false, // 是否已连接
		isConnecting: false, // 是否正在连接
		messages: [] as ChatMessage[], // 当前会话实时消息
		currentChat: {} as ChatMessage | {}, // 当前聊天对象信息
		unreadCount: 0, // 未读总数
		reconnectAttempts: 0, // 重连尝试
		maxReconnectAttempts: 5,

		// —— 业务态 ——
		friendRequestList: [] as any[], // 好友请求列表
		messageRecordList: [] as ConversationItem[], // 会话列表（含群）
		chatUserInfo: {} as ChatMessage | {}, // 页面选中的聊天角色
		stompState: StompState.CLOSED,

		/** 已发出的消息 id 集合，用于服务端回显时去重 */
		_sentIds: {} as Record<string, boolean>,
		/** 群聊订阅 id 记录，避免重复订阅 */
		_groupSubIds: {} as Record<string, string>,
	}),

	getters: {
		messageCount: (state: any): number => state.messages.length,
		lastMessage: (state: any): ChatMessage | undefined =>
			state.messages[state.messages.length - 1],
		stateText: (state: any): string =>
			state.stompState === StompState.CONNECTED
				? '已连接'
				: state.stompState === StompState.CONNECTING
				? '连接中'
				: '已断开',
		/** 当前会话是否为群聊 */
		isGroupChat: (state: any): boolean => !!(state.chatUserInfo && state.chatUserInfo.isGroup),
	},

	actions: {
		// ==================== 连接管理 ====================

		connect(chatInfo?: ChatMessage) {
			const token = getToken();
			if (!token) {
				warnLog('未登录，无法连接 WebSocket');
				toast('请先登录');
				return;
			}
			if (this.isConnected || this.isConnecting) return;

			this.currentChat = chatInfo || this.currentChat || {};
			this.isConnecting = true;

			const headers: Record<string, string> = {};
			headers['Authorization'] = 'Bearer ' + token;

			try {
				wsConnect({
					url: `${envConfig.wsUrl}/ws/chat`,
					headers,
					heartbeat: 4000,
					onConnect: () => {
						this.isConnected = true;
						this.isConnecting = false;
						this.stompState = StompState.CONNECTED;
						this.reconnectAttempts = 0;
						this._wsActive = true;

						// 个人私聊
						wsSubscribe('/user/queue/private', (frame) => {
							this.handlePush('/user/queue/private', frame);
						});
						// 好友申请
						wsSubscribe('/user/queue/friendRequest', () => {
							this.refreshRequestFriendList();
						});
						// 系统通知 / 加入群聊
						wsSubscribe('/user/queue/systemNotice', (frame) => {
							this.handleSystemNotice(frame);
						});
						// 历史会话里的群聊频道
						this.subscribeGroupTopics();
						// 未读数
						this.fetchUnreadCount();
					},
					onState: (s: StompState) => {
						this.stompState = s;
						if (s !== StompState.CONNECTED && this.isConnected) {
							this.isConnected = false;
							this.isConnecting = false;
							this._wsActive = false;
							this.tryReconnect();
						}
					},
					onError: (err: any) => {
						const msg =
							err && typeof err === 'object'
								? (err as StompFrame).body || JSON.stringify(err)
								: String(err) || '聊天连接异常';
						this.isConnected = false;
						this.isConnecting = false;
						this._wsActive = false;
						warnLog('STOMP 异常', msg);
					},
				});
			} catch (error) {
				console.error('连接失败:', error);
				this.isConnecting = false;
				this.isConnected = false;
				toast('连接聊天服务器失败');
			}
		},

		/** 收到 /user/queue/private 推送 */
		handlePush(_dest: string, frame: StompFrame) {
			let received: ChatMessage | null = null;
			try {
				received = JSON.parse(frame.body || '{}') as ChatMessage;
			} catch (e) {
				received = { content: frame.body } as ChatMessage;
			}
			if (!received) return;
			this.applyIncoming(received);
		},

		/** 群聊/私聊归属过滤 + 去重（收到自己发送的回显时忽略） */
		applyIncoming(received: ChatMessage) {
			// 服务端回显自己刚发的消息：本地已插入，直接丢弃
			const rid = received.id || '';
			if (rid && this._sentIds[rid]) {
				delete this._sentIds[rid];
				return;
			}
			if (received.contentDate === undefined) received.contentDate = nowStr();

			const cur = this.chatUserInfo as any;
			const curGroup = !!(cur && cur.isGroup);
			let belong = false;

			if (curGroup) {
				belong = String(cur.receiveUserId || '') === String(received.groupId || '');
			} else if (cur?.sendUserName && cur?.receiveUserName) {
				const s = received.sendUserName || '';
				const r = received.receiveUserName || '';
				belong =
					(s === cur.sendUserName && r === cur.receiveUserName) ||
					(s === cur.receiveUserName && r === cur.sendUserName);
			}

			if (belong) {
				this.messages.push(received);
			}
			// 更新会话列表预览与未读
			this.touchConversation(received, belong);
		},

		/** 系统通知（群聊成员加入等） */
		handleSystemNotice(frame: StompFrame) {
			let received: ChatMessage | null = null;
			try {
				received = JSON.parse(frame.body || '{}') as ChatMessage;
			} catch (e) {
				return;
			}
			if (!received) return;
			if (received.messageType === 'groupMember') {
				const exists = this.messageRecordList.findIndex(
					(it: any) => it?.receiveUserInfo?.id == (received?.otherParams?.groupId || '')
				);
				if (exists === -1) {
					this.messageRecordList.push({
						receiveUserInfo: {
							id: received.otherParams?.groupId || '',
							avatarUrl: '',
							username: received.otherParams?.groupName || '群聊',
							realName: received.otherParams?.groupName || '群聊',
							isGroup: true,
						},
						sendUserInfo: this.buildSendUser(),
						lastMessage: '已加入群聊',
						lastTime: nowStr(),
						unreadCount: 0,
					});
				}
			}
		},

		/** 根据收到的消息刷新会话列表预览/时间/未读 */
		touchConversation(msg: ChatMessage, isActive: boolean) {
			// 系统消息（加入/离开）不参与会话预览与未读
			if (msg.type === MessageType.JOIN || msg.type === MessageType.LEAVE) return;
			if (!msg.content) return;

			const isGroup = !!msg.groupId;
			const myName = this.currentUserName();
			const targetName = isGroup
				? ''
				: msg.sendUserName === myName
				? msg.receiveUserName || ''
				: msg.sendUserName || '';

			let idx = -1;
			if (isGroup) {
				idx = this.messageRecordList.findIndex(
					(it: any) => it?.receiveUserInfo?.isGroup && String(it.receiveUserInfo.id) === String(msg.groupId)
				);
			} else {
				idx = this.messageRecordList.findIndex(
					(it: any) =>
						!it?.receiveUserInfo?.isGroup &&
						it?.receiveUserInfo?.username === targetName
				);
			}

			if (idx === -1) {
				if (isGroup) {
					this.messageRecordList.unshift({
						receiveUserInfo: {
							id: msg.groupId || '',
							username: msg.otherParams?.groupName || '群聊',
							realName: msg.otherParams?.groupName || '群聊',
							avatarUrl: msg.otherParams?.avatarUrl || '',
							isGroup: true,
						},
						sendUserInfo: this.buildSendUser(),
						lastMessage: msg.content,
						lastTime: msg.contentDate || nowStr(),
						unreadCount: 0,
					});
				} else {
					const peer =
						msg.sendUserName === myName
							? {
									id: msg.receiveUserId || '',
									username: msg.receiveUserName || '',
									realName: msg.receiveUserName || '',
									avatarUrl: msg.receiveUserAvatar || '',
							  }
							: {
									id: msg.sendUserId || '',
									username: msg.sendUserName || '',
									realName: msg.sendUserName || '',
									avatarUrl: msg.sendUserAvatar || '',
							  };
					this.messageRecordList.unshift({
						receiveUserInfo: peer,
						sendUserInfo: this.buildSendUser(),
						lastMessage: msg.content,
						lastTime: msg.contentDate || nowStr(),
						unreadCount: 0,
					});
					idx = 0;
				}
			} else {
				const conv = this.messageRecordList[idx];
				conv.lastMessage = msg.content;
				conv.lastTime = msg.contentDate || nowStr();
				if (!isActive && msg.sendUserName !== myName) {
					conv.unreadCount = (conv.unreadCount || 0) + 1;
					this.unreadCount += 1;
				}
				// 置顶
				this.messageRecordList.splice(idx, 1);
				this.messageRecordList.unshift(conv);
			}
		},

		/** 当前登录用户展示信息（尽量取 userStore，缺失则回退字段） */
		currentUserId(): string {
			try {
				const us = useUserStore();
				return (us.userInfo && us.userInfo.id) || '';
			} catch (e) {
				return '';
			}
		},
		currentUserName(): string {
			try {
				const us = useUserStore();
				return (us.userInfo && us.userInfo.username) || '';
			} catch (e) {
				return '';
			}
		},
		buildSendUser(): Record<string, any> {
			try {
				const us = useUserStore();
				const { roles, homePath, ...rest } = us.userInfo || {};
				void roles;
				void homePath;
				return rest || {};
			} catch (e) {
				return {};
			}
		},

		// ==================== 会话与历史 ====================

		/** 拉取会话列表；mock 模式下用内置数据 */
		async getMessageRecords() {
			if (USE_MOCK) {
				this.messageRecordList = this.buildMockConversations();
				return;
			}
			const sendUserId = this.currentUserId();
			const res: any = await getMessageRecord({ sendUserId });
			if (res && res.code === 200 && Array.isArray(res.data)) {
				this.messageRecordList = (res.data || []).map((element: any) => {
					const sendUserInfo = this.buildSendUser();
					const unread = this.parseUnreadCount(element);
					if (element.isGroup === 1) {
						return {
							receiveUserInfo: {
								id: element.groupId,
								avatarUrl: element.avatarList || '',
								username: element.groupName,
								realName: element.groupName,
								isGroup: true,
							},
							sendUserInfo,
							lastMessage: element.lastMessage || '',
							lastTime: element.contentDate || '',
							unreadCount: unread,
						};
					}
					return {
						receiveUserInfo: element.userInfo || element.receiveUserInfo,
						sendUserInfo,
						lastMessage: element.lastMessage || element.content || '',
						lastTime: element.contentDate || '',
						unreadCount: unread,
					};
				});
			}
		},

		/** 兼容后端多种未读数字段命名，统一解析 */
		parseUnreadCount(element: any): number {
			if (!element) return 0;
			const candidates = [
				element.unreadCount,
				element.noReadCount,
				element.unReadCount,
				element.unread,
				element.notReadCount,
				element.count,
			];
			for (const v of candidates) {
				const n = Number(v);
				if (Number.isFinite(n) && n > 0) return n;
			}
			return 0;
		},

		/** 订阅会话列表里所有群聊频道 */
		subscribeGroupTopics() {
			const groups = (this.messageRecordList || []).filter(
				(it: any) => it?.receiveUserInfo?.isGroup
			);
			groups.forEach((group: any) => {
				const id = String(group.receiveUserInfo.id || '');
				if (!id || this._groupSubIds[id]) return;
				const subId = wsSubscribe(`/topic/group/${id}`, (frame) => {
					try {
						const m = JSON.parse(frame.body || '{}') as ChatMessage;
						this.applyIncoming(m);
					} catch (e) {
						/* ignore */
					}
				});
				if (subId) this._groupSubIds[id] = subId;
			});
		},

		/** 加载当前会话历史消息 */
		async loadHistoryMessage(params: any, page = 1, size = 50) {
			if (USE_MOCK) {
				const all = this.mockHistory(params);
				this.messages = all.slice(Math.max(0, all.length - page * size));
				return;
			}
			try {
				const resUp = await getHistoryRecord({ ...params, page, size });
				const list = (resUp && resUp.data) || [];
				this.messages = this.sortByTime(list);
			} catch (e) {
				console.error('加载历史消息失败:', e);
				this.messages = [];
			}
		},

		/** 按 contentDate 升序（旧 -> 新） */
		sortByTime(list: ChatMessage[]): ChatMessage[] {
			const toTs = (s?: string): number => {
				if (!s) return 0;
				let d = new Date(s);
				if (isNaN(d.getTime())) {
					d = new Date(s.replace(/-/g, '/').replace('T', ' ').replace(/\.\d+.*$/, ''));
				}
				return isNaN(d.getTime()) ? 0 : d.getTime();
			};
			return [...list].sort((a, b) => toTs(a.contentDate) - toTs(b.contentDate));
		},

		// ==================== 会话切换与显示 ====================

		setMessage(list: ChatMessage[]) {
			this.messages = list || [];
		},

		setChatUserInfo(info: any) {
			this.messages = [];
			this.chatUserInfo = info || {};
		},

		clearMessages() {
			this.messages = [];
		},

		/** 把一条本地消息直接插入当前会话（发送后立即回显） */
		appendLocalMessage(msg: ChatMessage) {
			this.messages.push(msg);
		},

		// ==================== 发送 ====================

		/** 通用发送（等价 stompClient.publish） */
		sendPublic(destination: string, body: Record<string, unknown>): boolean {
			if (!this.isConnected) {
				toast('未连接到聊天服务器');
				return false;
			}
			try {
				wsSend(destination, body);
				return true;
			} catch (e) {
				console.error('发送失败:', e);
				toast('发送失败');
				return false;
			}
		},

		/** 私聊发送：/app/chat.private/{receiveUserName} */
		sendPrivateMessage(chatInfoAndContent: any): boolean {
			const { content, ...chatInfo } = chatInfoAndContent || {};
			if (!content || String(content).trim() === '') return false;

			const sendUserId = chatInfo.sendUserId || this.currentUserId() || '';
			const receiveUserName = chatInfo.receiveUserName || '';
			const id = generateUUID();
			const chatMessage: ChatMessage = {
				id,
				sendUserId,
				sendUserName: chatInfo.sendUserName || '',
				sendUserAvatar: chatInfo.sendUserAvatar || '',
				receiveUserId: chatInfo.receiveUserId || '',
				receiveUserName,
				receiveUserAvatar: chatInfo.receiveUserAvatar || '',
				content: String(content).trim(),
				contentDate: nowStr(),
				type: MessageType.CHAT,
			};

			// 未连接也允许本地先回显，保持交互连贯
			if (this.isConnected) {
				try {
					wsSend(`/app/chat.private/${receiveUserName || '_'}`, chatMessage);
				} catch (e) {
					console.error('发送私聊失败:', e);
					toast('发送私聊失败');
					return false;
				}
			}
			this._sentIds[id] = true;
			this.appendLocalMessage(chatMessage);
			this.touchConversation(chatMessage, true);
			this.saveMessageToLocalDb({
				id,
				isGroup: 0,
				type: MessageType.CHAT,
				content: chatMessage.content,
				sendUserId,
				receiveUserId: chatInfo.receiveUserId || receiveUserName,
			});
			return true;
		},

		/** 群聊发送：/app/chat.group/{groupId} */
		sendGroupMessage(chatInfo: any, groupId: string): boolean {
			if (!chatInfo?.content || String(chatInfo.content).trim() === '') return false;

			const sendUserId = chatInfo.sendUserId || this.currentUserId() || '';
			const id = generateUUID();
			const chatMessage: ChatMessage = {
				id,
				sendUserId,
				sendUserName: chatInfo.sendUserName || '',
				sendUserAvatar: chatInfo.sendUserAvatar || '',
				receiveUserName: '',
				receiveUserAvatar: '',
				content: String(chatInfo.content).trim(),
				contentDate: nowStr(),
				groupId,
				type: MessageType.CHAT,
				// 供会话列表预览显示群名
				otherParams: { groupName: chatInfo.groupName || '' },
			};

			if (this.isConnected) {
				try {
					// 只发送后端实体认识的字段，避免序列化异常
					wsSend(`/app/chat.group/${groupId}`, {
						id: chatMessage.id,
						sendUserId: chatMessage.sendUserId,
						sendUserName: chatMessage.sendUserName,
						sendUserAvatar: chatMessage.sendUserAvatar,
						content: chatMessage.content,
						type: chatMessage.type,
					});
				} catch (e) {
					console.error('发送群聊失败:', e);
					toast('发送群聊失败');
					return false;
				}
			}
			this._sentIds[id] = true;
			this.appendLocalMessage(chatMessage);
			this.touchConversation(chatMessage, true);
			this.saveMessageToLocalDb({
				id,
				isGroup: 1,
				groupId,
				type: MessageType.CHAT,
				content: chatMessage.content,
				sendUserId,
				receiveUserId: null,
			});
			return true;
		},

		/** 好友申请 */
		sendFriendRequest(username: string, content = '您好，想加个好友'): boolean {
			if (!this.isConnected) {
				toast('未连接到聊天服务器');
				return false;
			}
			try {
				wsSend('/app/chat.friendRequest', { targetUser: username, content });
				return true;
			} catch (e) {
				console.error('发送好友请求失败:', e);
				toast('发送好友请求失败');
				return false;
			}
		},

		/** 同步好友请求列表 */
		async refreshRequestFriendList() {
			if (USE_MOCK) {
				this.friendRequestList = this.buildMockFriendRequests();
				return;
			}
			try {
				const res: any = await getRequestFriendList({
					type: 'requestList',
					userId: this.currentUserId(),
					isAgree: 0,
				});
				if (res && res.code === 200 && Array.isArray(res.data)) {
					this.friendRequestList = (res.data as any[]).map(
						(it: any) => it.receiveUserInfo || it
					);
				}
			} catch (e) {
				console.error('拉取好友请求失败:', e);
			}
		},

		/** 群聊加入事件 */
		sendGroupMemberJoinMessage(groupInfo: any) {
			if (!groupInfo?.groupId || !groupInfo?.group?.length) return false;
			const users = (groupInfo.group as any[]).map((it: any) => it.username);
			const joinMsg: ChatMessage = {
				id: generateUUID(),
				sendUserId: 'system',
				sendUserName: 'system',
				content: users.join('、') + ' 加入群聊',
				contentDate: nowStr(),
				type: MessageType.JOIN,
				groupId: groupInfo.groupId,
			};
			if (this.isConnected) {
				try {
					wsSend(`/app/chat.addGroupMember/${groupInfo.groupId}`, {
						groupName: groupInfo.groupName,
						content: users.join(','),
					});
				} catch (e) {
					console.error('发送群聊加入消息失败:', e);
				}
			}
			this.saveMessageToLocalDb({
				sendUserId: 'system',
				type: MessageType.JOIN,
				content: joinMsg.content,
				isGroup: 1,
				groupId: groupInfo.groupId,
			});
			return true;
		},

		/** 发送后同步落库（本地记录，异步） */
		async saveMessageToLocalDb(chatInfo: any) {
			if (USE_MOCK) return;
			try {
				await addMessageRecord({
					id: chatInfo.id || '',
					sendUserId: chatInfo.sendUserId || '',
					receiveUserId: chatInfo.receiveUserId || '',
					type: chatInfo.type || '',
					content: chatInfo.content || '',
					isGroup: chatInfo.isGroup,
					groupId: chatInfo.groupId || '',
				});
			} catch (e) {
				console.error(e);
			}
		},

		// ==================== 未读 / 断开 ====================

		async fetchUnreadCount() {
			if (USE_MOCK) {
				this.unreadCount = this.messageRecordList.reduce(
					(sum: number, it: any) => sum + (it.unreadCount || 0),
					0
				);
				return;
			}
			const localSum = this.messageRecordList.reduce(
				(sum: number, it: any) => sum + (it.unreadCount || 0),
				0
			);
			try {
				const res: any = await getUnreadCount();
				const count = res?.data?.count;
				// 后端未读接口未就绪（返回 0/缺失）时，回退用会话列表本地累加值
				if (typeof count === 'number' && count > 0) {
					this.unreadCount = count;
				} else {
					this.unreadCount = localSum;
				}
			} catch (e) {
				console.error('获取未读失败:', e);
				this.unreadCount = localSum;
			}
		},

		/** 某会话标记已读 */
		markConversationRead(username: string) {
			const idx = this.messageRecordList.findIndex(
				(it: any) => it?.receiveUserInfo?.username === username
			);
			if (idx !== -1) {
				const un = this.messageRecordList[idx].unreadCount || 0;
				this.messageRecordList[idx].unreadCount = 0;
				this.unreadCount = Math.max(0, this.unreadCount - un);
			}
		},

		markAsRead() {
			this.unreadCount = 0;
			this.messageRecordList.forEach((it: any) => (it.unreadCount = 0));
		},

		/** 切换会话：先断开再按新对象重连 */
		switchRoom(chatInfo: ChatMessage) {
			if (this.chatUserInfo && JSON.stringify(chatInfo) === JSON.stringify(this.chatUserInfo)) {
				return;
			}
			this.disconnectHard();
			this.clearMessages();
			this.chatUserInfo = chatInfo;
			this.connect(chatInfo);
		},

		disconnect() {
			wsDisconnect();
			this.stompState = StompState.CLOSED;
			this.isConnected = false;
			this.isConnecting = false;
			this._wsActive = false;
		},

		disconnectHard() {
			this.reconnectAttempts = this.maxReconnectAttempts;
			wsDisconnect();
			this.stompState = StompState.CLOSED;
			this.isConnected = false;
			this.isConnecting = false;
			this._wsActive = false;
		},

		tryReconnect() {
			if (this.reconnectAttempts >= this.maxReconnectAttempts) {
				toast('聊天连接已断开，请手动点击重连');
				return;
			}
			this.reconnectAttempts++;
			warnLog(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
			setTimeout(() => {
				if (!this.isConnected && !this.isConnecting) {
					this.connect(this.currentChat as ChatMessage);
				}
			}, 3000 * this.reconnectAttempts);
		},

		// ==================== MOCK 数据 ====================

		buildMockConversations(): ConversationItem[] {
			const me = this.buildSendUser();
			return [
				{
					receiveUserInfo: {
						id: 'mock-user-1',
						username: 'zhangsan',
						realName: '张三',
						avatarUrl: '',
					},
					sendUserInfo: me,
					lastMessage: '晚点一起复习吗？',
					lastTime: nowStr(),
					unreadCount: 2,
				},
				{
					receiveUserInfo: {
						id: 'mock-group-1',
						username: '学习交流群',
						realName: '学习交流群',
						avatarUrl: ['', '', ''],
						isGroup: true,
					},
					sendUserInfo: me,
					lastMessage: '李四: 这道题怎么做',
					lastTime: nowStr(),
					unreadCount: 5,
				},
				{
					receiveUserInfo: {
						id: 'mock-user-2',
						username: 'lisi',
						realName: '李四',
						avatarUrl: '',
					},
					sendUserInfo: me,
					lastMessage: '收到，谢谢！',
					lastTime: '2024-01-01 10:00:00',
					unreadCount: 0,
				},
			];
		},

		buildMockFriendRequests(): any[] {
			return [
				{ id: 'mock-req-1', username: 'wangwu', realName: '王五', avatarUrl: '' },
			];
		},

		mockHistory(params: any): ChatMessage[] {
			const myName = this.currentUserName() || '我';
			const isGroup = Number(params?.isGroup) === 1;
			const peerName = this.chatUserInfo?.receiveUserName || '对方';
			const base: ChatMessage[] = [
				{
					id: 'm1',
					sendUserName: peerName,
					content: isGroup ? '欢迎加入群聊～' : '你好呀，好久不见！',
					contentDate: '2024-01-01 09:58:00',
					type: MessageType.CHAT,
				},
				{
					id: 'm2',
					sendUserName: myName,
					content: '是呀，最近在准备考试',
					contentDate: '2024-01-01 09:59:00',
					type: MessageType.CHAT,
				},
				{
					id: 'm3',
					sendUserName: peerName,
					content: isGroup ? '大家一起加油！' : '晚点一起复习吗？',
					contentDate: '2024-01-01 10:00:00',
					type: MessageType.CHAT,
				},
			];
			return base;
		},
	},
});
