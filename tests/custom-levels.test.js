const assert = require('assert')
const fs = require('fs')
const vm = require('vm')
const CustomLevels = require('../src/common/custom-levels.js')
const MazeValidate = require('../src/common/maze-validate.js')
const OFFICIAL = require('../src/common/official-levels.json')

function load(path, globals) {
  let code = fs.readFileSync(path, 'utf8')
  if (path.endsWith('.ux')) code = code.match(/<script>([\s\S]*?)<\/script>/)[1]
  code = code.replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
  const scope = Object.assign({ module: { exports: {} }, CustomLevels, MazeValidate, OFFICIAL,
    DIFFICULTY_LABEL: {}, console, Promise, setTimeout, clearTimeout }, globals)
  vm.runInNewContext(code, scope)
  return scope.module.exports
}

function makeLevel(source, name) {
  const level = Object.assign({}, MazeValidate.stripCrc(source), { name })
  return Object.assign({}, level, { crc: MazeValidate.computeCrc(level) })
}

function makeDiskStorage(disk, options) {
  const settings = options || {}
  function run(fn) {
    if (settings.async) setTimeout(fn, 1)
    else fn()
  }
  return {
    get(o) {
      run(() => o.success(Object.prototype.hasOwnProperty.call(disk, o.key) ? disk[o.key] : ''))
    },
    set(o) {
      run(() => {
        if (settings.failKey === o.key) { o.fail('write failed', 1); return }
        disk[o.key] = o.value
        o.success()
      })
    },
    delete(o) {
      run(() => {
        if (settings.failDeleteKey === o.key) { o.fail('delete failed', 1); return }
        delete disk[o.key]
        o.success()
      })
    }
  }
}

function makeStore(storage) {
  const SlotStore = load('src/common/slot-store.js', { storage })
  return new SlotStore()
}

async function migrationTests() {
  const disk = {}
  for (let index = 0; index < CustomLevels.MAX_CUSTOM_LEVELS; index++) {
    const letter = String.fromCharCode(97 + index)
    disk['custom_' + letter] = JSON.stringify(MazeValidate.stripCrc(makeLevel(OFFICIAL[index % 6], '旧关卡 ' + (index + 1))))
  }
  const store = makeStore(makeDiskStorage(disk))
  assert.strictEqual(await store.init(), true)
  assert.strictEqual(store.count(), 12)
  assert.strictEqual(store.get(0).name, '旧关卡 1')
  assert.strictEqual(store.get(11).name, '旧关卡 12')
  assert.strictEqual(disk.custom_storage_version, '2')
  for (let index = 0; index < 12; index++) {
    const key = CustomLevels.storageKey(index)
    assert.strictEqual(JSON.parse(disk[key]).name, '旧关卡 ' + (index + 1), key + ' 顺序保持')
    assert.strictEqual(disk['custom_' + String.fromCharCode(97 + index)], undefined, '迁移后删除旧键')
  }

  const sparseDisk = {
    custom_a: JSON.stringify(MazeValidate.stripCrc(makeLevel(OFFICIAL[0], 'A'))),
    custom_b: '{invalid',
    custom_c: JSON.stringify(MazeValidate.stripCrc(makeLevel(OFFICIAL[1], 'C'))),
    custom_d: JSON.stringify({ v: 9 })
  }
  const sparseStore = makeStore(makeDiskStorage(sparseDisk))
  assert.strictEqual(await sparseStore.init(), true)
  assert.strictEqual(sparseStore.count(), 2)
  assert.strictEqual(sparseStore.get(0).name, 'A')
  assert.strictEqual(sparseStore.get(1).name, 'C')
  assert.strictEqual(sparseDisk.custom_03, undefined)

  const failedDisk = {
    custom_a: JSON.stringify(MazeValidate.stripCrc(makeLevel(OFFICIAL[0], '保留旧数据')))
  }
  const failedStorage = makeDiskStorage(failedDisk, { failKey: 'custom_01' })
  const failedStore = makeStore(failedStorage)
  assert.strictEqual(await failedStore.init(), false)
  assert.ok(failedDisk.custom_a, '新键写入失败时旧数据必须保留')
  assert.strictEqual(failedDisk.custom_storage_version, undefined)
  failedStorage.set = makeDiskStorage(failedDisk).set
  const retryStore = makeStore(failedStorage)
  assert.strictEqual(await retryStore.init(), true, '旧数据可在下一次启动安全重试迁移')
  assert.strictEqual(retryStore.get(0).name, '保留旧数据')

  const failedDeleteDisk = {
    custom_a: JSON.stringify(MazeValidate.stripCrc(makeLevel(OFFICIAL[0], '恢复 A'))),
    custom_b: JSON.stringify(MazeValidate.stripCrc(makeLevel(OFFICIAL[1], '保留 B')))
  }
  const failedDeleteStore = makeStore(makeDiskStorage(failedDeleteDisk, { failDeleteKey: 'custom_b' }))
  assert.strictEqual(await failedDeleteStore.init(), false)
  assert.strictEqual(JSON.parse(failedDeleteDisk.custom_a).name, '恢复 A', '旧键清理失败时恢复先前已删的旧记录')
  assert.strictEqual(JSON.parse(failedDeleteDisk.custom_b).name, '保留 B')
  assert.strictEqual(failedDeleteDisk.custom_storage_version, undefined)
}

