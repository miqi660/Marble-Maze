import router from '@system.router'

/** 返回已有目标页；外部直接打开页面时补建目标，避免退到错误页面。 */
export function returnToPage(path) {
  const pages = router.getPages()
  const name = path.replace(/^\//, '')
  const exists = pages.some((page) => page.path === path || page.path === name || page.name === name)
  if (exists) router.back({ path })
  else router.replace({ uri: path })
}
