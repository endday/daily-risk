<script setup lang="ts">
import { ref } from 'vue'
import { usePwaInstall } from '../composables/usePwaInstall'

const { canInstall, isIosSafari, requestInstall } = usePwaInstall()
const showGuide = ref(false)

async function install() {
  const result = await requestInstall()
  if (result === 'manual') showGuide.value = true
}
</script>

<template>
  <button
    v-if="canInstall"
    class="install-button"
    type="button"
    title="安装到桌面"
    aria-label="安装投资黄历到桌面"
    @click="install"
  >
    <van-icon name="desktop-o" aria-hidden="true" />
    <span>安装</span>
  </button>

  <Teleport to="body">
    <Transition name="install-sheet">
      <div v-if="showGuide" class="install-overlay" role="presentation" @click.self="showGuide = false">
        <section class="install-guide" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
          <header class="install-guide__header">
            <div>
              <span class="install-guide__kicker">添加到主屏幕</span>
              <h2 id="install-guide-title">安装投资黄历</h2>
            </div>
            <button type="button" aria-label="关闭安装说明" title="关闭" @click="showGuide = false">
              <van-icon name="cross" aria-hidden="true" />
            </button>
          </header>

          <ol v-if="isIosSafari" class="install-steps">
            <li><strong>1</strong><span>点击 Safari 底部的“分享”按钮</span><van-icon name="share-o" aria-hidden="true" /></li>
            <li><strong>2</strong><span>向下滑动并选择“添加到主屏幕”</span><van-icon name="plus" aria-hidden="true" /></li>
            <li><strong>3</strong><span>点击右上角“添加”完成安装</span><van-icon name="success" aria-hidden="true" /></li>
          </ol>
          <p v-else class="install-browser-note">
            iPhone 和 iPad 需要使用 Safari 安装。请在 Safari 中打开当前网址，再通过“分享”选择“添加到主屏幕”。
          </p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/theme' as *;

.install-button {
  position: absolute;
  right: 0;
  display: inline-flex;
  align-items: center;
  gap: $space-xs;
  min-height: 32px;
  padding: 0 $space-sm;
  border: 1px solid $border-heavy;
  border-radius: $radius-sm;
  background: $bg-page;
  color: $text-primary;
  font: inherit;
  font-size: $text-xs;
  font-weight: $weight-semibold;
  cursor: pointer;

  &:active {
    background: $text-primary;
    color: $text-inverse;
  }
}

.install-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.46);
  overscroll-behavior: contain;
  touch-action: none;
}

.install-guide {
  width: min(100%, 600px);
  padding: $space-xl $space-lg calc($space-xl + env(safe-area-inset-bottom));
  border-top: $rule-heavy;
  background: $bg-page;
  color: $text-primary;
  touch-action: auto;
}

.install-guide__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: $space-lg;
  border-bottom: $rule-thin;

  h2 {
    margin-top: $space-xs;
    font-family: $font-serif;
    font-size: $text-xl;
    letter-spacing: 0;
  }

  button {
    width: 36px;
    height: 36px;
    border: 0;
    background: transparent;
    color: $text-primary;
    font-size: $text-lg;
    cursor: pointer;
  }
}

.install-guide__kicker {
  color: $text-secondary;
  font-size: $text-xs;
}

.install-steps {
  list-style: none;

  li {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) 24px;
    align-items: center;
    gap: $space-sm;
    min-height: 58px;
    border-bottom: $rule-thin;
    font-size: $text-md;
  }

  strong {
    font-family: $font-serif;
    font-size: $text-lg;
  }

  .van-icon {
    color: $text-secondary;
    font-size: $text-lg;
    text-align: center;
  }
}

.install-browser-note {
  padding: $space-xl 0 $space-sm;
  color: $text-secondary;
  font-size: $text-md;
  line-height: $leading-relaxed;
}

.install-sheet-enter-active,
.install-sheet-leave-active {
  transition: opacity $duration-normal $ease-out;

  .install-guide {
    transition: transform $duration-normal $ease-out;
  }
}

.install-sheet-enter-from,
.install-sheet-leave-to {
  opacity: 0;

  .install-guide {
    transform: translateY(100%);
  }
}
</style>