async function storeAndProtocolTests() {
  const disk = { custom_storage_version: '2' }
  const store = makeStore(makeDiskStorage(disk, { async: true }))
  assert.strictEqual(await store.init(), true)

  const queued = await Promise.all([
    store.append(MazeValidate.stripCrc(makeLevel(OFFICIAL[0], 'A'))),
    store.append(MazeValidate.stripCrc(makeLevel(OFFICIAL[1], 'B'))),
    store.replace(0, MazeValidate.stripCrc(makeLevel(OFFICIAL[2], 'X'))),
    store.remove(0)
  ])
  assert.ok(queued.every((result) => result.ok))
  assert.strictEqual(store.count(), 1)
  assert.strictEqual(store.get(0).name, 'B', '串行 append/replace/remove 后 entries 与 storage 对齐')
  assert.strictEqual(JSON.parse(disk.custom_01).name, 'B')
  assert.strictEqual(disk.custom_02, undefined)

  const sent = []
  const MazeSync = load('src/common/maze-sync.js', { interconnModule: class {} })
  MazeSync.store = store
  const sync = new MazeSync({ send(message) { sent.push(Object.assign({ tag: 'maze' }, message)); return Promise.resolve() }, addListener() {} })
  for (let index = 1; index < 12; index++) {
    const result = await sync.handleAdd({ level: makeLevel(OFFICIAL[index % 6], '关卡 ' + (index + 1)) })
    assert.strictEqual(result.ok, true)
    assert.strictEqual(result.index, index)
  }
  assert.strictEqual(store.count(), 12)
  const full = await sync.handleAdd({ level: makeLevel(OFFICIAL[0], '第 13 关') })
  assert.strictEqual(full.ok, false)
  assert.strictEqual(full.message, 'custom levels full')
  assert.strictEqual(sent[sent.length - 1].message, 'custom levels full')
  assert.strictEqual(sent[sent.length - 1].stat, 'add')

  const replacement = await sync.handleReplace({ index: 2, level: makeLevel(OFFICIAL[5], '替换关卡') })
  assert.strictEqual(replacement.ok, true)
  assert.strictEqual(store.get(2).name, '替换关卡')
  const removed = await sync.handleRemove({ index: 1 })
  assert.strictEqual(removed.ok, true)
  assert.strictEqual(store.count(), 11)
  assert.strictEqual(store.get(1).name, '替换关卡', '删除中间关卡后后续编号前移')
  assert.strictEqual(JSON.parse(disk.custom_02).name, '替换关卡')
  assert.strictEqual(disk.custom_12, undefined)

  const listed = await sync.handleList()
  assert.strictEqual(listed.levels.length, 11)
  assert.deepStrictEqual(JSON.parse(JSON.stringify(listed.levels.map((level) => level.index))), Array.from({ length: 11 }, (_, i) => i))
  assert.strictEqual(sent[sent.length - 1].tag, 'maze')
  assert.strictEqual(sent[sent.length - 1].type, 'list')
  assert.strictEqual(sent[sent.length - 1].levels[1].name, '替换关卡')

  const invalid = await sync.handleRemove({ index: 11 })
  assert.strictEqual(invalid.ok, false)
  assert.strictEqual(invalid.message, 'bad index')
  assert.strictEqual(store.count(), 11)
  sync.destroy()
}

