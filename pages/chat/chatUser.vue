<template>
	<app-layout>
		<view class="page">
			<uni-indexed-list :options="list" :show-select="true" @click="bindClick" :showSelect="false" />
		</view>
	</app-layout>
</template>

<script name="chatUser" lang="ts" setup>
	import { ref, onMounted } from 'vue';
	import { getFriendList } from '@/api/chat';
	import { useUserStore } from '@/store/modules/user';
	const userStore = useUserStore();

	let list : any = ref([]);

	onMounted(() => {
		setFriendList();
	});

	async function setFriendList() {
		const res : any = await getFriendList({
			type: 'friendList',
			userId: userStore.userInfo.id,
			isAgree: 1,
		});

		if (res.code == 200) {
			res.data.forEach((element : any) => {
				let letter = element.receiveUserInfo.username[0].toUpperCase();
				let index: number = list.value.findIndex((item: any) => item.letter == letter);
				if (index === -1) {
					list.value.push({
						letter: letter,
						data: [`${element.receiveUserInfo.username}（ ${element.receiveUserInfo.realName} ）`],
					})
				} else {
					list.value[index].data.push(
						`${element.receiveUserInfo.username}（ ${element.receiveUserInfo.realName} ）`,
					)
				}
			})
			console.log(list.value);
		}
	}

	function bindClick(e : any) {
		console.log('点击item，返回数据' + e)

		uni.navigateTo({
			url: '/pages/chat/chatRoom?id=123&name=测试'
		})
	}
</script>

<style>
	.page {
		position: relative;
		width: 100%;
		height: 100%;
	}
</style>
