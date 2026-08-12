<template>
	<app-layout>
		<view class="page">
			<view class="novel-container">
				<!-- 左侧：小说列表 -->
				<view class="novel-panel">
					<view class="panel-head">
						<view class="panel-title-row">
							<view class="panel-title-dot"></view>
							<text class="panel-title">小说目录</text>
						</view>
						<text class="panel-sub">{{ bookList.length }} 部小说</text>
					</view>
					<scroll-view scroll-y class="novel-scroll" :show-scrollbar="false">
						<view v-if="listLoading && bookList.length === 0" class="list-empty">
							<text class="empty-text">加载中...</text>
						</view>
						<view v-else-if="hasError && bookList.length === 0" class="list-empty">
							<text class="empty-text">加载失败</text>
							<view class="empty-action" @click="getNovelList(true)">点击重试</view>
						</view>
						<view v-else-if="bookList.length === 0" class="list-empty">
							<text class="empty-text">暂无小说</text>
						</view>
						<view
							v-for="book in bookList"
							:key="book.id"
							class="book-item"
							:class="{ 'book-item-active': isActiveBook(book) }"
							@click="handleSelectBook(book)"
						>
							<view class="book-icon">📖</view>
							<view class="book-info">
								<text class="book-name">{{ book.fileByName }}</text>
								<view class="book-tag">{{ fileSuffixLabel(book.fileSuffix) }}</view>
							</view>
						</view>
					</scroll-view>
				</view>

				<view class="gap"></view>

				<!-- 右侧：对应小说章节列表 -->
				<view class="episode-panel">
					<view class="panel-head">
						<view class="panel-title-row">
							<view class="panel-title-dot"></view>
							<text class="panel-title">章节目录</text>
						</view>
						<text class="panel-sub">
							<text v-if="activeNovel">{{ activeNovel.fileByName }}</text>
							<text v-else>请选择左侧小说</text>
						</text>
					</view>
					<scroll-view
						scroll-y
						class="episode-scroll"
						:show-scrollbar="false"
						:scroll-into-view="chapterScrollTarget"
						scroll-with-animation
					>
						<view v-if="chapterLoading" class="list-empty">
							<text class="empty-text">加载章节中...</text>
						</view>
						<view v-else-if="!activeNovel" class="list-empty">
							<text class="empty-text">请选择左侧小说</text>
						</view>
						<view v-else-if="sourceChapterList.length === 0" class="list-empty">
							<text class="empty-text">暂无章节</text>
						</view>
						<view
							v-for="(episode, index) in sourceChapterList"
							:key="index"
							:id="`ep-${index}`"
							class="episode-item"
							:class="{ 'episode-item-active': currentEpisodeIndex === index }"
							@click="handleSelectEpisode(index, episode)"
						>
							<text class="episode-num">{{ getChapterNo(index, episode) }}</text>
							<text class="episode-title">{{ getChapterTitle(episode) }}</text>
						</view>
					</scroll-view>
				</view>
			</view>
		</view>

		<!-- 全屏阅读遮罩 -->
		<view v-if="readerVisible" class="reader-mask" @click="closeReader">
			<view class="reader" @click.stop>
				<view class="reader-header">
					<view class="reader-title">
						<text class="reader-book-name">{{ currentBookName }}</text>
						<text class="reader-episode-title">{{ currentEpisodeIndex + 1 }} - {{ currentEpisodeTitle }}</text>
					</view>
					<view class="reader-close" @click="closeReader">✕</view>
				</view>
				<scroll-view scroll-y class="reader-content" :show-scrollbar="false">
					<view v-if="readingLoading" class="reader-text-wrap">
						<text class="reader-placeholder">正文加载中...</text>
					</view>
					<view v-else class="reader-text-sec">
						<text class="reader-text">{{ novelContent }}</text>
					</view>
				</scroll-view>
			</view>
		</view>
	</app-layout>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { getAllFilesByFileType, getChapterInfo, getUserNovel } from '@/api/novel'
import { getFile } from '@/api/system'

interface Book {
	id: string | number
	filetypeId: string | number
	fileName: string
	fileSuffix: string
	fileByName: string
	[key: string]: any
}

const fileType = ref('novel')
const filePath = ref('')

// 左侧小说列表
const bookList = ref<Book[]>([])
const activeNovel = ref<Book | null>(null)
const currentBookId = ref<string>('')
const listLoading = ref(false)
const hasError = ref(false)

// 右侧章节列表
const sourceChapterList = ref<string[]>([])
const chapterLoading = ref(false)
const currentEpisodeIndex = ref<number>(0)
const chapterScrollTarget = ref('')

// 阅读状态
const currentEpisodeTitle = ref<string>('')
const readerVisible = ref(false)
const isNewRecord = ref(true)
const encoding = ref('')
const novelContent = ref<string>('')
const readingLoading = ref(false)

const currentBookName = computed<string>(() => {
	const book = bookList.value.find((b) => b.fileName === currentBookId.value)
	return book ? book.fileByName : ''
})

function isActiveBook(book: Book): boolean {
	return currentBookId.value === book.fileName
}

