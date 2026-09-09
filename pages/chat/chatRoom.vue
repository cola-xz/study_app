<template>
	<app-layout>
		<uni-list :border="true">
			<uni-list-chat
				v-for="(item, index) in friendList"
				:key="index"
				:title="item.username"
				:avatar="item.avatarUrl"
				note="您收到一条新的消息"
				time="2020-02-02 20:20"
				badge-text="12"
			></uni-list-chat>
		</uni-list>
	</app-layout>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { useChatStore } from '@/store/modules/chat';
import { useUserStore } from '@/store/modules/user';
import envConfig from '@/env/index';
import { getMessageRecord } from '@/api/chat';

const chat = useChatStore();
const userStore = useUserStore();
const inputText = ref('');

onLoad((options) => {
	// 链接ws
	chat.connect();
	// 获取消息列表
	getMessageList();
});

onUnload(() => {
	// 保留长连接供它页复用；如需彻底断开关掉下一行
	// chat.disconnect()
});

let friendList: any = ref([]);
async function getMessageList() {
	friendList.value = [];
	const res: any = await getMessageRecord({
		sendUserId: userStore.userInfo.id,
	});
	if (res.code == 200) {
		res.data.forEach((element: any) => {
			console.log(element);
			if (element.groupId) {
				friendList.value.push({
					avatarUrl: '',
					realName: element.content,
					username: element.content,
					id: element.groupId,
				});
			} else {
				friendList.value.push({
					avatarUrl: setAvatarUrl(element.userInfo.avatarUrl),
					realName: element.userInfo.realName,
					username: element.userInfo.username,
					id: element.userInfo.id,
				});
			}
		});
	}
}

function setAvatarUrl(getUrl: string | null): string {
  let avatarUrl: string = '';
  console.log(getUrl);
  if (getUrl) {
    let postUrl: string = '/fileView/fileUploads';
    let keyUrl: string = envConfig.baseUrl;

    // 检查是否已经包含了完整的 base URL + postUrl
    if (getUrl.includes(`${keyUrl}${postUrl}`)) {
      // 已经包含完整前缀，直接返回
      avatarUrl = getUrl;
    } else if (getUrl.includes('/fileView/fileUploads')) {
      // 只包含 postUrl，拼接 keyUrl
      avatarUrl = `${keyUrl}${getUrl}`;
    } else {
      // 不包含任何前缀，完整拼接
      avatarUrl = `${keyUrl}${postUrl}${getUrl}`;
    }
  }
  return avatarUrl;
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
