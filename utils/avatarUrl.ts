import envConfig from '@/env/index';

export function setAvatarUrl(getUrl: string | null): string {
  let avatarUrl: string = '';
  if (getUrl) {
    let postUrl: string = '/fileView/fileUploads';
    let keyUrl: string = envConfig.baseUrl;

    // 检查是否已经包含了完整的 base URL + postUrl
    if (getUrl.includes(`${keyUrl}${postUrl}`)) {
      // 已经包含完整前缀，直接返回
      avatarUrl = getUrl;
    } else if (getUrl.includes('/fileView/fileUploads')) {
      // 只包含 postUrl，拼接 keyUrl
      avatarUrl = `${keyUrl}${getUrl}`;
    } else {
      // 不包含任何前缀，完整拼接
      avatarUrl = `${keyUrl}${postUrl}${getUrl}`;
    }
  }
  return avatarUrl;
}
