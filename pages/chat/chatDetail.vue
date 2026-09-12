<template>
	<app-layout>
		<template #['nav-left']>
			<uni-icons
				type="left"
				size="26"
				@click="handleBack"
			></uni-icons>
		</template>
		<template #['nav-right']>
			<view class="conn-status" :class="chatStore.isConnected ? 'ok' : 'bad'">
				{{ chatStore.isConnected ? '在线' : '离线' }}
			</view>
		</template>

		<view class="detail">
			<!-- 消息区 -->
			<scroll-view
				class="msg-scroll"
				scroll-y
				:scroll-into-view="scrollIntoId"
				:scroll-with-animation="true"
				@scrolltoupper="loadMore"
			>
				<view class="msg-list">
					<view v-if="loadingHistory" class="loading-tip">加载中...</view>
					<view v-else-if="noMore && chatStore.messages.length" class="loading-tip">
						没有更多了
					</view>

					<view
						v-for="(msg, index) in chatStore.messages"
						:key="msg.id || index"
						:id="'msg-' + index"
					>
						<!-- 系统消息 -->
						<view
							v-if="msg.type === 'JOIN' || msg.type === 'LEAVE'"
							class="system-msg"
						>
							<text>{{ msg.content }}</text>
						</view>

						<!-- 聊天消息 -->
						<view v-else class="msg-item" :class="{ own: isOwn(msg) }">
							<image
								v-if="msg.sendUserAvatar"
								class="avatar"
								:src="setAvatarUrl(msg.sendUserAvatar)"
								mode="aspectFill"
							/>
							<view
								v-else
								class="avatar"
								:style="{ backgroundColor: avatarColor(msg.sendUserName) }"
							>
								<text class="avatar-text">{{ firstChar(msg.sendUserName) }}</text>
							</view>
							<view class="msg-body">
								<view class="msg-meta">
									<text class="sender">{{ msg.sendUserName || '未知' }}</text>
									<text class="time">{{ formatTime(msg.contentDate) }}</text>
								</view>
								<view class="bubble" :class="{ own: isOwn(msg) }">
									<text class="bubble-text">{{ msg.content }}</text>
								</view>
							</view>
						</view>
					</view>

					<view id="msg-bottom" class="bottom-anchor"></view>
				</view>
			</scroll-view>

			<!-- 输入区 -->
			<view class="input-bar">
				<input
					class="ipt"
					v-model="inputText"
					type="text"
					:placeholder="disabled ? '请先选择聊天对象' : '输入消息...'"
					:disabled="disabled"
					confirm-type="send"
					@confirm="handleSend"
				/>
				<button
					class="send-btn"
					:disabled="disabled || !inputText.trim()"
					@click="handleSend"
				>
					发送
				</button>
			</view>

			<view v-if="!chatStore.isConnected" class="offline-tip" @click="reconnect">
				聊天已断开连接，点击重连
			</view>
		</view>
	</app-layout>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useChatStore, formatChatTime, type ChatMessage } from '@/store/modules/chat';
import { useUserStore } from '@/store/modules/user';
import { setAvatarUrl } from '@/utils/avatarUrl';

const chatStore = useChatStore();
const userStore = useUserStore();

const inputText = ref('');
const scrollIntoId = ref('');
const loadingHistory = ref(false);
const noMore = ref(false);
const page = ref(1);
const pageSize = 20;

const disabled = computed(
	() =>
		!chatStore.chatUserInfo ||
		!chatStore.chatUserInfo.receiveUserName ||
		chatStore.chatUserInfo.receiveUserName === ''
);

onLoad((query: any) => {
	// 由列表页跳转携带的参数；若未携带则用 store 中已选会话
	if (query && query.receiveUserName) {
		const isGroup = query.isGroup === 'true' || query.isGroup === '1';
		setChat({
			sendUserId: userStore.userInfo?.id || '',
			sendUserName: userStore.userInfo?.username || '',
			sendUserAvatar: userStore.userInfo?.avatarUrl || '',
			receiveUserId: query.receiveUserId || '',
			receiveUserName: query.receiveUserName || '',
			receiveUserAvatar: query.receiveUserAvatar || '',
			isGroup,
		});
	} else {
		// 直接进入：使用 store 中当前会话
		initCurrent();
	}
});

