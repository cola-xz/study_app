<template>
	<app-layout>
		<view class="page">
			<view class="video-container">
				<!-- 左侧：目录浏览 -->
				<view class="tree-panel">
					<view class="panel-head">
						<view class="panel-title-row">
							<view class="panel-title-dot"></view>
							<text class="panel-title">视频目录</text>
						</view>
						<text class="panel-sub">
							<text v-if="isDemoData" class="panel-sub-demo">演示数据 · </text>{{ dirCount }} 个目录 · {{ videoCount }} 个视频
						</text>
					</view>
					<scroll-view scroll-y class="tree-scroll" :show-scrollbar="false">
						<view v-if="listLoading" class="list-empty">
							<text class="empty-text">加载中...</text>
						</view>
						<view v-else-if="hasError" class="list-empty">
							<text class="empty-text">加载失败</text>
							<view class="empty-action" @click="loadVideoList()">点击重试</view>
						</view>
						<view v-else-if="tree.length === 0" class="list-empty">
							<text class="empty-text">暂无目录</text>
						</view>
						<template v-else>
							<view v-for="node in tree" :key="node.id" class="tree-node">
								<tree-node
									:node="node"
									:depth="0"
									:active-id="activeId"
									@toggle="toggleNode"
									@select="handleSelectVideo"
								/>
							</view>
						</template>
					</scroll-view>
				</view>
			</view>
		</view>

		<!-- 文件详情弹窗 -->
		<uni-popup ref="detailPopup" type="center" :is-mask-click="true">
			<view v-if="popupSelected" class="popup-panel">
				<view class="popup-head">
					<view class="popup-title-row">
						<view class="popup-folder-icon">🎬</view>
						<text class="popup-title">{{ popupSelected.name || displayName(popupSelected.raw) }}</text>
					</view>
					<text class="popup-sub">{{ popupSelected.displayPath || displayRawPath(popupSelected.raw) }}</text>
					<view class="popup-close" @click="closePopup">✕</view>
				</view>

			<view class="popup-body">
				<view v-if="videoUrl" class="player-wrap">
					<video
						v-if="playing"
						:id="'videoPlayer'"
						class="player-video"
						:src="videoUrl"
						:show-center-play-btn="false"
						controls
						autoplay
						@error="handlePlayerError"
						@play="resolveVideoContext"
					></video>
				</view>
				<view v-if="playerError" class="player-error">
					<text class="player-error-text">视频加载失败，请检查地址或网络后重试</text>
				</view>

				<view class="popup-detail">
						<view class="popup-detail-row">
							<text class="popup-detail-label">文件名</text>
							<text class="popup-detail-value">{{ displayName(popupSelected.raw) }}</text>
						</view>
						<view class="popup-detail-row">
							<text class="popup-detail-label">文件格式</text>
							<text class="popup-detail-value">{{ formatType(popupSelected.raw) }}</text>
						</view>
						<view v-if="popupSelected.raw.fileDesc" class="popup-detail-row">
							<text class="popup-detail-label">简介</text>
							<text class="popup-detail-value">{{ popupSelected.raw.fileDesc }}</text>
						</view>
					</view>

					<view class="popup-play" @click="handlePlay">
						<view class="popup-play-circle">▶</view>
						<text class="popup-play-text">{{ playing ? '继续播放' : '播放视频' }}</text>
					</view>
				</view>
			</view>
		</uni-popup>
	</app-layout>
</template>

<script lang="ts" setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { getAllFilesByFileType, getUploadInfo } from '@/api/novel'
import envConfig from '@/env/index'
import TreeNode from './components/tree-node.vue'

interface VideoItem {
	id?: string
	fileName: string
	fileSuffix?: string
	fileByName?: string
	fileDesc?: string
	childrenPath?: string
	/** 文件所在目录路径，如 /concert/dengziqi */
	path?: string
	/** 文件名（可含后缀） */
	key?: string
	/** 文件类型后缀，如 .mp4 或 mp4 */
	type?: string
	[key: string]: any
}

