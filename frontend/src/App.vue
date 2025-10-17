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
/* Reset styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* App container */
#app {
  width: 100%;
  height: 100vh;
}

/* Main container */
.container {
  display: flex;
  width: 100%;
  height: 100%;
}

/* Area base styles */
.area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ccc;
}

/* Left area */
.left {
  background-color: #f0f0f0;
}

/* Right area */
.right {
  background-color: #e8e8e8;
}

/* Number styling */
.number {
  font-size: 72px;
  font-weight: bold;
  color: #333;
}
</style>
