import envConfig from '@/env/index'

/**
 * 跨端 STOMP 轻量客户端
 * 基于 uni.connectSocket 实现，适配 H5 / App / 小程序。
 *
 * 背景：由于多端（尤其是小程序）没有浏览器 WebSocket/window，
 * @stomp/stompjs 无法在各端直接 import，因此这里按 STOMP 1.2 帧协议
 * 自实现核心能力，让同一套代码在 H5 / App / 小程序均可运行：
 *   CONNECT / CONNECTED / SUBSCRIBE / MESSAGE / SEND / UNSUBSCRIBE / DISCONNECT / RECEIPT
 *
 * 用法（见 pages/chat/charRoom.vue）：
 *   import { connect, subscribe, send, disconnect, isConnected } from '@/utils/stomp'
 *   connect({ url: 'ws://10.1.3.175:8080/ws', onState })
 *   subscribe('/topic/some', (frame) => { const d = JSON.parse(frame.body) })
 *   send('/app/chat', { to: 'x', content: 'hi' })
 *   disconnect()
 */

/** 连接状态 */
export enum StompState {
	CLOSED = 0,
	CONNECTING = 1,
	CONNECTED = 2
}

/** 解析后的 STOMP 帧 */
export interface StompFrame {
	command: string
	headers: Record<string, string>
	body: string
}

export interface StompConfig {
	/** ws 地址，如 ws://10.1.3.175:8080/ws 或 wss://host/ws */
	url: string
	/** STOMP 登录账号（可选，写入 CONNECT.login） */
	login?: string
	/** STOMP 密码（可选） */
	passcode?: string
	/** 附加头部，如接入层 token：{ Authorization: 'Bearer xxx' } */
	headers?: Record<string, string>
	/** 连接后心跳间隔（毫秒）。>0 时定时发送 '\n' 保活，默认不发送 */
	heartbeat?: number
	/** CONNECTED 后回调 */
	onConnect?: (frame: StompFrame) => void
	/** 状态变化回调 */
	onState?: (state: StompState) => void
	/** 错误/断线回调 */
	onError?: (err: any) => void
}

const FRAME_SEP = '\x00'

let socketTask: UniApp.SocketTask | null = null
let state: StompState = StompState.CLOSED
let config: StompConfig | null = null
let connectUrl = ''
let subSeq = 0
let beatTimer: ReturnType<typeof setInterval> | null = null

/** 订阅 id -> 回调 */
const subscriptions = new Map<string, (frame: StompFrame) => void>()

/** 接收缓冲：帧可能分多次 socket 消息到达，需累积到 \0 再按帧处理 */
let buffer = ''

function setState(s: StompState): void {
	state = s
	if (config) config.onState?.(s)
}

function log(...args: any[]): void {
	if (envConfig.debug) console.log('[stomp]', ...args)
}

function errorOut(err: any): void {
	config?.onError?.(err)
}

/** 头值编码（STOMP 转义） */
function encodeValue(v: string): string {
	return v
		.replace(/\\/g, '\\\\')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n')
		.replace(/:/g, '\\c')
}

/** 头值解码（STOMP 反转义） */
function decodeValue(v: string): string {
	return v
		.replace(/\\r/g, '\r')
		.replace(/\\n/g, '\n')
		.replace(/\\c/g, ':')
		.replace(/\\\\/g, '\\')
}

function pushText(payload: string): void {
	if (!socketTask) return
	socketTask.send({ data: payload, fail: (err) => errorOut(err) })
}

/**
 * 将一段收到的文本喂入缓冲，抽出所有以 \0 结尾的完整帧，跳过空心跳帧。
 * 返回帧正文列表（不含 \0、不含空行心跳）。
 */
function feed(raw: string): string[] {
	buffer += raw
	if (buffer.length > 4 * 1024 * 1024) {
		// 防异常溢出：丢弃，交由业务侧重连
		log('receive buffer overflow, reset')
		buffer = ''
	}
	const out: string[] = []
	while (true) {
		const idx = buffer.indexOf(FRAME_SEP)
		if (idx === -1) break
		let text = buffer.slice(0, idx)
		buffer = buffer.slice(idx + 1)
		if (text.trim() === '') continue // 空帧（服务端心跳 PING）忽略
		text = text.replace(/\r\n/g, '\n')
		out.push(text)
	}
	return out
}