interface UploadChild {
	id: string
	parentId?: string
	fileTypeId?: string
	childPath?: string
	pathName?: string
	[key: string]: any
}

type TreeNodeData = {
	id: string
	name: string
	raw?: VideoItem
	isDir: boolean
	level: number
	expanded: boolean
	path?: string
	/** 目录链上的 pathName 拼成的显示路径，如 /演唱会/邓紫棋 */
	displayPath?: string
	children: TreeNodeData[]
}

const fileType = 'video'

const flatList = ref<VideoItem[]>([])
const listLoading = ref(false)
const hasError = ref(false)

const playing = ref(false)
const videoCount = computed(() => flatList.value.length)

// 视频播放状态
const videoUrl = ref('')
const playerError = ref(false)
const videoContext = ref<any>(null)

const isDemoData = ref(false)

// 弹窗状态
const detailPopup = ref<any>(null)
const activeId = ref('')
const popupSelected = ref<TreeNodeData | null>(null)

const dirCount = computed(() => {
	let count = 0
	const walk = (nodes: TreeNodeData[]) => {
		for (const n of nodes) {
			if (n.isDir) {
				count++
				walk(n.children)
			}
		}
	}
	walk(tree.value)
	return count
})

/**
 * 演示用多级目录数据：目录结构与 getUploadInfo 的 uploadChildren 保持一致，
 * 文件列表结构与 getAllFilesByFileType 保持一致。
 * 接口有真实数据时不再使用。
 */
const DEMO_DIRS: UploadChild[] = [
	{ id: 'demo-concert', parentId: '', childPath: 'concert', pathName: '演唱会' },
	{ id: 'demo-concert-dengziqi', parentId: 'demo-concert', childPath: 'dengziqi', pathName: '邓紫棋' },
	{ id: 'demo-test', parentId: '', childPath: 'test', pathName: '测试' },
	{ id: 'demo-test-2', parentId: 'demo-test', childPath: 'test2', pathName: '测试2' }
]

const DEMO_VIDEOS: VideoItem[] = [
	{
		fileName: '邓紫棋演唱会现场', fileSuffix: '.mp4', fileByName: '邓紫棋演唱会现场',
		childrenPath: '/concert/dengziqi', fileDesc: '邓紫棋演唱会精彩现场实录。'
	},
	{
		fileName: '测试片段', fileSuffix: '.mp4', fileByName: '测试片段',
		childrenPath: '/test/test2', fileDesc: '演示用测试视频片段。'
	}
]

/**
 * 工具：把文件的所在路径归一化为以 / 分隔的目录段数组。
 * 优先读取 childrenPath（后端返回的完整相对路径，如 /test/test2），
 * 其次兼容 fileByPath/directory/relativePath 等字段。无路径时返回空数组（根级）。
 */
function pathSegments(item: VideoItem): string[] {
	const relPath = item.childrenPath || item.path || item.fileByPath || item.directory || item.relativePath || ''
	const rawPath = (relPath || '').replace(/[\\]+/g, '/')
	return rawPath.split('/').filter(Boolean)
}

/**
 * 基于 getUploadInfo 返回的目录列表，通过 parentId 构建目录树；
 * 再根据 getUploadInfo 返回的 isChildren 把文件挂载到对应目录。
 */
