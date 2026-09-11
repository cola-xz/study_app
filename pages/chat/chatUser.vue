<template>
	<app-layout>
		<template #nav-right>
			<view class="nav-add" @click="toggleSearch">
				<text class="nav-add-text">{{ showSearch ? '取消' : '添加' }}</text>
			</view>
		</template>

		<view class="page">
			<!-- 搜索/添加用户 -->
			<view v-if="showSearch" class="search-bar">
				<input
					class="search-ipt"
					v-model="searchValue"
					type="text"
					placeholder="搜索用户名 / 真实姓名"
					confirm-type="search"
					@confirm="onSearch"
				/>
				<button class="search-btn" :disabled="searchLoading" @click="onSearch">
					搜索
				</button>
			</view>

			<view v-if="showSearch" class="search-result">
				<view v-if="searchLoading" class="search-tip">搜索中...</view>
				<view v-else-if="!searchList.length && searched" class="search-tip">
					未找到用户
				</view>
				<view
					v-for="(item, index) in searchList"
					:key="index"
					class="result-item"
				>
					<image
						v-if="item.avatarUrl"
						class="avatar"
						:src="setAvatarUrl(item.avatarUrl)"
						mode="aspectFill"
					/>
					<view
						v-else
						class="avatar"
						:style="{ backgroundColor: avatarColor(item.username) }"
					>
						<text class="avatar-text">{{ firstChar(item.username) }}</text>
					</view>
					<view class="result-info">
						<text class="result-name">{{ item.username }}</text>
						<text class="result-real">{{ item.realName || '—' }}</text>
					</view>
					<button
						class="add-btn"
						:disabled="isFriend(item)"
						@click="handleAdd(item)"
					>
						{{ isFriend(item) ? '已是好友' : '加好友' }}
					</button>
				</view>
			</view>

			<!-- 好友申请 -->
			<view
				v-if="chatStore.friendRequestList.length"
				class="req-entry"
				@click="showRequests = !showRequests"
			>
				<text class="req-title">好友申请</text>
				<view class="req-badge">
					<text class="req-badge-text">{{ chatStore.friendRequestList.length }}</text>
				</view>
				<text class="req-arrow">{{ showRequests ? '▾' : '▸' }}</text>
			</view>
			<view v-if="showRequests && chatStore.friendRequestList.length" class="req-list">
				<view
					v-for="(item, index) in chatStore.friendRequestList"
					:key="index"
					class="req-item"
				>
					<image
						v-if="item.avatarUrl"
						class="avatar"
						:src="setAvatarUrl(item.avatarUrl)"
						mode="aspectFill"
					/>
					<view
						v-else
						class="avatar"
						:style="{ backgroundColor: avatarColor(item.username) }"
					>
						<text class="avatar-text">{{ firstChar(item.username) }}</text>
					</view>
					<view class="result-info">
						<text class="result-name">{{ item.username }}</text>
						<text class="result-real">{{ item.realName || '—' }}</text>
					</view>
					<view class="req-actions">
						<button class="mini-btn refuse" @click="handleRequest(item, 2)">
							拒绝
						</button>
						<button class="mini-btn accept" @click="handleRequest(item, 1)">
							接受
						</button>
					</view>
				</view>
			</view>

			<!-- 联系人列表 -->
			<scroll-view v-if="!showSearch" class="contact-scroll" scroll-y>
				<view v-if="!contactList.length" class="empty">
					<view class="empty-icon">👥</view>
					<text class="empty-text">您暂无好友，点击右上角「添加」</text>
				</view>

				<view v-for="(group, gi) in list" :key="gi" class="contact-group">
					<view class="group-letter">{{ group.letter }}</view>
					<view
						v-for="(friend, fi) in group.data"
						:key="fi"
						class="contact-item"
						@click="openChat(friend)"
					>
						<image
							v-if="friend.avatarUrl"
							class="avatar"
							:src="setAvatarUrl(friend.avatarUrl)"
							mode="aspectFill"
						/>
						<view
							v-else
							class="avatar"
							:style="{ backgroundColor: avatarColor(friend.username) }"
						>
							<text class="avatar-text">{{ firstChar(friend.username) }}</text>
						</view>
						<view class="contact-info">
							<text class="contact-name">{{ friend.username }}</text>
							<text class="contact-real">{{ friend.realName || '—' }}</text>
						</view>
						<text class="chat-arrow">💬</text>
					</view>
				</view>
			</scroll-view>
		</view>
	</app-layout>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getFriendList, searchUsers, addFriend, dealWithFriendRequest } from '@/api/chat';
