<template>
	<view class="container">
		<view class="login-box">
			<image class="logo" src="/static/logo.png" mode="aspectFit"></image>
			<text class="app-title">{{ appName }}</text>
			<text class="app-desc">欢迎使用，请登录</text>

			<view class="form">
				<view class="form-item">
					<text class="label">账号</text>
					<input
						class="input"
						v-model="form.username"
						placeholder="请输入账号"
						placeholder-class="placeholder"
					/>
				</view>
				<view class="form-item">
					<text class="label">密码</text>
					<input
						class="input"
						v-model="form.password"
						password
						placeholder="请输入密码"
						placeholder-class="placeholder"
					/>
				</view>

				<button class="login-btn" type="primary" :loading="loading" @click="handleLogin">
					登 录
				</button>
			</view>
		</view>
	</view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/modules/user';

const userStore = useUserStore();

const appName = ref('uni-app')
const loading = ref(false)
const from = ref('')
const form = ref({
	username: '',
	password: ''
})

onLoad((options: any) => {
	// 记录登录后要返回的页面
	if (options && options.from) {
		from.value = decodeURIComponent(options.from) as string;
	}
})

async function handleLogin() {
	if (!form.value.username.trim()) {
		uni.showToast({ title: '请输入账号', icon: 'none' })
		return
	}
	if (!form.value.password) {
		uni.showToast({ title: '请输入密码', icon: 'none' })
		return
	}

	loading.value = true
	try {
		// 模拟登录API调用
		let homePath = await userStore.login({
			username: form.value.username.trim(),
			password: form.value.password
		});

		goAfterLogin(homePath)
	} catch (e: any) {
		uni.showToast({ title: e?.message || '登录失败，请重试', icon: 'none' })
	} finally {
		loading.value = false
	}
}

function goAfterLogin(homePath: string) {
	// 登录成功后返回来源页面，否则回到首页
	const target = from.value && from.value !== homePath ? from.value : homePath
	setTimeout(() => {
		uni.reLaunch({ url: target })
	}, 500)
}
</script>

<style>
	.container {
		min-height: 100vh;
		background-color: #f5f6fa;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.login-box {
		width: 80%;
		background-color: #ffffff;
		border-radius: 24rpx;
		padding: 60rpx 40rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.logo {
		width: 160rpx;
		height: 160rpx;
		margin-bottom: 20rpx;
	}

	.app-title {
		font-size: 40rpx;
		font-weight: bold;
		color: #333333;
	}

	.app-desc {
		font-size: 26rpx;
		color: #999999;
		margin-top: 12rpx;
		margin-bottom: 40rpx;
	}

	.form {
		width: 100%;
	}

	.form-item {
		margin-bottom: 30rpx;
	}

	.label {
		font-size: 26rpx;
		color: #666666;
		display: block;
		margin-bottom: 12rpx;
	}

	.input {
		width: auto;
		height: 88rpx;
		background-color: #f5f6fa;
		border-radius: 12rpx;
		padding: 0 24rpx;
		font-size: 30rpx;
		color: #333333;
	}

	.placeholder {
		color: #c0c4cc;
	}

	.login-btn {
		width: 100%;
		margin-top: 20rpx;
		border-radius: 12rpx;
	}
</style>