function buildTree(dirList: UploadChild[], files: VideoItem[]): TreeNodeData[] {
	const root = reactive<TreeNodeData>({
		id: '__root__',
		name: '全部',
		isDir: true,
		level: -1,
		expanded: true,
		path: '',
		children: []
	})
	const index: Record<string, TreeNodeData> = { '__root__': root }

	for (const dir of dirList) {
		if (!dir.id) continue
		const node = reactive<TreeNodeData>({
			id: String(dir.id),
			name: dir.pathName || dir.childPath || '未命名目录',
			isDir: true,
			level: 0,
			expanded: true,
			path: dir.childPath || '',
			children: []
		})
		index[String(dir.id)] = node
	}

	for (const dir of dirList) {
		if (!dir.id) continue
		const node = index[String(dir.id)]
		const parent = index[String(dir.parentId || '')] || root
		parent.children.push(node)
		node.level = parent.level + 1
		const parentPath = parent.id === '__root__' ? '' : (parent.displayPath || '')
		node.displayPath = parentPath + '/' + node.name
	}

	const vidId = (item: VideoItem, suffix: string) => `video__${suffix}__${item.key || item.fileName}${item.fileNameSuffix || item.fileSuffix || ''}`

	for (const item of files) {
		const suffix = (item.fileSuffix || item.type || '').replace(/^\./, '')
		const segs = pathSegments(item)
		// 根据文件的目录段，找到最匹配的目录节点（逐层向下）
		let parent: TreeNodeData = root
		let matched = ''
		for (const seg of segs) {
			const childDir = parent.children.find((c) => c.isDir && (c.path === seg || c.name === seg))
			if (childDir) {
				matched = childDir.path
				parent = childDir
			} else {
				break
			}
		}
		const leaf = reactive<TreeNodeData>({
			id: vidId(item, suffix),
			name: item.fileByName || item.fileName || displayName(item),
			raw: item,
			isDir: false,
			level: parent.level + 1,
			expanded: false,
			path: matched,
			displayPath: parent.id === '__root__' ? '/' : (parent.displayPath || matched),
			children: []
		})
		parent.children.push(leaf)
	}

	return root.children
}

const dirList = ref<UploadChild[]>([])
const tree = computed<TreeNodeData[]>(() => buildTree(dirList.value, flatList.value))

function displayName(item: VideoItem): string {
	// 优先 key 字段，去掉后缀作为显示名
	const k = item.key || ''
	if (k) {
		const type = (item.type || '').replace(/^\./, '')
		return type ? k.replace(new RegExp('\\.' + type + '$', 'i'), '') : k
	}
	return item.fileName || '未命名视频'
}

function formatType(item: VideoItem): string {
	const suffix = (item.fileSuffix || item.type || '').replace(/^\./, '').toUpperCase()
	return suffix ? `${suffix} 视频` : '视频'
}

/**
 * 兜底：无 displayPath 时退回原始路径字段
 */
function displayRawPath(item: VideoItem): string {
	return item.childrenPath || item.path || '/'
}

/**
 * 展开/收起目录节点
 */
function toggleNode(node: TreeNodeData) {
	node.expanded = !node.expanded
}

/**
 * 点击文件：弹出该文件详情
 */
function handleSelectVideo(item: TreeNodeData) {
	if (!item.raw) return
	stopVideo()
	activeId.value = item.id
	popupSelected.value = item
	playing.value = false
	videoUrl.value = ''
	playerError.value = false
	if (detailPopup.value) {
		detailPopup.value.open('center')
	}
}

function stopVideo() {
	if (videoContext.value) {
		videoContext.value.stop()
		videoContext.value = null
	}
}

function closePopup() {
	if (detailPopup.value) {
		detailPopup.value.close()
	}
	popupSelected.value = null
	playing.value = false
	videoUrl.value = ''
	playerError.value = false
}

/**
 * 根据文件项拼接视频的相对资源路径，返回含 /videoStream 前缀与 token 的完整可播放 URL
 */
function startVideo(item: VideoItem): string {
	const finalPath = '/uploads/video'

	let path: string = item.path || item.childrenPath || ''
	if (path && !path.startsWith('/')) path = '/' + path

	let key: string = item.key || item.fileName || ''
	if (key && !key.startsWith('/')) key = '/' + key
	if (item.type && !new RegExp('\\.' + item.type.replace(/^\./, '') + '$', 'i').test(key)) {
		if (key.endsWith('/')) key = key.slice(0, -1)
		key += item.type.startsWith('.') ? item.type : '.' + item.type
	}
	let fileSuffix: string = item.fileSuffix || '';

	return getVideoFile({ fileUrl: finalPath + path + key + fileSuffix })
}

/**
 * 获取视频文件的可播放地址（token 通过查询参数携带）
 */