function makeLevelsPage(count, routerCalls, globals) {
  const levels = Array.from({ length: count }, (_, index) => Object.assign({}, MazeValidate.stripCrc(OFFICIAL[index % 6]), { name: '自定义 ' + (index + 1) }))
  const store = { list: () => levels, ready: Promise.resolve(true), subscribe: () => () => {} }
  const definition = load('src/pages/levels/levels.ux', Object.assign({
    router: { push(route) { routerCalls.push(route) } },
    returnToPage(path) { routerCalls.push({ path }) }
  }, globals))
  const page = Object.assign({}, definition, JSON.parse(JSON.stringify(definition.private)), {
    $app: { $def: { slotStore: store, progress: 0, progressReady: Promise.resolve(), feedback() {} } }
  })
  page.onInit()
  return { page, levels }
}

function viewModelTests() {
  const boundaries = [0, 1, 5, 6, 7, 8, 11, 12]
  for (const count of boundaries) {
    const { page } = makeLevelsPage(count, [])
    assert.strictEqual(page.customCount, count)
    assert.strictEqual(page.customCards.filter((card) => card.type === 'level').length, count)
    assert.strictEqual(page.customCards.filter((card) => card.type === 'add').length, count < 12 ? 1 : 0)
    assert.strictEqual(page.hasSecondCustomPage, count >= 6)
    assert.strictEqual(page.pageDots.length, count >= 6 ? 3 : 2)
    assert.ok(page.customCards.every((card) => card.type === 'level' || card.type === 'add'))
    assert.ok(page.customCards.every((card) => typeof card.index === 'number' && card.page >= 1))
    const levelCards = page.customCards.filter((card) => card.type === 'level')
    levelCards.forEach((card, index) => assert.strictEqual(card.no, index + 1 < 10 ? '0' + (index + 1) : String(index + 1)))
    assert.strictEqual(page.pageDots[0].active, true)
    if (count === 0) assert.strictEqual(page.customCards[0].type, 'add')
    if (count === 1) {
      assert.strictEqual(page.customCards[0].no, '01')
      assert.strictEqual(page.customCards[1].index, 1)
    }
    if (count === 5) assert.strictEqual(page.customCards[5].type, 'add')
    if (count === 6) {
      const secondPage = page.customCards.filter((card) => card.page === 2)
      assert.strictEqual(secondPage.length, 1)
      assert.strictEqual(secondPage[0].type, 'add')
      assert.strictEqual(secondPage[0].left, 18)
      assert.strictEqual(secondPage[0].top, 148)
    }
    if (count === 7) {
      assert.strictEqual(page.customCards.filter((card) => card.page === 1).length, 6)
      assert.deepStrictEqual(JSON.parse(JSON.stringify(page.customCards.filter((card) => card.page === 2).map((card) => card.type))), ['level', 'add'])
      assert.strictEqual(page.customCards.find((card) => card.page === 2 && card.type === 'level').no, '07')
    }
    if (count === 8) assert.strictEqual(page.customCards.filter((card) => card.page === 2 && card.type === 'level').length, 2)
    if (count === 11) {
      assert.strictEqual(page.customCards.filter((card) => card.page === 2 && card.type === 'level').length, 5)
      assert.strictEqual(page.customCards.filter((card) => card.page === 2 && card.type === 'add').length, 1)
    }
    if (count === 12) assert.strictEqual(page.customCards.some((card) => card.type === 'add'), false)
    page.pageIndex = 1
    page.refreshCustomLevels()
    assert.strictEqual(page.pageDots[1].active, true)
  }

  const calls = []
  const { page, levels } = makeLevelsPage(7, calls)
  page.pageIndex = 2
  page.refreshCustomLevels()
  assert.strictEqual(page.pageDots[2].active, true)
  levels.pop()
  page.refreshCustomLevels()
  assert.strictEqual(page.pageIndex, 2, '7→6 时保留第二页加号占位')
  assert.strictEqual(page.pageDots.length, 3)
  levels.pop()
  page.refreshCustomLevels()
  assert.strictEqual(page.pageIndex, 1, '6→5 时第二页消失并回到第一页')
  assert.strictEqual(page.pageDots.length, 2)

  const { page: fullPage } = makeLevelsPage(12, calls)
  for (const index of [0, 5, 6, 11]) {
    fullPage.leaving = false
    fullPage.playCustom(index)
  }
  assert.deepStrictEqual(calls.map((route) => route.params.index), ['0', '5', '6', '11'])
  assert.ok(calls.every((route) => route.params.pack === 'custom'))
}

