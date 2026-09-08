<template>
	<app-layout>
		<view class="page">
			<uni-indexed-list
				:options="list"
				:show-select="true"
				@click="bindClick"
				:showSelect="false"
			/>
		</view>
	</app-layout>
</template>

<script name="chatUser" lang="ts" setup>
import { ref, onMounted } from 'vue';
import { getFriendList } from '@/api/chat';
import { useUserStore } from '@/store/modules/user';
const userStore = useUserStore();

// 联系人列表
let list: any = ref([]);
// 好友列表信息
let friendList: any = ref([]);

onMounted(() => {
	setFriendList();
});

async function setFriendList() {
	list.value = [];
	friendList.value = [];

	const res: any = await getFriendList({
		type: 'friendList',
		userId: userStore.userInfo.id,
		isAgree: 1,
	});

	if (res.code == 200) {
		res.data.forEach((element: any) => {
			friendList.value.push(element.receiveUserInfo);

			let letter = element.receiveUserInfo.username[0].toUpperCase();
			let index: number = list.value.findIndex((item: any) => item.letter == letter);
			if (index === -1) {
				list.value.push({
					letter: letter,
					data: [
						`${element.receiveUserInfo.username}（ ${element.receiveUserInfo.realName} ）`,
					],
				});
			} else {
				list.value[index].data.push(
					`${element.receiveUserInfo.username}（ ${element.receiveUserInfo.realName} ）`
				);
			}
		});
	}
}

function bindClick(e: any) {
	let username: string = e.item.name.split('（')[0];
	let friendInfo: any = friendList.value.find((item: any) => item.username === username);

	let pathUrl: string = '/pages/chat/chatRoom?';
	Object.keys(friendInfo).forEach((key: string, index: number) => {
		pathUrl += `${key}=${friendInfo[key]}${
			index === Object.keys(friendInfo).length - 1 ? '' : '&'
		}`;
	});
	uni.navigateTo({
		url: pathUrl,
	});
}
</script>

<style>
.page {
	position: relative;
	width: 100%;
	height: 100%;
}
</style>
