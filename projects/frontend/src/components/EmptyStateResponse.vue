<script lang="ts" setup>
import { useI18n } from '@/i18n'

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col items-center justify-center h-full gap-3 select-none">
    <!-- terminal-window icon (Phosphor) -->
    <svg
      class="text-text-primary opacity-20"
      width="64"
      height="64"
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M128 128a8 8 0 0 1-3 6.25l-40 32a8 8 0 0 1-10-12.5L107.19 128 75 102.25a8 8 0 1 1 10-12.5l40 32A8 8 0 0 1 128 128Zm48 24h-40a8 8 0 0 0 0 16h40a8 8 0 0 0 0-16Zm56-112v176a16 16 0 0 1-16 16H40a16 16 0 0 1-16-16V40A16 16 0 0 1 40 24h176a16 16 0 0 1 16 16Zm-16 176V40H40v176Z"
        fill="currentColor"
      />
    </svg>
    <h2 class="heading-md text-text-secondary m-0">{{ t('emptyState.sendToSeeResponse') }}</h2>
  </div>
</template>