function getVideoFile({ fileUrl }: { fileUrl: string }) {
	const token = uni.getStorageSync('study_app_token') || ''
	const base = envConfig.baseUrl
	return `${base}/videoStream${fileUrl}?token=${token}`
}

function handlePlayerError(e: any) {
	playerError.value = true
	console.error('视频播放失败:', e?.detail || e)
}

function resolveVideoContext() {
	videoContext.value = uni.createVideoContext('videoPlayer')
}

function handlePlay() {
	if (!popupSelected.value || !popupSelected.value.raw) return

	stopVideo()
	playing.value = true
	playerError.value = false
	videoUrl.value = startVideo(popupSelected.value.raw);
}

async function loadVideoList() {
	listLoading.value = true
	hasError.value = false
	isDemoData.value = false
	try {
		// 两个接口并行请求：目录树 + 文件列表
		const [dirRes, fileRes] = await Promise.all([
			getUploadInfo({ fileType }),
			getAllFilesByFileType({ fileType })
		])

		const dirs = dirRes.code === 200 ? (dirRes.data?.uploadChildren || []) : []
		dirList.value = dirs

		if (fileRes.code === 200 && fileRes.data?.fileList?.length) {
			flatList.value = fileRes.data.fileList
		} else {
			flatList.value = []
		}
	} catch (error) {
		console.error('获取视频信息失败:', error)
		hasError.value = true
		dirList.value = []
		flatList.value = []
	}
	// 接口无真实数据时回退到演示数据
	if (dirList.value.length === 0 && flatList.value.length === 0) {
		dirList.value = DEMO_DIRS
		flatList.value = DEMO_VIDEOS
		isDemoData.value = true
	}
	listLoading.value = false
}

onMounted(() => {
	loadVideoList()
})
</script>