function fileSuffixLabel(suffix: string): string {
	if (!suffix) return '文件'
	return suffix.replace(/^\./, '').toUpperCase()
}

/**
 * 拆分章节字符串(如"第1章 章节标题")为章节序号和章节标题
 * 返回 { no, title }
 */
function splitChapter(raw: string): { no: string; title: string } {
	const text = (raw || '').trim()
	const sep = text.search(/\s+/)
	if (sep === -1) {
		// 无空格：整串作为标题或序号
		return /^\s*第?\s*\d*\s*章/i.test(text) ? { no: text, title: '' } : { no: '', title: text }
	}
	return {
		no: text.slice(0, sep).trim(),
		title: text.slice(sep).trim()
	}
}

function getChapterNo(index: number, raw: string): string {
	const { no } = splitChapter(raw)
	return no || `第 ${index + 1} 章`
}

function getChapterTitle(raw: string): string {
	return splitChapter(raw).title
}

/**
 * 获取小说文件列表
 */
async function getNovelList(onMount: boolean = true) {
	listLoading.value = true
	hasError.value = false
	try {
		const res: any = await getAllFilesByFileType({
			fileType: fileType.value
		})
		if (res.code === 200 && res.data?.fileList?.length > 0) {
			bookList.value = res.data.fileList
			filePath.value = res.data.filePath || ''
		} else {
			bookList.value = []
		}
	} catch (error) {
		console.error('获取小说列表失败:', error)
		hasError.value = true
		bookList.value = []
	} finally {
		// 左侧列表加载结束即结束 loading，不等待右侧章节加载
		listLoading.value = false
	}

	// 默认选中第一个（异步触发章节加载，不阻塞左侧列表 loading）
	if (onMount && bookList.value.length > 0) {
		await handleSelectBook(bookList.value[0])
	}
}

/**
 * 选择小说：加载阅读进度 + 章节目录
 */
async function handleSelectBook(item: Book) {
	if (!item || !item.fileName) return

	activeNovel.value = item
	currentBookId.value = item.fileName
	sourceChapterList.value = []
	currentEpisodeIndex.value = 0
	chapterScrollTarget.value = ''
	readerVisible.value = false

	try {
		await loadChapterMetadata()
		await loadReadingProgress()
	} catch (error) {
		console.error('选择小说失败:', error)
	}
}

/**
 * 加载章节元数据（章节标题列表）
 */
async function loadChapterMetadata() {
	if (!activeNovel.value) return
	chapterLoading.value = true
	try {
		const item = activeNovel.value
		const fullPath = `${filePath.value}/${item.fileName}${item.fileSuffix}`

		const res: any = await getChapterInfo({ filePath: fullPath })

		if (res.code === 200 && res.data?.chapters) {
			sourceChapterList.value = res.data.chapters
			encoding.value = res.data.encoding || ''
		} else {
			sourceChapterList.value = []
		}
	} finally {
		chapterLoading.value = false
	}
}

/**
 * 加载用户阅读进度，定位到上次阅读章节
 */
async function loadReadingProgress() {
	if (!activeNovel.value) return
	try {
		const item = activeNovel.value
		const novelRes: any = await getUserNovel({ novel_id: item.fileName })

		let targetIndex = 0
		isNewRecord.value = true

		if (novelRes.code === 200 && novelRes.data && novelRes.data.length > 0) {
			isNewRecord.value = false
			// 后端返回的 chapterNumber 可能是 1-based，转换为 0-based 索引
			const savedChapterNum = novelRes.data[0].chapterNumber
			targetIndex = Math.max(Number(savedChapterNum) - 1 || 0, 0)
		}

		currentEpisodeIndex.value = targetIndex
		const raw = sourceChapterList.value[targetIndex] ?? ''
		currentEpisodeTitle.value = getChapterTitle(raw) || getChapterNo(targetIndex, raw)

		// 等待节点渲染后，自动滚动到当前阅读章节
		nextTick(() => {
			chapterScrollTarget.value = `ep-${targetIndex}`
		})
	} catch (error) {
		console.error('获取阅读进度失败:', error)
	}
}

function handleSelectEpisode(index: number, title: string) {
	currentEpisodeIndex.value = index
	currentEpisodeTitle.value =
		getChapterTitle(title) || getChapterNo(index, title)
	readerVisible.value = true
	novelContent.value = ''
	readingLoading.value = true
	getNovelDetail(index)
}

function closeReader() {
	readerVisible.value = false
}

