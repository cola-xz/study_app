<template>
  <div class="svg-icon-container">
    <!-- 本地 sprite 图标 -->
    <svg
      v-if="source === 'local'"
      :class="svgClass"
      :style="svgStyle"
      aria-hidden="true"
      v-bind="$attrs"
    >
      <use :xlink:href="iconName" />
    </svg>

    <!-- 远程 SVG 文件 - 直接渲染整个 SVG -->
    <div
      v-else-if="source === 'online' && svgLoaded && svgContent"
      v-html="svgContent"
      class="svg-icon-online"
      :style="onlineSvgStyle"
    ></div>
  </div>
</template>

<script setup lang="ts">
  import { computed, Ref, ref, watch } from 'vue';
  import { useUserStore } from '@/store/modules/user';
  import envConfig from '@/env/index';
  const userStore = useUserStore();

  const props = defineProps({
    /** 图标来源，本地还是线上(local,online) */
    source: {
      type: String,
      default: 'local',
    },
    /** 图标名称，对应 sprite 中的 id */
    name: {
      type: String,
      default: '',
    },
    /** 图标颜色，支持传入具体颜色值或 'currentColor' */
    color: {
      type: String,
      default: '',
    },
    /** 图标大小，支持数字(像素)或字符串(如 '1em', '20px') */
    size: {
      type: [Number, String],
      default: 16,
    },
    /** 自定义类名 */
    className: {
      type: String,
      default: '',
    },
  });

  const svgContent = ref('');
  const svgLoaded = ref(false);

  // 图标名称，用于 <use> 标签
  const iconName: Ref<string> = ref('');

  // 动态获取并渲染 SVG
  async function loadAndRenderSvg() {
    try {
      if (!props.name) return;

      if (props.source === 'local') {
        iconName.value = `#icon-${props.name}`;
      } else if (props.source === 'online') {
        const svgUrl = `${envConfig.baseUrl}/fileView/fileUploads/uploads/icon/${encodeURIComponent(
          props.name
        )}.svg`;

        // 使用 uni.request 以文本形式获取远程 SVG 内容
        const svgText = await new Promise<string>((resolve, reject) => {
          uni.request({
            url: svgUrl,
            method: 'GET',
            header: {
              'Content-Type': 'image/svg+xml',
            },
            success: (res) => {
              if (res.statusCode === 200 && res.data) {
                resolve(res.data as string);
              } else {
                reject(new Error(`Request failed: ${res.statusCode}`));
              }
            },
            fail: (err) => reject(new Error(err.errMsg || 'Request failed')),
          });
        });

        // 解析 SVG 内容
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');

        // 检查是否有解析错误
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
          console.error('SVG parsing failed:', parserError.textContent);
          return;
        }

        const svgElement = doc.querySelector('svg');

        if (svgElement) {
          // ===== 保留颜色相关的属性，只处理尺寸 =====

          // 移除可能存在的固定尺寸和样式属性（保留颜色）
          svgElement.removeAttribute('width');
          svgElement.removeAttribute('height');

          // 只移除 style 中的尺寸相关的属性，保留颜色相关
          const svgStyle = svgElement.getAttribute('style');
          if (svgStyle) {
            const styleObj: Record<string, string> = {};
            svgStyle.split(';').forEach(rule => {
              const [key, value] = rule.split(':');
              if (key && value) {
                const trimmedKey = key.trim();
                const trimmedValue = value.trim();
                // 只移除尺寸相关的样式，保留颜色
                if (
                  ![
                    'width',
                    'height',
                    'max-width',
                    'max-height',
                    'font-size',
                  ].includes(trimmedKey.toLowerCase())
                ) {
                  styleObj[trimmedKey] = trimmedValue;
                }
              }
            });
            const newStyle = Object.entries(styleObj)
              .map(([key, value]) => `${key}:${value}`)
              .join(';');
            if (newStyle) {
              svgElement.setAttribute('style', newStyle);
            } else {
              svgElement.removeAttribute('style');
            }
          }

          // 确保外层容器能够控制尺寸，但保留视口比例
          svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          svgElement.setAttribute(
            'viewBox',
            svgElement.getAttribute('viewBox') || '0 0 100 100'
          );

          // 当传入 color 时，强制将 SVG 内部填充/描边改为 currentColor，
          // 使颜色由外层容器的 color 样式继承控制
          if (props.color) {
            const colorTargets = svgElement.querySelectorAll(
              'path, circle, rect, line, polyline, polygon, ellipse, g, use'
            );
            colorTargets.forEach((el) => {
              const fill = el.getAttribute('fill');
              const stroke = el.getAttribute('stroke');
              if (fill && fill !== 'none') {
                el.setAttribute('fill', 'currentColor');
              }
              if (stroke && stroke !== 'none') {
                el.setAttribute('stroke', 'currentColor');
              }
            });
            svgElement.setAttribute('fill', 'currentColor');
          }

          // ========================================

          // 使用整个 SVG 元素
          const serializer = new XMLSerializer();
          svgContent.value = serializer.serializeToString(svgElement);
          svgLoaded.value = true;
        }
      }
    } catch (error) {
      console.error('Failed to load SVG:', error);
      svgLoaded.value = false;
      // 可以在这里添加错误提示 UI
    }
  }

  watch(
    () => props.name,
    () => loadAndRenderSvg(),
    { immediate: true, deep: true }
  );

  // 计算 class
  const svgClass = computed(() => {
    const classes = ['svg-icon'];
    if (props.className) {
      classes.push(props.className);
    }
    return classes.join(' ');
  });

  // 计算 style（用于本地图标）
  const svgStyle = computed(() => {
    const style: Record<string, string> = {};
    style['color'] = props.color || 'currentColor';
    style['fill'] = props.color || 'currentColor';

    const sizeVal = parseFloat(props.size.toString()) || 16;
    style['width'] = typeof sizeVal === 'number' ? `${sizeVal}px` : sizeVal;
    style['height'] = typeof sizeVal === 'number' ? `${sizeVal}px` : sizeVal;
    return style;
  });

  // 为线上 SVG 容器计算样式
  const onlineSvgStyle = computed(() => {
    const style: Record<string, string> = {};

    // 应用尺寸（作用于外层 div）
    const sizeVal = parseFloat(props.size.toString()) || 16;
    const pxVal = typeof sizeVal === 'number' ? `${sizeVal}px` : sizeVal;
    style['width'] = pxVal;
    style['height'] = pxVal;

    // 如果设置颜色，只应用到需要继承的地方
    if (props.color) {
      style['color'] = props.color;
    }

    return style;
  });
</script>

<style scoped>
  :deep(.ant-upload-wrapper) {
    width: 100% !important;
    height: 200px !important;
  }

  .svg-icon-upload-container {
    width: 100%;
    height: 200px;
  }

  .svg-icon-container {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  /* 线上 SVG 容器的样式规则 */
  .svg-icon-online {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }

  /* 让 SVG 元素跟随容器尺寸 */
  .svg-icon-online :deep(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
