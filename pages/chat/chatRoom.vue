<template>
	<app-layout>
		<view class="room">
			<view class="state">连接状态：{{ chat.stateText }}</view>
			<view class="log">
				<text
					v-for="item in chat.messages"
					:key="item.id || item.ts"
					:class="['line', 'peer']"
					>{{ formatMsg(item) }}</text
				>
			</view>
			<view class="toolbar">
				<input v-model="inputText" class="ipt" placeholder="输入内容" />
				<button @tap="onSend">发送</button>
				<button @tap="onDisconnect">断开</button>
				<button @tap="onReconnect">重连</button>
			</view>
		</view>
	</app-layout>
</template>

<script setup>
import { ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useChatStore } from '@/store/modules/chat';
import { useUserStore } from '@/store/modules/user';

const WS_URL = 'ws://127.0.0.1:8080/ws/chat';

const chat = useChatStore();
const userStore = useUserStore();
const inputText = ref('');

function formatMsg(m) {
	// 预留：可额外展示 from / self
	return (typeof m === 'string' ? m : m.content) || '';
}

onLoad((options) => {
	console.log(options);

	chat.setEndpoint(WS_URL);
	// 指定当前私聊对象（用户名与后端 /user/queue/private 的映射一致）
	chat.setChatUserInfo({
		isGroup: false,
		sendUserName: (userStore.userInfo && userStore.userInfo.username) || '',
		receiveUserName: 'friend_a',
	});
	chat.connect();
});

onUnload(() => {
	// 保留长连接供它页复用；如需彻底断开关掉下一行
	// chat.disconnect()
});

function onSend() {
	const text = (inputText.value || '').trim();
	if (!text) return;
	chat.sendPrivateMessage({
		sendUserName: userStore.userInfo && userStore.userInfo.username,
		sendUserAvatar: (userStore.userInfo && userStore.userInfo.avatar) || '',
		receiveUserName: 'friend_a',
		receiveUserAvatar: '',
		sendUserId: userStore.userInfo && userStore.userInfo.id,
		content: text,
	});
	inputText.value = '';
}

function onDisconnect() {
	chat.disconnect();
}

function onReconnect() {
	chat.disconnect();
	// 复位重连计数再建立连接（Pinia 可直接写入 state）
	chat.reconnectAttempts = 0;
	chat.connect(chat.chatUserInfo);
}
</script>

<style scoped>
.room {
	padding: 20rpx;
}
.state {
	font-size: 28rpx;
	margin-bottom: 20rpx;
	color: #333;
}
.log {
	background: #f6f6f6;
	border-radius: 12rpx;
	padding: 20rpx;
	min-height: 300rpx;
	margin-bottom: 20rpx;
}
.line {
	display: block;
	font-size: 26rpx;
	line-height: 1.8;
	color: #666;
}
.peer {
	color: #07c160;
}
.toolbar {
	display: flex;
	align-items: center;
	gap: 16rpx;
}
.toolbar .ipt {
	flex: 1;
	border: 1px solid #ddd;
	border-radius: 8rpx;
	height: 68rpx;
	padding: 0 16rpx;
	min-height: 68rpx;
	line-height: 68rpx;
}
.toolbar button {
	margin: 0;
	font-size: 26rpx;
	line-height: 2;
}
</style>
