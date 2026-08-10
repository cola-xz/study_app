<template>
	<view class="container">
		<view class="header">
			<text class="title">首页</text>
			<text class="sub-title">已登录，欢迎回来</text>
		</view>

		<view class="card">
			<view class="card-item">
				<text class="card-label">用户昵称</text>
				<text class="card-value">{{ userStore.getUserInfo?.realName || '未设置' }}</text>
			</view>
			<view class="card-item">
				<text class="card-label">账号</text>
				<text class="card-value">{{ userStore.getUserInfo?.username || '-' }}</text>
			</view>
		</view>

		<button class="system-btn" type="primary" @click="handleSystem">进入系统</button>

		<button class="logout-btn" type="warn" @click="handleLogout">退出登录</button>
	</view>
</template>

<script lang="ts" setup>
import { onShow } from '@dcloudio/uni-app'
import { clearLoginState } from '@/utils/request'
import { getUserInfo } from '@/api/user'
import { isLogin, ROUTES } from '@/utils/router'
import { useUserStore } from '@/store/modules/user'

const userStore = useUserStore();

onShow(() => {
	// 未登录时不允许停留在本页，直接回到登录页
	if (!isLogin()) {
		uni.reLaunch({ url: ROUTES.login })
		return
	}
})

function handleSystem() {
	let homeInfo = userStore.getUserInfo;

	let toPath = '';
	if (homeInfo.homePath) {
		toPath = homeInfo.homePath.path;
	} else {
		toPath = '/pages/appcenter/video';
	}
	uni.reLaunch({ url: toPath })
}

function handleLogout() {
	uni.showModal({
		title: '提示',
		content: '确定要退出登录吗？',
		success: (res) => {
			if (res.confirm) {
				userStore.logout();
			}
		}
	})
}
</script>

<style>
	.container {
		width: calc(100vw - 60rpx);
		height: calc(100vh - 60rpx);
		overflow-y: hidden;
		background-color: #f5f6fa;
		padding: 30rpx;
	}

	.header {
		padding: 40rpx 20rpx;
	}

	.title {
		font-size: 48rpx;
		font-weight: bold;
		color: #333333;
		display: block;
	}

	.sub-title {
		font-size: 26rpx;
		color: #999999;
		margin-top: 12rpx;
	}

	.card {
		background-color: #ffffff;
		border-radius: 16rpx;
		padding: 20rpx 30rpx;
		margin-top: 20rpx;
	}

	.card-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 24rpx 0;
		border-bottom: 1rpx solid #f0f0f0;
	}

	.card-item:last-child {
		border-bottom: none;
	}

	.card-label {
		font-size: 28rpx;
		color: #666666;
	}

	.card-value {
		font-size: 28rpx;
		color: #333333;
	}

	.system-btn {
		margin-top: 60rpx;
		border-radius: 12rpx;
	}

	.logout-btn {
		margin-top: 60rpx;
		border-radius: 12rpx;
	}
</style>