/**
   * 获取小说正文内容
   */
  async function getNovelDetail(chapterNumber: number) {
    if (!activeNovel.value || !filePath.value) {
      readingLoading.value = false
      return
    }

    try {
      const res: any = await getFile({
        filePath: filePath.value,
        fileName: `${activeNovel.value.fileName}${activeNovel.value.fileSuffix}`,
        postType: 'chapterView',
        chapterNumber: chapterNumber,
      });

      if (res instanceof Blob) {
        const reader = new FileReader();
        reader.onload = e => {
          // 尝试 GBK，如果乱码可能需要根据文件实际编码调整，或者后端统一返回 UTF-8
          const text = (e.target?.result as string) || ''
          novelContent.value = formatContent(text)
          readingLoading.value = false
        };
        reader.onerror = () => {
          novelContent.value = '加载章节内容失败，请稍后重试。'
          readingLoading.value = false
        };
        reader.readAsText(res, encoding.value);
      } else {
        novelContent.value = '加载章节内容失败，请稍后重试。'
        readingLoading.value = false
      }
    } catch (error) {
      console.error('获取章节内容失败:', error);
      novelContent.value = '加载章节内容失败，请稍后重试。'
      readingLoading.value = false
    }
  }

  /**
   * 格式化章节正文，去掉空行并转为段落
   */
  function formatContent(raw: string): string {
    if (!raw) return ''
    // 去掉首尾空白
    let text = (raw || '').replace(/^\s+|\s+$/g, '')
    return text
  }

onMounted(() => {
	getNovelList()
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

	.novel-container {
		display: flex;
		width: 100%;
		height: 100%;
		padding: 20rpx;
		box-sizing: border-box;
		background: #f3f5fb;
	}

	/* 左侧小说面板 */
	.novel-panel {
		flex: 1;
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

	.novel-scroll {
		flex: 1;
		height: 0;
		padding: 8rpx 4rpx;
		box-sizing: border-box;
	}

	.book-item {
		display: flex;
		align-items: center;
		gap: 16rpx;
		margin: 6rpx 12rpx;
		padding: 18rpx 20rpx;
		border-radius: 16rpx;
		box-sizing: border-box;
		transition: background-color 0.2s;
		cursor: pointer;
	}

	.book-item:active {
		background-color: #f0f2f8;
	}

	.book-item-active {
		background-color: #edf3ff;
	}

	.book-icon {
		font-size: 36rpx;
		flex-shrink: 0;
	}

	.book-info {
		flex: 1;
		min-width: 0;
	}

	.book-name {
		display: block;
		font-size: 30rpx;
		font-weight: 600;
		color: #333333;
		line-height: 1.4;
		word-break: break-all;
	}

	.book-item-active .book-name {
		color: #2f6bff;
	}

	.book-tag {
		display: inline-block;
		margin-top: 8rpx;
		font-size: 20rpx;
		color: #4b7aff;
		background-color: #edf3ff;
		padding: 2rpx 14rpx;
		border-radius: 18rpx;
	}

	.gap {
		width: 20rpx;
		flex-shrink: 0;
	}

	/* 右侧章节面板 */
	.episode-panel {
		flex: 1;
		height: 100%;
		display: flex;
		flex-direction: column;
		background-color: #ffffff;
		border-radius: 24rpx;
		box-shadow: 0 6rpx 24rpx rgba(31, 58, 147, 0.06);
		overflow: hidden;
	}

	.episode-scroll {
		flex: 1;
		height: 0;
		padding: 8rpx 4rpx;
		box-sizing: border-box;
	}

	.episode-item {
		margin: 6rpx 12rpx;
		padding: 20rpx 24rpx;
		border-radius: 16rpx;
		box-sizing: border-box;
		transition: background-color 0.2s;
		cursor: pointer;
	}

	.episode-item:active {
		background-color: #f0f2f8;
	}

	.episode-item-active {
		background-color: #edf3ff;
	}

	.episode-num {
		display: block;
		font-size: 28rpx;
		font-weight: 600;
		color: #4b7aff;
		line-height: 1.4;
	}

	.episode-title {
		display: block;
		font-size: 26rpx;
		color: #666666;
		line-height: 1.5;
		margin-top: 6rpx;
		word-break: break-all;
	}

	.episode-item-active .episode-title {
		color: #2f6bff;
		font-weight: 500;
	}

	/* 空/加载状态 */
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

	/* 全屏阅读 */
	.reader-mask {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 999;
		background-color: #f7f4ec;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.reader {
		width: 100%;
		height: 100%;
		background-color: #f7f4ec;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.reader-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 30rpx;
		padding-top: calc(30rpx + var(--status-bar-height, 0px));
		border-bottom: 1rpx solid #e8e2d4;
	}

	.reader-title {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.reader-book-name {
		font-size: 26rpx;
		color: #999999;
	}

	.reader-episode-title {
		font-size: 34rpx;
		font-weight: bold;
		color: #333333;
		margin-top: 6rpx;
	}

	.reader-close {
		font-size: 40rpx;
		color: #999999;
		padding: 10rpx;
		line-height: 1;
	}

	.reader-content {
		flex: 1;
		height: calc(100% - 120rpx);
		padding: 30rpx;
		box-sizing: border-box;
	}

	.reader-text-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100%;
	}

	.reader-text-sec {
		min-height: 100%;
		display: flex;
		flex-direction: column;
	}

	.reader-text {
		font-size: 32rpx;
		color: #333333;
		line-height: 1.8;
		text-align: justify;
		white-space: pre-wrap;
		word-break: break-all;
	}

	.reader-placeholder {
		font-size: 30rpx;
		color: #bbbbbb;
	}
</style>