/** 解析一帧完整文本（已带到 \0 前） */
function parseFrame(text: string): StompFrame {
	// command
	const nf = text.indexOf('\n')
	const command = (nf === -1 ? text : text.slice(0, nf)).trim()

	const headers: Record<string, string> = {}
	let body = ''
	if (nf !== -1) {
		let i = nf + 1
		// header 段：连续 key:value 行，直到空行
		while (i < text.length) {
			if (text[i] === '\n') {
				i++
				break // 空行，header 结束，余下即 body
			}
			const lineEnd = text.indexOf('\n', i)
			const end = lineEnd === -1 ? text.length : lineEnd
			const line = text.slice(i, end)
			const colon = line.indexOf(':')
			if (colon > 0) {
				headers[line.slice(0, colon)] = decodeValue(line.slice(colon + 1))
			}
			if (lineEnd === -1) {
				i = text.length
				break
			}
			i = end + 1
		}
		body = text.slice(i)
	}
	return { command, headers, body }
}

function dispatch(text: string): void {
	const frame = parseFrame(text)
	log('recv', frame.command, frame.headers, frame.body)
	switch (frame.command) {
		case 'CONNECTED': {
			setState(StompState.CONNECTED)
			setupHeartbeat(config?.heartbeat || 0)
			if (config?.onConnect) config.onConnect(frame)
			break
		}
		case 'MESSAGE': {
			const subId = frame.headers['subscription']
			const cb = subId ? subscriptions.get(subId) : undefined
			if (cb) cb(frame)
			else log('message for unknown sub', subId)
			break
		}
		case 'RECEIPT':
			log('receipt', frame.headers['receipt-id'])
			break
		case 'ERROR': {
			setState(StompState.CLOSED)
			errorOut(frame)
			break
		}
		default:
			break
	}
}

function onSocketMessage(res: any): void {
	let text: string
	if (typeof res.data === 'string') {
		text = res.data
	} else {
		try {
			text = bytesToText(res.data)
		} catch (e) {
			err('数组缓冲无法解码为文本', e)
			return
		}
	}
	const frames = feed(text)
	for (const f of frames) {
		if (f) dispatch(f)
	}
}

function err(...args: any[]): void {
	log(...args)
}

function bytesToText(data: any): string {
	if (typeof TextDecoder !== 'undefined') {
		return new TextDecoder().decode(data)
	}
	// 兼容兜底
	let s = ''
	const arr = new Uint8Array(data)
	for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
	return s
}