<style scoped>
	.page {
		position: fixed;
		top: 85rpx;
		left: 0;
		right: 0;
		bottom: calc(100rpx + env(safe-area-inset-bottom));
		overflow: hidden;
	}

	.video-container {
		width: 100%;
		height: 100%;
		padding: 20rpx;
		box-sizing: border-box;
		background: #f3f5fb;
	}

	/* 目录树面板 */
	.tree-panel {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background-color: #ffffff;
		border-radius: 24rpx;
		box-shadow: 0 6rpx 24rpx rgba(31, 58, 147, 0.06);
		overflow: hidden;
	}

	.panel-head {
		padding: 24rpx 28rpx 18rpx;
		display: flex;
		flex-direction: column;
		gap: 6rpx;
		border-bottom: 1rpx solid #f0f2f8;
		flex-shrink: 0;
	}

	.panel-title-row {
		display: flex;
		align-items: center;
		gap: 12rpx;
	}

	.panel-title-dot {
		width: 10rpx;
		height: 10rpx;
		border-radius: 50%;
		background-color: #4b7aff;
	}

	.panel-title {
		font-size: 30rpx;
		font-weight: 600;
		color: #1f2329;
	}

	.panel-sub {
		font-size: 22rpx;
		color: #9aa0b4;
		padding-left: 22rpx;
	}

	.panel-sub-demo {
		color: #ff9f43;
	}

	.tree-scroll {
		flex: 1;
		height: 0;
		padding: 8rpx 4rpx;
		box-sizing: border-box;
	}

	.tree-node {
		width: 100%;
	}

	/* 空/加载 */
	.list-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 20rpx;
		padding: 60rpx 24rpx;
	}

	.empty-text {
		font-size: 26rpx;
		color: #9aa0b4;
	}

	.empty-action {
		padding: 12rpx 36rpx;
		font-size: 26rpx;
		color: #4b7aff;
		background-color: #edf3ff;
		border-radius: 32rpx;
	}

	/* ===== 目录文件弹窗 ===== */
	.popup-panel {
		width: 620rpx;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		background-color: #ffffff;
		border-radius: 24rpx;
		overflow: hidden;
	}

	.popup-head {
		position: relative;
		padding: 28rpx 32rpx 20rpx;
		display: flex;
		flex-direction: column;
		gap: 6rpx;
		border-bottom: 1rpx solid #f0f2f8;
		flex-shrink: 0;
		background-color: #ffffff;
	}

	.popup-title-row {
		display: flex;
		align-items: center;
		gap: 14rpx;
		padding-right: 40rpx;
	}

	.popup-folder-icon {
		font-size: 36rpx;
		flex-shrink: 0;
	}

	.popup-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #1f2329;
		word-break: break-all;
	}

	.popup-sub {
		font-size: 22rpx;
		color: #9aa0b4;
		padding-left: 50rpx;
	}

	.popup-close {
		position: absolute;
		top: 20rpx;
		right: 20rpx;
		width: 52rpx;
		height: 52rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 30rpx;
		color: #8a90a5;
		background-color: #f0f2f8;
		border-radius: 50%;
		cursor: pointer;
	}

	.popup-scroll {
		flex: 1;
		height: 0;
		max-height: 40vh;
		padding: 16rpx 0;
		box-sizing: border-box;
	}

	.popup-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 60rpx 0;
	}

	.popup-empty-text {
		font-size: 26rpx;
		color: #9aa0b4;
	}

	.popup-file-row {
		display: flex;
		align-items: center;
		gap: 16rpx;
		margin: 6rpx 20rpx;
		padding: 16rpx 20rpx;
		border-radius: 14rpx;
		box-sizing: border-box;
		transition: background-color 0.2s;
		cursor: pointer;
	}

	.popup-file-row:active {
		background-color: #f0f2f8;
	}

	.popup-file-row-active {
		background-color: #edf3ff;
	}

	.popup-file-icon {
		font-size: 32rpx;
		flex-shrink: 0;
	}

	.popup-file-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6rpx;
	}

	.popup-file-name {
		font-size: 28rpx;
		color: #303640;
		word-break: break-all;
		line-height: 1.4;
	}

	.popup-file-path {
		font-size: 22rpx;
		color: #a0a6b8;
		word-break: break-all;
	}

	.popup-file-tag {
		flex-shrink: 0;
		font-size: 22rpx;
		color: #4b7aff;
		background-color: #edf3ff;
		padding: 4rpx 16rpx;
		border-radius: 18rpx;
	}

	.popup-detail {
		margin: 24rpx 24rpx 16rpx;
		padding: 24rpx 28rpx;
		background-color: #f8f9fd;
		border-radius: 20rpx;
		display: flex;
		flex-direction: column;
		gap: 16rpx;
		flex-shrink: 0;
	}

	/* ===== 视频播放器 ===== */
	.player-wrap {
		margin: 24rpx 24rpx 0;
		border-radius: 20rpx;
		overflow: hidden;
		background-color: #000;
		flex-shrink: 0;
	}

	.player-video {
		width: 100%;
		height: 340rpx;
	}

	.player-error {
		margin: 24rpx 24rpx 0;
		padding: 20rpx 24rpx;
		border-radius: 16rpx;
		background-color: #fff3f3;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.player-error-text {
		font-size: 26rpx;
		color: #e05151;
	}

	.popup-detail-row {
		display: flex;
		gap: 14rpx;
	}

	.popup-detail-label {
		flex-shrink: 0;
		font-size: 24rpx;
		color: #8a90a5;
		width: 110rpx;
	}

	.popup-detail-value {
		flex: 1;
		min-width: 0;
		font-size: 26rpx;
		color: #303640;
		word-break: break-all;
		line-height: 1.5;
	}

	.popup-play {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16rpx;
		height: 88rpx;
		margin: 0 24rpx 24rpx;
		border-radius: 46rpx;
		background: linear-gradient(135deg, #4b7aff, #6b5bff);
		box-shadow: 0 10rpx 26rpx rgba(75, 122, 255, 0.3);
		cursor: pointer;
	}

	.popup-play-circle {
		width: 40rpx;
		height: 40rpx;
		border-radius: 50%;
		background-color: rgba(255, 255, 255, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20rpx;
		color: #ffffff;
	}

	.popup-play-text {
		font-size: 30rpx;
		font-weight: 600;
		color: #ffffff;
	}
</style>
