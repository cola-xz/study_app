/**
 * 「聊天」Pinia store
 *
 * 依据参考工程结构改写，保留其方法名/订阅目的地/消息对象语义，
 * 但把仅适用于 Web 的依赖换成 uni-app 等价实现：
 *   @stomp/stompjs 的 Client       -> @/utils/stomp（uni.connectSocket 总线，多端可用）
 *   ant-design-vue 的 message.*    -> 本项目 toast 封装（uni.showToast / 记录日志）
 *   localStorage                   -> @/utils/request.getToken()
 *   import.meta.env.VITE_APP_WS_URL-> 需在 connect 前用 setEndpoint 显式注入
 *   还原用的 @/api/*、@/utils/uuid 均已补齐（api 中含占位实现）。
 *
 * 使用前务必 setEndpoint；页面仅需调 useChatStore() 的 actions，消息自动进 state。
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
import {
	getHistoryRecord,
	addMessageRecord,
	getUnreadCount,
	getMessageRecord,
} from '@/api/chat';
import { getRequestFriendList } from '@/api/user';
import { useUserStore } from '@/store/modules/user';
import { generateUUID } from '@/utils/uuid';

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
	type?: MessageType | string;
	isGroup?: boolean;
	groupId?: string;
	isPublic?: boolean;
	messageType?: string;
	otherParams?: Record<any, string>;
	[key: string]: any;
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

/** 统一的轻提示入口（替代 antd message，N 端可用） */
function toast(text: string, icon: 'none' | 'success' | 'error' | 'loading' = 'none') {
	uni.showToast({ title: text, icon, duration: 2000 });
}

function warnLog(...args: any[]) {
	// 参考里各处用 console.warn，保留便于排查，但不用全局弹窗刷屏
	console.warn('[chat-store]', ...args);
}

