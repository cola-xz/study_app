<template>
	<view class="app-layout">
		<!-- 顶部导航栏 -->
		<view class="nav-bar" :style="{ height: navBarHeight + 'px' }">
			<view
				class="nav-bar-placeholder"
				:style="{ height: statusBarHeight + 'px' }"
			></view>
			<view class="nav-bar-content" :style="{ height: navContentHeight + 'px' }">
				<view class="nav-bar-left" @click="handleBack">
					<text v-if="showBack" class="back-icon">‹</text>
				</view>
				<text class="nav-bar-title">{{ title }}</text>
				<view class="nav-bar-right">
					<!-- 下拉菜单栏 -->
					<view v-if="childMenus.length" class="dropdown">
						<view class="dropdown-trigger" @click="dropdownOpen = !dropdownOpen">
							<text class="dropdown-trigger-text">菜单</text>
							<text class="dropdown-trigger-arrow" :class="{ 'dropdown-trigger-arrow-open': dropdownOpen }">▾</text>
						</view>
						<view v-if="dropdownOpen" class="dropdown-panel" @click="dropdownOpen = false">
							<view
								v-for="menu in childMenus"
								:key="menu.path"
								class="dropdown-item"
								:class="{ 'dropdown-item-active': isActive(menu) }"
								@click.stop="handleMenuTap(menu)"
							>
								<text class="dropdown-item-title">{{ menu.title }}</text>
							</view>
						</view>
					</view>
					<view class="info-trigger" @click="openInfoPopup">
						<text class="info-trigger-text">信息</text>
					</view>
					<slot name="nav-right"></slot>
				</view>
			</view>
		</view>

		<!-- 页面主体内容 -->
		<view class="app-layout-body">
			<slot></slot>
		</view>

		<!-- 底部固定菜单栏 -->
		<view v-if="tabList.length" class="bottom-menu">
			<view
				v-for="item in tabList"
				:key="item.path"
				class="bottom-menu-item"
				:class="{ 'bottom-menu-item-active': isActive(item) }"
				@click="handleMenuTap(item)"
			>
				<text class="bottom-menu-item-title">{{ item.title }}</text>
			</view>
		</view>

		<!-- 常驻信息弹窗 -->
		<view v-if="infoPopupVisible" class="info-popup-mask" @click="closeInfoPopup">
			<view class="info-popup" @click.stop>
				<view class="info-popup-header">
					<text class="info-popup-title">路由信息</text>
					<text class="info-popup-close" @click="closeInfoPopup">×</text>
				</view>
				<view class="info-popup-body">
					<view v-if="activeMenuInfo" class="info-popup-row">
						<text class="info-popup-label">当前标题：</text>
						<text class="info-popup-value">{{ activeMenuInfo.title }}</text>
					</view>
					<view v-if="activeMenuInfo" class="info-popup-row">
						<text class="info-popup-label">当前路径：</text>
						<text class="info-popup-value">{{ activeMenuInfo.path }}</text>
					</view>
					<view v-if="childMenus.length" class="info-popup-row info-popup-row-col">
						<text class="info-popup-label">子路由：</text>
						<view class="info-popup-children">
							<text
								v-for="child in childMenus"
								:key="child.path"
								class="info-popup-child-item"
							>{{ child.title }} —— {{ child.path }}</text>
						</view>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useRouterStore } from '@/store/modules/router'
import { getCurrentPage, getRouteMeta } from '@/utils/router'

const props = withDefaults(
	defineProps<{
		title?: string
		showBack?: boolean
	}>(),
	{
		title: '',
		showBack: true
	}
)

interface MenuItem {
	name: string
	title: string
	path: string
	children?: MenuItem[]
}

const routerStore = useRouterStore()

const tabList = computed<MenuItem[]>(() => routerStore.getTabList || [])

/**
 * 收集当前激活的顶部菜单项下的子路由
 * 仅当当前页面命中某顶层菜单（或其子级）时，返回该子菜单；否则为空
 */
