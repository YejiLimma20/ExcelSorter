<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-left">
        <div class="app-name">Excel Analytics</div>
        <div class="app-subtitle">Large dataset explorer</div>
      </div>
      <nav class="header-nav">
        <RouterLink to="/upload" class="nav-link" active-class="nav-link-active">
          Analytics View
        </RouterLink>
      </nav>
      <div class="header-right">
        <div class="hint">
          Use shift-click on headers for multi-column sorting.
        </div>
      </div>
    </header>
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>
