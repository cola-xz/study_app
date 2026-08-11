<template>
	<app-layout>
		<template #['nav-right']>
			<image class="logo" src="/static/personal/qrcode.png" mode="aspectFit" @click="handleScan"></image>
		</template>
	</app-layout>
</template>

<script lang="ts" setup>
	import { qrCodeScan } from '@/api/user'
	import { getToken } from '@/utils/request'

	const handleScan = () => {
	  uni.scanCode({
	    success: async (res) => {
	      // res.result 就是二维码的内容，比如 "myapp://login?loginId=abc-123"
	      const qrContent = res.result;

	      // 从二维码内容中解析出 loginId
	      // 简单示例：用正则或URLSearchParams解析
	      const loginId = extractLoginIdFromUrl(qrContent);
	      if (!loginId) {
	        uni.showToast({ title: '无效二维码', icon: 'none' });
	        return;
	      }

	      // 获取App端当前登录用户的Token
	      const userToken = getToken();

	      // 调用后端接口，告知该二维码已被扫描
	      try {
	        await qrCodeScan({
	          loginId: loginId,
	          userToken: userToken
	        });
	        uni.showToast({ title: '扫码成功', icon: 'success' });
	      } catch (error) {
	        uni.showToast({ title: '扫码失败：' + error.message, icon: 'none' });
	      }
	    },
	    fail: (err) => {
	      console.error('扫码失败', err);
	    }
	  });
	};

	// 从URL字符串中提取loginId参数的辅助函数
	function extractLoginIdFromUrl(url: string) {
	  try {
	    const urlObj = new URL(url);
	    return urlObj.searchParams.get('loginId');
	  } catch (e) {
	    // 如果不是标准URL，尝试用正则匹配
	    const match = url.match(/loginId=([^&]+)/);
	    return match ? match[1] : null;
	  }
	}
</script>

<style scoped>
	.logo {
		width: 45rpx;
		height: 45rpx;
	}
</style>
