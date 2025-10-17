<template>
  <div id="app">
    <div class="container">
      <div class="area left">
        <span class="number">1</span>
      </div>
      <div class="area right">
        <span class="number">2</span>
      </div>
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  width: 100%;
  height: 100vh;
}

.container {
  display: flex;
  width: 100%;
  height: 100%;
}

.area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ccc;
}

.left {
  background-color: #f0f0f0;
}

.right {
  background-color: #e8e8e8;
}

.number {
  font-size: 72px;
  font-weight: bold;
  color: #333;
}
</style>
