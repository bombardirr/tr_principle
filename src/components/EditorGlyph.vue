<script setup lang="ts">
defineProps<{
  name:
    | 'back'
    | 'copy'
    | 'leave-empty'
    | 'reset'
    | 'preview'
    | 'preview-off'
    | 'refresh'
    | 'save'
    | 'export'
    | 'archive'
    | 'download-docx'
    | 'download-tmx'
    | 'upload-tmx'
    | 'tm'
    | 'import'
    | 'theme'
    | 'trash'
    | 'check'
    | 'close'
}>()
</script>

<template>
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <path
      v-if="name === 'back'"
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M10 3 5 8l5 5"
    />
    <g v-else-if="name === 'copy'">
      <path stroke-linecap="round" d="M2.75 5.5v5" />
      <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 8h5.25" />
      <path stroke-linecap="round" stroke-linejoin="round" d="m9 5.5 2.75 2.5L9 10.5" />
    </g>
    <g v-else-if="name === 'leave-empty'">
      <rect x="3.25" y="4.25" width="9.5" height="7.5" rx="1.25" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M5.5 8.25 7 9.75 10.5 6"
      />
    </g>
    <g v-else-if="name === 'reset'">
      <circle cx="8" cy="8" r="5.25" />
      <path stroke-linecap="round" d="m5.75 5.75 4.5 4.5M10.25 5.75l-4.5 4.5" />
    </g>
    <g v-else-if="name === 'preview'">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M1.75 8s2.25-3.75 6.25-3.75S14.25 8 14.25 8s-2.25 3.75-6.25 3.75S1.75 8 1.75 8Z"
      />
      <circle cx="8" cy="8" r="1.75" />
    </g>
    <g v-else-if="name === 'preview-off'">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M1.75 8s2.25-3.75 6.25-3.75S14.25 8 14.25 8s-2.25 3.75-6.25 3.75S1.75 8 1.75 8Z"
      />
      <path stroke-linecap="round" d="m3.25 12.75 9.5-9.5" />
    </g>
    <g v-else-if="name === 'refresh'">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12.25 4.25V2.5H10.5"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.75 11.75V13.5h1.75"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.75 6.25A4.25 4.25 0 0 1 12 5.25M12.25 9.75A4.25 4.25 0 0 1 4 10.75"
      />
    </g>
    <g v-else-if="name === 'save'">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M8 12.25V8.75"
      />
      <path stroke-linecap="round" stroke-linejoin="round" d="M5.5 8.75 8 6.25l2.5 2.5" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.25 11.75V4.25A1.25 1.25 0 0 1 4.5 3h7A1.25 1.25 0 0 1 12.75 4.25v7.5A1.25 1.25 0 0 1 11.5 13h-7A1.25 1.25 0 0 1 3.25 11.75Z"
      />
    </g>
    <g v-else-if="name === 'export'">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M8 2.75v7.5"
      />
      <path stroke-linecap="round" stroke-linejoin="round" d="M5.5 7.75 8 10.25l2.5-2.5" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.25 11.75V12.75A1.25 1.25 0 0 0 4.5 14h7a1.25 1.25 0 0 0 1.25-1.25v-1"
      />
    </g>
    <g v-else-if="name === 'archive'">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4.25 5.25h7.5l1 2.25H3.25l1-2.25Z"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.25 7.5v4.25A1.25 1.25 0 0 0 4.5 13h7a1.25 1.25 0 0 0 1.25-1.25V7.5"
      />
      <path stroke-linecap="round" d="M6.25 9.75h3.5" />
    </g>
    <g v-else-if="name === 'download-docx'">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M5.75 2.75h3.25l2 2v5.75a1.25 1.25 0 0 1-1.25 1.25H5.75A1.25 1.25 0 0 1 4.5 9.25V4A1.25 1.25 0 0 1 5.75 2.75Z"
      />
      <path stroke-linecap="round" d="M8.75 2.75V5h2" />
      <path stroke-linecap="round" d="M6.1 6.75h3.8M6.1 8.25h2.6" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M8 11.5v2.25"
      />
      <path stroke-linecap="round" stroke-linejoin="round" d="M6.5 13 8 14.5l1.5-1.5" />
    </g>
    <g v-else-if="name === 'download-tmx'">
      <ellipse cx="8" cy="4.1" rx="3.35" ry="1.2" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4.65 4.1v2.55c0 .68 1.5 1.23 3.35 1.23s3.35-.55 3.35-1.23V4.1"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M8 9.75v2.25"
      />
      <path stroke-linecap="round" stroke-linejoin="round" d="M6.5 11.25 8 12.75l1.5-1.5" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4.25 13.75h7.5"
      />
    </g>
    <g v-else-if="name === 'upload-tmx'">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M8 3.25v2.25"
      />
      <path stroke-linecap="round" stroke-linejoin="round" d="M6.5 5.75 8 4.25l1.5 1.5" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4.25 3.25h7.5"
      />
      <ellipse cx="8" cy="10.15" rx="3.35" ry="1.2" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M4.65 10.15v2.55c0 .68 1.5 1.23 3.35 1.23s3.35-.55 3.35-1.23v-2.55"
      />
    </g>
    <g v-else-if="name === 'tm'">
      <ellipse cx="8" cy="5.25" rx="4.75" ry="1.75" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.25 5.25v5.5c0 .97 2.13 1.75 4.75 1.75s4.75-.78 4.75-1.75v-5.5"
      />
      <path stroke-linecap="round" d="M3.25 8c0 .97 2.13 1.75 4.75 1.75S12.75 8.97 12.75 8" />
    </g>
    <g v-else-if="name === 'import'">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M8 10.25V2.75"
      />
      <path stroke-linecap="round" stroke-linejoin="round" d="M5.5 7.75 8 10.25l2.5-2.5" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.25 11.75V12.75A1.25 1.25 0 0 0 4.5 14h7a1.25 1.25 0 0 0 1.25-1.25v-1"
      />
    </g>
    <g v-else-if="name === 'theme'">
      <circle cx="8" cy="8" r="5.25" />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M8 2.75v10.5"
      />
      <path
        fill="currentColor"
        stroke="none"
        d="M8 2.75a5.25 5.25 0 0 1 0 10.5V2.75Z"
      />
    </g>
    <g v-else-if="name === 'trash'">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.5 4.75h9"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M6.25 4.75V3.75A.75.75 0 0 1 7 3h2a.75.75 0 0 1 .75.75v1"
      />
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M5.25 4.75l.45 6.55A1.2 1.2 0 0 0 6.9 12.25h2.2a1.2 1.2 0 0 0 1.2-1.05l.45-6.45"
      />
      <path stroke-linecap="round" d="M6.6 7.25v3" />
      <path stroke-linecap="round" d="M9.4 7.25v3" />
    </g>
    <path
      v-else-if="name === 'check'"
      stroke-linecap="round"
      stroke-linejoin="round"
      d="m4.5 8.25 2.75 2.75L11.5 5.5"
    />
    <g v-else-if="name === 'close'">
      <path stroke-linecap="round" d="m5.25 5.25 5.5 5.5M10.75 5.25l-5.5 5.5" />
    </g>
  </svg>
</template>