const childMenus = computed<MenuItem[]>(() => {
	if (!activePath.value) return []
	for (const item of tabList.value) {
		if (item.children && item.children.length > 0) {
			const match = findMenuByPath(item.children, activePath.value)
			if (match) {
				return item.children
			}
		}
	}
	return []
})

/**
 * 在菜单树中查找路径匹配的节点
 */
function findMenuByPath(items: MenuItem[], path: string): MenuItem | null {
	for (const item of items) {
		if (item.path === path) return item
		if (item.children && item.children.length > 0) {
			const found = findMenuByPath(item.children, path)
			if (found) return found
		}
	}
	return null
}

const dropdownOpen = ref(false)

const activePath = ref('')

// 常驻信息弹窗
const infoPopupVisible = ref(false)

/**
 * 当前激活的顶部菜单项（当前页面命中的顶层菜单）
 */
const activeMenuInfo = computed<MenuItem | null>(() => {
	if (!activePath.value) return null
	for (const item of tabList.value) {
		if (item.path === activePath.value) return item
		if (item.children && item.children.length > 0) {
			const match = findMenuByPath(item.children, activePath.value)
			if (match) return item
		}
	}
	return null
})

function openInfoPopup() {
	infoPopupVisible.value = true
}

function closeInfoPopup() {
	infoPopupVisible.value = false
}

const title = ref(props.title)

const statusBarHeight = ref(20)
const navContentHeight = ref(44)

const navBarHeight = computed(() => statusBarHeight.value + navContentHeight.value)

onLoad(() => {
	setPageTitle()
	syncActivePath()

	const sys = uni.getSystemInfoSync()
	// 状态栏高度
	statusBarHeight.value = sys.statusBarHeight ?? 20
	// 导航栏内容高度（胶囊按钮所在区域，仅小程序端存在）
	let buttonHeight = 0
	if ((sys as any)?.menuButtonBoundingClientRect?.top !== undefined) {
		const menu = (sys as any).menuButtonBoundingClientRect
		buttonHeight = menu.height || 0
	}
	// 无胶囊按钮（H5/App）时用固定值
	navContentHeight.value = buttonHeight > 0 ? buttonHeight : 44
})

onShow(() => {
	syncActivePath()
})

/**
 * 根据当前页面路径自动从路由配置表读取标题
 * 未配置时回退为手动传入的 title prop
 */
function setPageTitle() {
	const path = getCurrentPage()
	const meta = getRouteMeta(path)
	title.value = (meta && meta.title) || props.title
}

/**
 * 同步当前激活的菜单路径
 */
function syncActivePath() {
	activePath.value = getCurrentPage()
}

/**
 * 判断菜单项是否为当前激活页面
 * 有子菜单时，任一子路由匹配即视为激活
 */
function isActive(item: MenuItem): boolean {
	if (activePath.value === item.path) return true
	if (item.children && item.children.length > 0) {
		return item.children.some((child) => isActive(child))
	}
	return false
}

/**
 * 取菜单项要跳转的默认路由：有子菜单时跳第一个子路由，否则跳自身
 */
function getDefaultPath(item: MenuItem): string {
	if (item.children && item.children.length > 0) {
		return getDefaultPath(item.children[0])
	}
	return item.path
}

/**
 * 点击底部菜单项跳转
 */
function handleMenuTap(item: MenuItem) {
	const target = getDefaultPath(item)
	if (activePath.value === target) return
	uni.navigateTo({ url: target })
}

function handleBack() {
	uni.navigateTo({ url: '/pages/home/home' })
}
</script>