function slideTests() {
  const timers = new Map()
  let timerId = 0
  const calls = []
  const { page, levels } = makeLevelsPage(6, calls, {
    setTimeout(callback, delay) {
      assert.strictEqual(delay, 220)
      timers.set(++timerId, callback)
      return timerId
    },
    clearTimeout(id) { timers.delete(id) }
  })
  page.switchPage(1)
  assert.strictEqual(page.slideClass, 'slide-from-right')
  assert.strictEqual(page.pageDots[1].active, true)
  page.switchPage(2)
  page.playCustom(0)
  page.playOfficial(0)
  page.onBackPress()
  assert.strictEqual(page.pageIndex, 1, '动画期间不重复翻页')
  assert.strictEqual(calls.length, 0, '动画期间不误触关卡')
  timers.get(timerId)()
  assert.strictEqual(page.slideClass, '')
  assert.strictEqual(timers.size, 0)
  page.switchPage(2)
  assert.strictEqual(page.pageDots[2].active, true)
  timers.get(timerId)()
  page.onBackPress()
  assert.strictEqual(page.slideClass, 'slide-from-left')
  assert.strictEqual(page.pageIndex, 1)
  page.onHide()
  assert.strictEqual(timers.size, 0, '页面隐藏清理动画计时器')
  assert.strictEqual(page.slideClass, '')
  page.switchPage(2)
  levels.pop()
  page.refreshCustomLevels()
  assert.strictEqual(page.pageIndex, 1)
  assert.strictEqual(page.pageDots[1].active, true)
  assert.strictEqual(page.slideClass, '')
  assert.strictEqual(timers.size, 0, '同步删除关卡时终止过期动画')
  page.switchPage(2)
  assert.strictEqual(timers.size, 0, '不能滑入不存在的页面')
}

async function gameAndCompleteTests() {
  const loaded = []
  const store = {
    ready: Promise.resolve(true),
    getLevel(index) { return index >= 0 && index < 12 ? { name: '第 ' + (index + 1) + ' 关' } : null }
  }
  const gameDefinition = load('src/pages/game/game.ux', { returnToPage(path) { loaded.push(path) } })
  for (const index of [0, 5, 6, 11]) {
    const game = Object.assign({}, gameDefinition, { pack: 'custom', index: String(index), $app: { $def: { slotStore: store } }, setupLevel(level) { this.levelLoaded = level } })
    game.onInit()
    await Promise.resolve()
    assert.strictEqual(game.index, index)
    assert.strictEqual(game.levelLoaded.name, '第 ' + (index + 1) + ' 关')
    if (index === 0) game.onBackPress()
  }
  assert.ok(loaded.includes('/pages/levels'), 'game 返回现有 levels 页面')
  const missing = Object.assign({}, gameDefinition, { pack: 'custom', index: '11', $app: { $def: { slotStore: { ready: Promise.resolve(true), getLevel() { return null } } } } })
  missing.onInit()
  await Promise.resolve()
  assert.strictEqual(loaded[0], '/pages/levels', '不存在的自定义关卡安全返回')

  const completeDefinition = load('src/pages/complete/complete.ux', { returnToPage(path) { loaded.push(path) } })
  for (const index of [0, 5, 6, 11]) {
    const complete = Object.assign({}, completeDefinition, { pack: 'custom', index: String(index) })
    complete.onInit()
    const expected = index + 1 < 10 ? 'CUSTOM 0' + (index + 1) : 'CUSTOM ' + (index + 1)
    assert.strictEqual(complete.levelName, expected)
    assert.strictEqual(complete.hasNext, false)
    if (index === 11) complete.onBack()
  }
  assert.ok(loaded.filter((path) => path === '/pages/levels').length >= 2, 'complete 返回现有 levels 页面')
}

async function run() {
  assert.strictEqual(CustomLevels.MAX_CUSTOM_LEVELS, 12)
  assert.strictEqual(CustomLevels.CUSTOM_PAGE_SIZE, 6)
  assert.strictEqual(CustomLevels.storageKey(0), 'custom_01')
  assert.strictEqual(CustomLevels.storageKey(11), 'custom_12')
  assert.strictEqual(CustomLevels.storageKey(12), null)
  await migrationTests()
  await storeAndProtocolTests()
  viewModelTests()
  slideTests()
  await gameAndCompleteTests()
  console.log('✓ 连续存储、迁移、全局串行写入、列表协议、分页边界、删除压缩和自定义游戏路由通过')
}

run().catch((error) => { console.error(error); process.exitCode = 1 })