export const useChatStore = defineStore({
	id: 'chat',

	state: (): any => ({
		/** STOMP 总线引用（connect 内部维护），对外只读 */
		_wsActive: false,

		/** 服务端 ws/wss 端点，需先 setEndpoint 注入 */
		endpoint: '',

		isConnected: false, // 是否已连接
		isConnecting: false, // 是否正在连接
		messages: [] as ChatMessage[], // 当前会话实时消息
		currentChat: {} as ChatMessage | {}, // 当前聊天对象信息
		unreadCount: 0, // 未读
		reconnectAttempts: 0, // 重连尝试
		maxReconnectAttempts: 5,

		// —— 从参考保留的业务态 ——
		friendRequestList: [], // 好友请求列表
		messageRecordList: [], // 历史会话列表（含群）
		chatUserInfo: {}, // 页面选中的聊天角色
		stompState: StompState.CLOSED,
	}),

	getters: {
		// 消息数量
		messageCount: (state: any): number => state.messages.length,
		// 最后一条消息
		lastMessage: (state: any): ChatMessage | undefined =>
			state.messages[state.messages.length - 1],
		// 可展示状态文案
		stateText: (state: any): string =>
			state.stompState === StompState.CONNECTED
				? '已连接'
				: state.stompState === StompState.CONNECTING
				? '连接中'
				: '已断开',
	},

	actions: {
		/**
		 * 设置 STOMP 服务端点。必须在 connect 前调用。
		 *  ws://127.0.0.1:8080/ws/chat   （开发：内网明文）
		 *  wss://yourdomain.com/ws/chat   （生产/公网：须 TLS）
		 */
		setEndpoint(url: string) {
			this.endpoint = url;
		},

		connect(chatInfo?: ChatMessage) {
			if (!this.endpoint) {
				toast('请先调用 setEndpoint 设置 ws 地址');
				return;
			}
			const token = getToken();
			// 未登录不可建立聊天
			if (!token) {
				warnLog('未登录，无法连接 WebSocket');
				toast('请先登录');
				return;
			}

			// 连接去重：已有活跃/连接中则跳过
			if (this.isConnected || this.isConnecting) return;

			this.currentChat = chatInfo || this.currentChat || {};
			this.isConnecting = true;

			const headers: Record<string, string> = {};
			// 鉴权：默认 Authorization: Bearer（若后端握手读其他字段，改这里）
			headers['Authorization'] = 'Bearer ' + token;

			try {
				wsConnect({
					url: this.endpoint,
					headers,
					heartbeat: 4000,
					// —— CONNECTED —— 对应参考 onConnect ——
					onConnect: () => {
						this.isConnected = true;
						this.isConnecting = false;
						this.stompState = StompState.CONNECTED;
						this.reconnectAttempts = 0;

						// 订阅个人私聊
						wsSubscribe('/user/queue/private', (frame) => {
							this.handlePush('/user/queue/private', frame);
						});
						// 好友申请
						wsSubscribe('/user/queue/friendRequest', (_frame) => {
							this.refreshRequestFriendList();
						});
						// 系统通知 / 加入群聊
						wsSubscribe('/user/queue/systemNotice', (frame) => {
							this.handleSystemNotice(frame);
						});
						// 历史会话里的群聊频道
						this.subscribeGroupTopics();
						// 拉一次历史/未读
						this.fetchInitialData();
					},
					// —— 断开 ——
					onState: (s: StompState) => {
						this.stompState = s;
						if (s !== StompState.CONNECTED) {
							if (this.isConnected) {
								// 意外断开
								this.isConnected = false;
								this.isConnecting = false;
								this.tryReconnect();
							}
						}
					},
					// —— 错误 ——
					onError: (err: any) => {
						const msg =
							err && typeof err === 'object'
								? (err as StompFrame).body || JSON.stringify(err)
								: String(err) || '聊天连接异常';
						this.isConnected = false;
						this.isConnecting = false;
						toast('聊天连接异常: ' + msg, 'none');
					},
				});
			} catch (error) {
				console.error('连接失败:', error);
				this.isConnecting = false;
				this.isConnected = false;
				toast('连接聊天服务器失败', 'none');
			}
		},

		/** 收到 /user/queue/private 时的业务过滤：按当前会话对象判断是否入列表 */
		privateFilterCb(message: ChatMessage): boolean {
			return true;
		},

		handlePush(_dest: string, filter: (m: ChatMessage) => boolean, frame: StompFrame) {
			let received: ChatMessage | null = null;
			try {
				received = JSON.parse(frame.body || '{}') as ChatMessage;
			} catch (e) {
				received = { content: frame.body } as ChatMessage;
			}
			if (!received) return;
			if (!filter(received)) return;
			// 进入展示：仅在属于当前会话时 push 到 messages
			this.applyIncoming(received);
		},

		/** 群聊/私聊归属过滤（参考 setNowMessageList 的实现语义） */
		applyIncoming(received: ChatMessage) {
			const cur = this.chatUserInfo as any;
			const curGroup = !!(cur && cur.isGroup);
			if (curGroup) {
				if (cur && String(cur.receiveUserId || '') === String(received.groupId || '')) {
					this.messages!.push(received);
				}
			} else {
				// 私聊：双向都算
				const s = received.sendUserName || '';
				const r = received.receiveUserName || '';
				if (
					(cur?.sendUserName && cur?.receiveUserName) &&
					((s === cur.sendUserName && r === cur.receiveUserName) ||
						(s === cur.receiveUserName && r === cur.sendUserName))
				) {
					this.messages!.push(received);
				}
			}
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
				// 尝试把被加入的群并入 messageRecordList
				const uid = this.currentUserId();
				const exists = this.messageRecordList.findIndex(
					(it: any) =>
						it?.receiveUserInfo?.id == (received?.otherParams?.groupId || '')
				);
				if (exists === -1) {
					this.messageRecordList!.push({
						receiveUserInfo: {
							id: received.otherParams?.groupId,
							avatarUrl: '',
							username: received.otherParams?.groupName,
							realName: received.otherParams?.groupName,
							isGroup: true,
						},
						sendUserInfo: this.buildSendUser(),
					});
					void uid;
				}
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

		/** 连接成功后拉一次历史会话 + 未读数，并据此订阅群聊 */
		async fetchInitialData() {
			try {
				this.friendRequestList = [];
				await this.getMessageRecords();
				this.subscribeGroupTopics();
				this.fetchUnreadCount();
			} catch (e) {
				console.error(e);
			}
		},

		/** 对 messageRecordList 中存在isGroup 的会话逐个订阅组默认频道 */
		subscribeGroupTopics() {
			const list = this.messageRecordList || [];
			const groups = list.filter((it: any) => it?.receiveUserInfo?.isGroup);
			groups.forEach((group: any) => {
				const id = group.receiveUserInfo.id;
				if (id === undefined || id === null) return;
				wsSubscribe(`/topic/group/${id}`, (frame) => {
					try {
						const m = JSON.parse(frame.body || '{}') as ChatMessage;
						this.applyIncoming(m);
					} catch (e) {
						/* ignore */
					}
				});
			});
		},

		/** 历史会话记录（私聊 + 群聊都组装到 messageRecordList） */
		async getMessageRecords() {
			const sendUserId = this.currentUserId();
			const res: any = await getMessageRecord({ sendUserId });
			if (res && res.code === 200 && Array.isArray(res.data)) {
				const list = (res.data || []).map((element: any) => {
					const sendUserInfo = this.buildSendUser();
					// element.isGroup === 0 →私聊；1 →群聊
					if (element.isGroup === 1) {
						return {
							receiveUserInfo: {
								id: element.groupId,
								avatarUrl: '',
								username: element.content,
								realName: element.content,
								isGroup: true,
							},
							sendUserInfo,
						};
					}
					return {
						receiveUserInfo: element.userInfo || element.receiveUserInfo,
						sendUserInfo,
					};
				});
				this.messageRecordList = list;
			}
		},

		// —— 界面主动动作 / 发送 ——

		setMessage(list: ChatMessage[]) {
			this.messages = list || [];
		},

		setChatUserInfo(info: any) {
			this.messages = [];
			this.chatUserInfo = info;
		},

		clearMessages() {
			this.messages = [];
		},

		/** 参考 loadHistoryMessage：拉聊天室/群历史消息 */
		async loadHistoryMessage(params: any, page = 1, size = 50) {
			try {
				const resUp = await getHistoryRecord({ ...params, page, size });
				if (resUp && resUp.data) this.messages = resUp.data;
				else this.messages = [];
			} catch (e) {
				console.error('加载历史消息失败:', e);
				this.messages = [];
			}
		},

		/**
		 * 通用发送。public send 等价参考里 stompClient.publish 的封装。
		 */
		sendPublic(destination: string, body: Record<string, unknown>): boolean {
			if (!this.isConnected) {
				toast('未连接到聊天服务器', 'none');
				return false;
			}
			try {
				wsSend(destination, body);
				return true;
			} catch (e) {
				console.error('发送失败:', e);
				toast('发送失败', 'none');
				return false;
			}
		},

		/** 私聊发送：/app/chat.private/{receiveUserName} */
		sendPrivateMessage(chatInfoAndContent: any): boolean {
			if (!this.isConnected) {
				toast('未连接到聊天服务器', 'none');
				return false;
			}
			const { content, ...chatInfo } = chatInfoAndContent || {};
			if (!content || String(content).trim() === '') return false;

			const sendUserId = chatInfo.sendUserId || this.currentUserId() || '';
			const receiveUserName = chatInfo.receiveUserName || '';
			const chatMessage: Partial<ChatMessage> = {
				id: generateUUID(),
				sendUserName: chatInfo.sendUserName || '',
				sendUserAvatar: chatInfo.sendUserAvatar || '',
				sendUserId,
				receiveUserName,
				receiveUserAvatar: chatInfo.receiveUserAvatar || '',
				content: String(content).trim(),
				type: MessageType.CHAT,
			};
			try {
				wsSend(`/app/chat.private/${receiveUserName || '_'}`, chatMessage);
				this.saveMessageToLocalDb({
					id: chatMessage.id as string,
					isGroup: 0,
					type: MessageType.CHAT,
					content: chatMessage.content,
					sendUserId,
					receiveUserId: receiveUserName,
				});
				return true;
			} catch (e) {
				console.error('发送私聊失败:', e);
				toast('发送私聊失败', 'none');
				return false;
			}
		},

		/** 群聊发送：/app/chat.group/{groupId} */
		sendGroupMessage(chatInfo: any, groupId: string): boolean {
			if (!this.isConnected) {
				toast('未连接到聊天服务器', 'none');
				return false;
			}
			if (!chatInfo?.content || String(chatInfo.content).trim() === '') return false;

			const sendUserId = chatInfo.sendUserId || this.currentUserId() || '';
			const chatMessage: Partial<ChatMessage> = {
				id: generateUUID(),
				sendUserName: chatInfo.sendUserName || '',
				sendUserAvatar: chatInfo.sendUserAvatar || '',
				receiveUserName: '',
				receiveUserAvatar: '',
				content: String(chatInfo.content).trim(),
				type: MessageType.CHAT,
			};
			try {
				wsSend(`/app/chat.group/${groupId}`, chatMessage);
				this.saveMessageToLocalDb({
					id: chatMessage.id as string,
					isGroup: 1,
					groupId,
					type: MessageType.CHAT,
					content: chatMessage.content,
					sendUserId,
					receiveUserId: null,
				});
				return true;
			} catch (e) {
				console.error('发送群聊失败:', e);
				toast('发送群聊失败', 'none');
				return false;
			}
		},

		/** 好友申请（参考 发 -> /app/chat.friendRequest） */
		sendFriendRequest(username: string, content = '您好，想加个好友'): boolean {
			if (!this.isConnected) {
				toast('未连接到聊天服务器', 'none');
				return false;
			}
			try {
				wsSend('/app/chat.friendRequest', {
					targetUser: username,
					content,
				});
				return true;
			} catch (e) {
				console.error('发送好友请求失败:', e);
				toast('发送好友请求失败', 'none');
				return false;
			}
		},

		/** 同步好友请求公告列表 */
		async refreshRequestFriendList() {
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
			if (!this.isConnected) return;
			if (!groupInfo?.groupId || !groupInfo?.group?.length) return;
			const users = (groupInfo.group as any[]).map((it: any) => it.username);
			try {
				wsSend(`/app/chat.addGroupMember/${groupInfo.groupId}`, {
					groupName: groupInfo.groupName,
					content: users.join(','),
				});
				this.saveMessageToLocalDb({
					sendUserId: 'system',
					type: MessageType.JOIN,
					content: users + ' 加入群聊',
					isGroup: 1,
					groupId: groupInfo.groupId,
				});
				return true;
			} catch (e) {
				console.error('发送私聊失败:', e);
			}
		},

		/** 发送后同步落库（本地记录，异步） */
		async saveMessageToLocalDb(chatInfo: any) {
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

		async fetchUnreadCount() {
			try {
				const res: any = await getUnreadCount();
				if (res && res.data && typeof res.data.count === 'number') {
					this.unreadCount = res.data.count;
				}
			} catch (e) {
				console.error('获取未读失败:', e);
			}
		},

		markAsRead() {
			this.unreadCount = 0;
		},

		/** 切换会话：先断开再按新对象重连（页面调用） */
		switchRoom(chatInfo: ChatMessage) {
			if (
				this.chatUserInfo &&
				JSON.stringify(chatInfo) === JSON.stringify(this.chatUserInfo)
			) {
				return;
			}
			this.disconnectHard();
			this.clearMessages();
			this.chatUserInfo = chatInfo;
			this.connect(chatInfo);
		},

		/** 手动断开（主动）  —— 调用底层并复位 */
		disconnect() {
			wsDisconnect();
			this.stompState = StompState.CLOSED;
			this.isConnected = false;
			this.isConnecting = false;
		},

		disconnectHard() {
			// 切换房间时不触发自动重连
			this.reconnectAttempts = this.maxReconnectAttempts;
			wsDisconnect();
			this.stompState = StompState.CLOSED;
			this.isConnected = false;
			this.isConnecting = false;
		},

		/** 简单重连（受 maxReconnectAttempts 限流），仅非主动断开时触发 */
		tryReconnect() {
			if (this.reconnectAttempts >= this.maxReconnectAttempts) {
				toast('聊天连接已断开，请手动点击重连', 'none');
				return;
			}
			this.reconnectAttempts++;
			warnLog(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
			setTimeout(() => {
				if (!this.isConnected && !this.isConnecting) {
					this.reconnectAttempts = 0;
					this.connect(this.currentChat as ChatMessage);
				}
			}, 3000 * this.reconnectAttempts);
			void this.endpoint;
		},
	},
});