function onSocketOpen(): void {
	log('socket open, STOMP CONNECT')
	const hdrs: string[] = []
	const c = config
	if (!c) return
	// 取 host
	const authPart = connectUrl.replace(/^ws:\/\//, '').replace(/^wss:\/\//, '')
	const host = authPart.split('/')[0]
	hdrs.push(`host:${host}`)
	if (c.headers) {
		for (const k of Object.keys(c.headers)) hdrs.push(`${k}:${encodeValue(c.headers[k])}`)
	}
	if (c.login !== undefined) hdrs.push(`login:${encodeValue(c.login)}`)
	if (c.passcode !== undefined) hdrs.push(`passcode:${encodeValue(c.passcode)}`)
	if (c.heartbeat && c.heartbeat > 0) hdrs.push(`heart-beat:${Math.round(c.heartbeat / 2)},${Math.round(c.heartbeat / 2)}`)
	hdrs.push(`accept-version:1.2`)
	const frame = 'CONNECT\n' + hdrs.join('\n') + '\n\n' + FRAME_SEP
	pushText(frame)
}

function setupHeartbeat(ms: number): void {
	if (beatTimer) {
		clearInterval(beatTimer)
		beatTimer = null
	}
	if (ms > 0) {
		beatTimer = setInterval(() => {
			if (state === StompState.CONNECTED) pushText('\n')
		}, ms)
	}
}

function onSocketError(errMsg: any): void {
	log('socket error', errMsg)
	if (state === StompState.CONNECTED) setState(StompState.CLOSED)
	errorOut(errMsg)
}

function onSocketClose(): void {
	log('socket closed')
	if (beatTimer) {
		clearInterval(beatTimer)
		beatTimer = null
	}
	buffer = ''
	setState(StompState.CLOSED)
	socketTask = null
}

/** 建立 TCP+STOMP 连接（单连接；重复调用需先 disconnect） */
export function connect(cfg: StompConfig): void {
	if (state === StompState.CONNECTING || state === StompState.CONNECTED) {
		log('already connecting/connected')
		return
	}
	if (!cfg.url) {
		errorOut(new Error('stomp url 不能为空'))
		return
	}
	config = cfg
	connectUrl = cfg.url
	subscriptions.clear()
	setState(StompState.CONNECTING)

	socketTask = uni.connectSocket({
		url: connectUrl,
		fail: (err) => {
			setState(StompState.CLOSED)
			errorOut(err)
		}
	})
	socketTask.onOpen(onSocketOpen)
	socketTask.onMessage(onSocketMessage)
	socketTask.onError(onSocketError)
	socketTask.onClose(onSocketClose)
}

/** 往 destination 发送消息；body 可为对象（自动 JSON），或字符串/原生值 */
export function send(destination: string, body?: string | Record<string, unknown> | number | boolean, headers?: Record<string, string>): void {
	if (state !== StompState.CONNECTED || !socketTask) {
		errorOut(new Error('stomp 未连接，无法 send'))
		return
	}
	let text: string
	if (body === undefined || body === null) text = ''
	else if (typeof body === 'object') text = JSON.stringify(body)
	else text = String(body)
	const all = { 'content-type': 'application/json', ...(headers || {}) }
	const hdrs: string[] = [`destination:${encodeValue(destination)}`, `content-length:${textLength(text)}`]
	for (const k of Object.keys(all)) hdrs.push(`${k}:${encodeValue(all[k])}`)
	pushText('SEND\n' + hdrs.join('\n') + '\n\n' + text + FRAME_SEP)
}

/** UTF-8 字节数（content-length 按字节计） */
function textLength(s: string): number {
	if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length
	return unescape(encodeURIComponent(s)).length
}

/** 订阅 destination；返回订阅 id，可交给 unsubscribe 取消 */
export function subscribe(destination: string, cb: (frame: StompFrame) => void, headers?: Record<string, string>): string {
	if (state !== StompState.CONNECTED || !socketTask) {
		errorOut(new Error('stomp 未连接，无法 subscribe'))
		return ''
	}
	const id = 'sub-' + ++subSeq
	subscriptions.set(id, cb)
	const hdrs: string[] = [`id:${id}`, `destination:${encodeValue(destination)}`]
	for (const k of Object.keys(headers || {})) hdrs.push(`${k}:${encodeValue((headers as any)[k])}`)
	pushText('SUBSCRIBE\n' + hdrs.join('\n') + '\n\n' + FRAME_SEP)
	return id
}

/** 取消订阅 */
export function unsubscribe(id: string): void {
	subscriptions.delete(id)
	if (state === StompState.CONNECTED && socketTask) {
		pushText(`UNSUBSCRIBE\nid:${id}\n\n${FRAME_SEP}`)
	}
}

/** 主动断开（发 DISCONNECT 后关闭 socket） */
export function disconnect(): void {
	if (state === StompState.CONNECTED && socketTask) {
		try {
			pushText('DISCONNECT\nreceipt:bye\n\n' + FRAME_SEP)
		} catch (e) {
			// ignore
		}
	}
	try {
		socketTask?.close({ code: 1000 })
	} catch (e) {
		// ignore
	}
	if (beatTimer) {
		clearInterval(beatTimer)
		beatTimer = null
	}
	subscriptions.clear()
	buffer = ''
	socketTask = null
	setState(StompState.CLOSED)
}

export function getState(): StompState {
	return state
}

export function isConnected(): boolean {
	return state === StompState.CONNECTED
}
