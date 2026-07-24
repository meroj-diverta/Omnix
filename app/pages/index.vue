<template>
  <ChatWindow :messages="messages" :is-loading="isLoading" @ask="ask" />
  <ChatInput :is-loading="isLoading" @ask="ask" />
</template>

<script setup lang="ts">
const { messages, isLoading, ask } = useOracle()
</script>