import { useChatStore } from '@/store/modules/chat';
import { useUserStore } from '@/store/modules/user';
import { setAvatarUrl } from '@/utils/avatarUrl';

/** 后端接口未就绪时的本地 mock 好友，便于演示完整交互 */
const USE_MOCK = false;

const chatStore = useChatStore();
const userStore = useUserStore();

const list = ref<any[]>([]);
const contactList = ref<any[]>([]);
const showSearch = ref(false);
const showRequests = ref(false);
const searchValue = ref('');
const searchList = ref<any[]>([]);
const searchLoading = ref(false);
const searched = ref(false);

onLoad(() => {
	setFriendList();
	chatStore.refreshRequestFriendList();
});

function toggleSearch() {
	showSearch.value = !showSearch.value;
	if (!showSearch.value) {
		searchValue.value = '';
		searchList.value = [];
		searched.value = false;
	}
}

async function setFriendList() {
	list.value = [];
	contactList.value = [];

	let data: any[] = [];
	if (USE_MOCK) {
		data = [
			{ receiveUserInfo: { id: 'mock-user-1', username: 'zhangsan', realName: '张三' } },
			{ receiveUserInfo: { id: 'mock-user-2', username: 'lisi', realName: '李四' } },
			{ receiveUserInfo: { id: 'mock-user-3', username: 'wangwu', realName: '王五' } },
		];
	} else {
		const res: any = await getFriendList({
			type: 'friendList',
			userId: userStore.userInfo?.id,
			isAgree: 1,
		});
		if (res.code == 200) data = res.data || [];
	}

	data.forEach((element: any) => {
		const info = element.receiveUserInfo;
		contactList.value.push(info);
		const letter = (info.username || '#')[0].toUpperCase();
		const index = list.value.findIndex((it: any) => it.letter === letter);
		if (index === -1) {
			list.value.push({ letter, data: [info] });
		} else {
			list.value[index].data.push(info);
		}
	});
}

async function onSearch() {
	const kw = searchValue.value.trim();
	if (!kw) {
		uni.showToast({ title: '请输入搜索内容', icon: 'none' });
		return;
	}
	searchLoading.value = true;
	searched.value = false;
	searchList.value = [];
	try {
		if (USE_MOCK) {
			await new Promise((r) => setTimeout(r, 300));
			const pool = [
				{ id: 'mock-user-4', username: 'zhaoliu', realName: '赵六' },
				{ id: 'mock-user-5', username: 'sunqi', realName: '孙七' },
				{ id: 'mock-user-1', username: 'zhangsan', realName: '张三' },
			];
			searchList.value = pool.filter(
				(it) =>
					it.username.toLowerCase().includes(kw.toLowerCase()) ||
					(it.realName || '').includes(kw)
			);
		} else {
			const res: any = await searchUsers({ searchString: kw });
			if (res.code == 200) searchList.value = res.data || [];
		}
	} finally {
		searchLoading.value = false;
		searched.value = true;
	}
}

function isFriend(item: any): boolean {
	return contactList.value.some((it: any) => it.id === item.id);
}

async function handleAdd(item: any) {
	chatStore.sendFriendRequest(item.username);
	if (!USE_MOCK) {
		await addFriend({ userId: userStore.userInfo?.id, friendId: item.id });
	}
	uni.showToast({ title: '好友申请已发送', icon: 'none' });
}

async function handleRequest(item: any, isAgree: number) {
	if (!USE_MOCK) {
		await dealWithFriendRequest({
			userId: userStore.userInfo?.id,
			friendId: item.id,
			isAgree,
		});
	}
	chatStore.friendRequestList = chatStore.friendRequestList.filter(
		(it: any) => it.id !== item.id
	);
	uni.showToast({ title: isAgree === 1 ? '已接受' : '已拒绝', icon: 'none' });
}

