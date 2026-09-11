<template>
	<app-layout>
		<view class="page">
			<!-- 连接状态 -->
			<view class="conn-bar" :class="chatStore.isConnected ? 'ok' : 'bad'">
				<text class="conn-text">
					{{ chatStore.isConnected ? '已连接' : '未连接' }}
				</text>
				<text v-if="!chatStore.isConnected" class="conn-retry" @click="reconnect">
					点击重连
				</text>
			</view>

			<!-- 会话为空 -->
			<view v-if="!conversations.length" class="empty">
				<view class="empty-icon">💬</view>
				<text class="empty-text">暂无会话，去联系人里找好友聊聊吧</text>
				<button class="empty-btn" @click="goContacts">去联系人</button>
			</view>

			<!-- 会话列表 -->
			<scroll-view v-else class="conv-scroll" scroll-y>
				<uni-list :border="true">
					<uni-list-chat
						v-for="(item, index) in conversations"
						:key="index"
						:avatar-circle="!item.receiveUserInfo.isGroup"
						:avatar="singleAvatar(item)"
						:avatar-list="groupAvatarList(item)"
						:title="item.receiveUserInfo.username"
						:note="item.lastMessage || '暂无消息'"
						:time="formatTime(item.lastTime)"
						:badge-text="badgeText(item.unreadCount)"
						badge-positon="left"
						clickable
						@click="openChat(item)"
					/>
				</uni-list>
			</scroll-view>
		</view>
	</app-layout>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
	useChatStore,
	formatChatTime,
	type ConversationItem,
} from '@/store/modules/chat';
import { useUserStore } from '@/store/modules/user';
import { setAvatarUrl } from '@/utils/avatarUrl';

const chatStore = useChatStore();
const userStore = useUserStore();

const conversations = computed<ConversationItem[]>(
	() => chatStore.messageRecordList || []
);

onLoad(() => {
	chatStore.connect();
	chatStore.getMessageRecords().then(() => {
		chatStore.subscribeGroupTopics();
		chatStore.fetchUnreadCount();
	});
	chatStore.refreshRequestFriendList();
});

function openChat(item: ConversationItem) {
	// 标记该会话已读
	chatStore.markConversationRead(item.receiveUserInfo.username);

	const info: any = {
		sendUserId: userStore.userInfo?.id || '',
		sendUserName: userStore.userInfo?.username || '',
		sendUserAvatar: userStore.userInfo?.avatarUrl || '',
		receiveUserId: item.receiveUserInfo.id,
		receiveUserName: item.receiveUserInfo.username,
		receiveUserAvatar: Array.isArray(item.receiveUserInfo.avatarUrl)
			? ''
			: item.receiveUserInfo.avatarUrl || '',
		isGroup: !!item.receiveUserInfo.isGroup,
	};
	chatStore.setChatUserInfo(info);

	const q = Object.keys(info)
		.map((k) => `${k}=${encodeURIComponent(info[k] ?? '')}`)
		.join('&');
	uni.navigateTo({ url: `/pages/chat/chatDetail?${q}` });
}

function goContacts() {
	uni.navigateTo({ url: '/pages/chat/chatUser' });
}

function reconnect() {
	chatStore.disconnect();
	setTimeout(() => chatStore.connect(), 500);
}

/** 群聊头像组，格式 [{url}]；无头像时回退占位 */
function groupAvatarList(item: ConversationItem): { url: string }[] {
	if (!item.receiveUserInfo.isGroup) return [];
	const av = item.receiveUserInfo.avatarUrl;
	if (Array.isArray(av) && av.length) {
		return av.slice(0, 4).map((url: string) => ({ url: setAvatarUrl(url) }));
	}
	return [{ url: '' }];
}

/** 私聊单头像 */
function singleAvatar(item: ConversationItem): string {
	if (item.receiveUserInfo.isGroup) return '';
	const av = item.receiveUserInfo.avatarUrl;
	if (typeof av === 'string' && av) return setAvatarUrl(av);
	return '';
}

/** 未读角标：0 不显示，>99 显示 99+ */
function badgeText(unread?: number): string {
	if (!unread || unread <= 0) return '';
	return unread > 99 ? '99+' : String(unread);
}

function formatTime(t?: string): string {
	return formatChatTime(t);
}
</script>

<style scoped>
.page {
	display: flex;
	flex-direction: column;
	height: 100%;
	background-color: #f5f6fa;
}

.conn-bar {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 16rpx;
	height: 56rpx;
	font-size: 24rpx;
}
.conn-bar.ok {
	color: #52c41a;
	background-color: rgba(82, 196, 26, 0.08);
}
.conn-bar.bad {
	color: #f5222d;
	background-color: rgba(245, 34, 45, 0.08);
}
.conn-retry {
	color: #2979ff;
	text-decoration: underline;
}

.empty {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 24rpx;
}
.empty-icon {
	font-size: 96rpx;
}
.empty-text {
	font-size: 28rpx;
	color: #999;
}
.empty-btn {
	margin: 0;
	font-size: 28rpx;
	color: #fff;
	background-color: #2979ff;
	border-radius: 36rpx;
	padding: 0 40rpx;
	height: 72rpx;
	line-height: 72rpx;
}

.conv-scroll {
	flex: 1;
	min-height: 0;
}
</style>