function setChat(info: ChatMessage) {
	if (!info?.receiveUserName) return;
	chatStore.setChatUserInfo(info);
	chatStore.connect(info);
	loadHistory(true);
}

// 使用 store 里已经设置的聊天对象（从会话列表进入时）
function initCurrent() {
	const cur: any = chatStore.chatUserInfo;
	if (cur && cur.receiveUserName) {
		chatStore.connect(cur);
		loadHistory(true);
	}
}

onUnload(() => {
	// 长连接保留给其它页面复用
});

// 加载历史（重置 true 则清空重载）
async function loadHistory(reset = false) {
	if (loadingHistory.value) return;
	const cur: any = chatStore.chatUserInfo;
	if (!cur?.receiveUserName) return;

	loadingHistory.value = true;
	try {
		if (reset) {
			page.value = 1;
			noMore.value = false;
		}
		const isGroup = !!cur.isGroup;
		await chatStore.loadHistoryMessage(
			{
				isGroup: isGroup ? 1 : 0,
				sendUserId: userStore.userInfo?.id || '',
				// 私聊用接收人 id；群聊用群 id
				receiveUserId: isGroup ? cur.receiveUserId : cur.receiveUserId || cur.receiveUserName,
			},
			page.value,
			pageSize
		);
		const list = chatStore.messages;
		if (list.length < page.value * pageSize) noMore.value = true;
		await scrollToBottom();
	} finally {
		loadingHistory.value = false;
	}
}

function loadMore() {
	if (loadingHistory.value || noMore.value) return;
	page.value++;
	loadHistory();
}

function scrollToBottom() {
	return nextTick(() => {
		scrollIntoId.value = '';
		setTimeout(() => {
			scrollIntoId.value = 'msg-bottom';
		}, 30);
	});
}

// 新消息到达时自动滚到底部
watch(
	() => chatStore.messages.length,
	() => {
		scrollToBottom();
	}
);

function handleSend() {
	const content = inputText.value.trim();
	if (!content) return;
	const cur: any = chatStore.chatUserInfo;
	if (!cur?.receiveUserName) {
		uni.showToast({ title: '请先选择聊天对象', icon: 'none' });
		return;
	}

	let ok = false;
	if (cur.isGroup) {
		ok = chatStore.sendGroupMessage(
			{
				content,
				sendUserId: cur.sendUserId,
				sendUserName: cur.sendUserName,
				sendUserAvatar: cur.sendUserAvatar,
				groupName: cur.receiveUserName,
			},
			cur.receiveUserId
		);
	} else {
		ok = chatStore.sendPrivateMessage({
			content,
			sendUserId: cur.sendUserId,
			sendUserName: cur.sendUserName,
			sendUserAvatar: cur.sendUserAvatar,
			receiveUserId: cur.receiveUserId,
			receiveUserName: cur.receiveUserName,
			receiveUserAvatar: cur.receiveUserAvatar,
		});
	}
	if (ok) {
		inputText.value = '';
		scrollToBottom();
	}
}

function reconnect() {
	chatStore.disconnect();
	setTimeout(() => {
		const cur: any = chatStore.chatUserInfo;
		if (cur?.receiveUserName) chatStore.connect(cur);
	}, 500);
}

function isOwn(msg: ChatMessage): boolean {
	return msg.sendUserName === userStore.userInfo?.username;
}

function firstChar(name?: string): string {
	return name ? name.charAt(0).toUpperCase() : '?';
}

const colors = [
	'#2979ff',
	'#52c41a',
	'#faad14',
	'#f5222d',
	'#722ed1',
	'#13c2c2',
	'#eb2f96',
	'#fa8c16',
];
function avatarColor(name?: string): string {
	if (!name) return colors[0];
	return colors[name.length % colors.length];
}