function openChat(friend: any) {
	const info: any = {
		sendUserId: userStore.userInfo?.id || '',
		sendUserName: userStore.userInfo?.username || '',
		sendUserAvatar: userStore.userInfo?.avatarUrl || '',
		receiveUserId: friend.id,
		receiveUserName: friend.username,
		receiveUserAvatar: friend.avatarUrl || '',
		isGroup: false,
	};
	chatStore.setChatUserInfo(info);
	const q = Object.keys(info)
		.map((k) => `${k}=${encodeURIComponent(info[k] ?? '')}`)
		.join('&');
	uni.navigateTo({ url: `/pages/chat/chatDetail?${q}` });
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
</script>

<style scoped>
.page {
	display: flex;
	flex-direction: column;
	height: 100%;
	background-color: #f5f6fa;
}

.nav-add {
	padding: 0 12rpx;
}
.nav-add-text {
	font-size: 28rpx;
	color: #2979ff;
}

.search-bar {
	display: flex;
	align-items: center;
	gap: 16rpx;
	padding: 16rpx 24rpx;
	background-color: #fff;
}
.search-ipt {
	flex: 1;
	height: 68rpx;
	line-height: 68rpx;
	background-color: #f5f6fa;
	border-radius: 34rpx;
	padding: 0 28rpx;
	font-size: 28rpx;
}
.search-btn {
	margin: 0;
	height: 68rpx;
	line-height: 68rpx;
	font-size: 28rpx;
	color: #fff;
	background-color: #2979ff;
	border-radius: 34rpx;
	padding: 0 32rpx;
}

.search-result {
	background-color: #fff;
}
.search-tip {
	text-align: center;
	font-size: 26rpx;
	color: #999;
	padding: 32rpx 0;
}

.avatar {
	width: 84rpx;
	height: 84rpx;
	border-radius: 14rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
}
.avatar-text {
	color: #fff;
	font-size: 32rpx;
	font-weight: 600;
}

.result-item,
.req-item,
.contact-item {
	display: flex;
	align-items: center;
	padding: 20rpx 24rpx;
	border-bottom: 1rpx solid #f0f0f0;
}
.result-item:active,
.contact-item:active {
	background-color: #f5f7fa;
}

.result-info,
.contact-info {
	flex: 1;
	min-width: 0;
	margin-left: 20rpx;
	display: flex;
	flex-direction: column;
	gap: 6rpx;
}
.result-name,
.contact-name {
	font-size: 30rpx;
	color: #333;
	font-weight: 500;
}
.result-real,
.contact-real {
	font-size: 24rpx;
	color: #999;
}

.add-btn,
.mini-btn {
	margin: 0;
	font-size: 24rpx;
	height: 60rpx;
	line-height: 60rpx;
	border-radius: 30rpx;
	padding: 0 28rpx;
}
.add-btn {
	color: #fff;
	background-color: #2979ff;
}
.add-btn[disabled] {
	background-color: #e0e0e0;
	color: #999;
}

.req-actions {
	display: flex;
	gap: 16rpx;
}
.mini-btn.refuse {
	color: #f5222d;
	background-color: rgba(245, 34, 45, 0.1);
}
.mini-btn.accept {
	color: #fff;
	background-color: #52c41a;
}

.req-entry {
	display: flex;
	align-items: center;
	padding: 24rpx;
	background-color: #fff;
	border-bottom: 1rpx solid #f0f0f0;
}
.req-title {
	flex: 1;
	font-size: 30rpx;
	color: #333;
	font-weight: 500;
}
.req-badge {
	min-width: 36rpx;
	height: 36rpx;
	border-radius: 18rpx;
	background-color: #f5222d;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0 10rpx;
	margin-right: 12rpx;
}
.req-badge-text {
	color: #fff;
	font-size: 22rpx;
}
.req-arrow {
	font-size: 26rpx;
	color: #999;
}
.req-list {
	background-color: #fff;
}

.contact-scroll {
	flex: 1;
	min-height: 0;
}
.group-letter {
	padding: 12rpx 24rpx;
	font-size: 24rpx;
	color: #999;
	background-color: #f0f2f5;
}
.chat-arrow {
	font-size: 34rpx;
}

.empty {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 24rpx;
	padding: 120rpx 0;
}
.empty-icon {
	font-size: 96rpx;
}
.empty-text {
	font-size: 28rpx;
	color: #999;
}
</style>
