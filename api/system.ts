import envConfig from '@/env/index'
import { getToken } from '@/utils/request'

/**
 * 下载文件资源（头像、小说文件等），返回 ArrayBuffer 字节。
 * 通用 request 只处理 JSON，这里直接用 uni.request 以 arraybuffer
 * 方式获取文件字节。返回 ArrayBuffer（浏览器、App、小程序均一致），
 * 不再依赖 Blob/FileReader（App 原生环境不支持 Blob）。
 */
export function getFile(params: any): Promise<ArrayBuffer> {
  const { fileUrl, postType, filePath, fileName, ...otherParams } = params
  const suffixApi: string = envConfig.baseUrl
  let url: string = ''
  if (fileUrl) {
    url = `${suffixApi}/${postType ? postType : 'fileView'}/fileUploads${fileUrl}`
  } else {
    url = `${suffixApi}/${postType ? postType : 'fileView'}/fileUploads${filePath}/${fileName}`
  }

  const token = getToken()

  // 拼接查询参数（含可选的时间戳，防止 CDN/中间代理缓存）
  // const query = { ...otherParams, _t: new Date().getTime() }
  const query = { ...otherParams }
  const queryStr = Object.keys(query)
    .filter((k) => query[k] !== undefined && query[k] !== null)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&')
  if (queryStr) {
    url = `${url}${url.includes('?') ? '&' : '?'}${queryStr}`
  }

  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: 'GET',
      responseType: 'arraybuffer',
      header: {
        'appId': envConfig.appId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // 注意：不要设置 Cache-Control / Pragma / Expires 等非简单请求头，
        // 否则 H5 端会触发 CORS 预检（OPTIONS）请求，若后端 Access-Control-Allow-Headers
        // 未包含这些头，浏览器会直接拦截，导致接口"请求未通过"。
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          resolve(res.data as ArrayBuffer)
        } else {
          reject({ code: res.statusCode, data: null, message: `文件下载失败（${res.statusCode}）` })
        }
      },
      fail: (err) => {
        reject({ code: -1, data: null, message: err.errMsg || '文件下载失败' })
      }
    })
  })
}