<style>
	.app-layout {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background-color: #f5f6fa;
	}

	.nav-bar {
		position: sticky;
		top: 0;
		z-index: 100;
		width: 100%;
		background-color: #ffffff;
	}

	.nav-bar-content {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
	}

	.nav-bar-left {
		position: absolute;
		left: 0;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		height: 100%;
		padding: 0 24rpx;
		z-index: 10;
	}

	.back-icon {
		font-size: 48rpx;
		color: #333333;
		line-height: 1;
		font-weight: 300;
	}

	.nav-bar-title {
		flex: 1;
		text-align: center;
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	.nav-bar-right {
		position: absolute;
		right: 0;
		display: flex;
		align-items: center;
		height: 100%;
		padding: 0 24rpx;
		z-index: 10;
	}

	.dropdown {
		position: relative;
		margin-right: 16rpx;
	}

	.dropdown-trigger {
		display: flex;
		align-items: center;
		padding: 8rpx 16rpx;
		border-radius: 8rpx;
		background-color: #f5f6fa;
	}

	.dropdown-trigger-text {
		font-size: 26rpx;
		color: #333333;
	}

	.dropdown-trigger-arrow {
		margin-left: 8rpx;
		font-size: 20rpx;
		color: #666666;
		transition: transform 0.2s;
	}

	.dropdown-trigger-arrow-open {
		transform: rotate(180deg);
	}

	.dropdown-panel {
		position: absolute;
		top: calc(100% + 8rpx);
		right: 0;
		z-index: 110;
		min-width: 200rpx;
		background-color: #ffffff;
		border-radius: 12rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.12);
		overflow: hidden;
	}

	.dropdown-item {
		padding: 24rpx;
	}

	.dropdown-item:active {
		background-color: #f5f6fa;
	}

	.dropdown-item-title {
		font-size: 28rpx;
		color: #333333;
	}

	.dropdown-item-active {
		background-color: rgba(41, 121, 255, 0.08);
	}

	.dropdown-item-active .dropdown-item-title {
		color: #2979ff;
		font-weight: 600;
	}

	.app-layout-body {
		flex: 1;
		width: 100%;
		padding-bottom: 120rpx;
	}

	.bottom-menu {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		background-color: #ffffff;
		box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.06);
		padding-bottom: constant(safe-area-inset-bottom);
		padding-bottom: env(safe-area-inset-bottom);
	}

	.bottom-menu-item {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100rpx;
	}

	.bottom-menu-item-title {
		font-size: 26rpx;
		color: #999999;
	}

	.bottom-menu-item-active {
		border-top: 4rpx solid #2979ff;
	}

	.bottom-menu-item-active .bottom-menu-item-title {
		color: #2979ff;
		font-weight: 600;
	}

	.info-trigger {
		display: flex;
		align-items: center;
		padding: 8rpx 16rpx;
		border-radius: 8rpx;
		background-color: #f5f6fa;
	}

	.info-trigger-text {
		font-size: 26rpx;
		color: #333333;
	}

	.info-popup-mask {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 999;
		background-color: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.info-popup {
		width: 80%;
		max-height: 70vh;
		background-color: #ffffff;
		border-radius: 16rpx;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.info-popup-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 30rpx;
		border-bottom: 1rpx solid #f0f0f0;
	}

	.info-popup-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	.info-popup-close {
		font-size: 40rpx;
		color: #999999;
		line-height: 1;
	}

	.info-popup-body {
		padding: 30rpx;
		overflow-y: auto;
	}

	.info-popup-row {
		display: flex;
		align-items: flex-start;
		margin-bottom: 16rpx;
	}

	.info-popup-row-col {
		flex-direction: column;
	}

	.info-popup-label {
		font-size: 28rpx;
		color: #666666;
		margin-right: 12rpx;
	}

	.info-popup-value {
		font-size: 28rpx;
		color: #333333;
		flex: 1;
	}

	.info-popup-children {
		display: flex;
		flex-direction: column;
		margin-top: 8rpx;
	}

	.info-popup-child-item {
		font-size: 26rpx;
		color: #555555;
		margin-bottom: 8rpx;
	}
</style>