function formatTime(t?: string): string {
	return formatChatTime(t);
}

function handleBack() {
	uni.navigateBack({ delta: 1 });
}
</script>

<style scoped>
.detail {
	display: flex;
	flex-direction: column;
	height: 100%;
	background-color: #f5f6fa;
	position: relative;
}

.conn-status {
	font-size: 24rpx;
	padding: 4rpx 16rpx;
	border-radius: 20rpx;
}
.conn-status.ok {
	color: #52c41a;
	background-color: rgba(82, 196, 26, 0.1);
}
.conn-status.bad {
	color: #f5222d;
	background-color: rgba(245, 34, 45, 0.1);
}

.msg-scroll {
	flex: 1;
	min-height: 0;
}

.msg-list {
	padding: 24rpx;
}

.loading-tip {
	text-align: center;
	font-size: 24rpx;
	color: #999;
	padding: 16rpx 0;
}

.system-msg {
	text-align: center;
	margin: 12rpx 0;
}
.system-msg text {
	font-size: 22rpx;
	color: #fff;
	background-color: rgba(0, 0, 0, 0.2);
	padding: 6rpx 20rpx;
	border-radius: 20rpx;
}

.msg-item {
	display: flex;
	margin-bottom: 28rpx;
}
.msg-item.own {
	flex-direction: row-reverse;
}

.avatar {
	width: 72rpx;
	height: 72rpx;
	border-radius: 12rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.avatar-text {
	color: #fff;
	font-size: 30rpx;
	font-weight: 600;
}

.msg-body {
	max-width: 70%;
	margin: 0 16rpx;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	flex-shrink: 1;
	overflow: hidden;
}
.msg-item.own .msg-body {
	align-items: flex-end;
}

.msg-meta {
	display: flex;
	align-items: center;
	gap: 12rpx;
	margin-bottom: 8rpx;
}
.msg-item.own .msg-meta {
	flex-direction: row-reverse;
}
.sender {
	font-size: 24rpx;
	color: #333;
	font-weight: 500;
}
.time {
	font-size: 22rpx;
	color: #bbb;
}

.bubble {
	background-color: #fff;
	border-radius: 16rpx;
	padding: 18rpx 24rpx;
	box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
	max-width: 100%;
	align-self: flex-start;
}
.bubble.own {
	background-color: #2979ff;
	align-self: flex-end;
}
.bubble-text {
	font-size: 28rpx;
	line-height: 1.5;
	color: #333;
	word-break: break-all;
	white-space: pre-wrap;
}
.bubble.own .bubble-text {
	color: #fff;
}

.input-bar {
	display: flex;
	align-items: center;
	gap: 16rpx;
	padding: 16rpx 24rpx;
	background-color: #fff;
	border-top: 1rpx solid #eee;
	padding-bottom: calc(16rpx + constant(safe-area-inset-bottom));
	padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.ipt {
	flex: 1;
	height: 72rpx;
	line-height: 72rpx;
	background-color: #f5f6fa;
	border-radius: 36rpx;
	padding: 0 28rpx;
	font-size: 28rpx;
}
.send-btn {
	margin: 0;
	height: 72rpx;
	line-height: 72rpx;
	font-size: 28rpx;
	color: #fff;
	background-color: #2979ff;
	border-radius: 36rpx;
	padding: 0 36rpx;
}
.send-btn[disabled] {
	background-color: #c8d6f0;
	color: #fff;
}

.offline-tip {
	position: absolute;
	left: 50%;
	bottom: 140rpx;
	transform: translateX(-50%);
	background-color: rgba(245, 34, 45, 0.9);
	color: #fff;
	font-size: 24rpx;
	padding: 10rpx 24rpx;
	border-radius: 24rpx;
}

.bottom-anchor {
	height: 1rpx;
}
</style>
